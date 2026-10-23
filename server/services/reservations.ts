import "server-only";
import { and, asc, count, desc, eq, gte, ilike, lte, ne, or, sql, type SQL } from "drizzle-orm";
import {
  additionalCharges,
  guests,
  housekeepingTasks,
  payments,
  reservationNumberSeq,
  reservationStatusHistory,
  reservations,
  roomTypes,
  rooms,
  users,
} from "@/db/schema";
import { db, type DbExecutor } from "@/lib/db";
import {
  ConflictError,
  NotFoundError,
  PG_EXCLUSION_VIOLATION,
  ValidationError,
  pgErrorCode,
} from "@/lib/errors";
import { calculateStayPricing } from "@/lib/pricing";
import {
  canTransition,
  checkInDateProblem,
  editableFields,
  noShowDateProblem,
  STATUS_LABELS,
  type ReservationStatus,
} from "@/lib/reservation-rules";
import { fromCents, formatCents } from "@/lib/utils/money";
import { idSchema } from "@/lib/validations/common";
import {
  cancelReservationSchema,
  checkOutSchema,
  createReservationSchema,
  reservationListQuerySchema,
  updateReservationSchema,
} from "@/lib/validations/reservation";
import { assertCan, type Actor } from "../actor";
import { writeAudit } from "../audit";
import { lockRoomForStay } from "./availability";
import { getReservationBalance } from "./balances";
import { getHotelOrThrow, hotelToday, likePattern, paginated, parseInput } from "./common";
import { balanceSql } from "./finance-sql";
import { insertGuest } from "./guests";
import { recordPaymentTx } from "./payments";

type ReservationRow = typeof reservations.$inferSelect;

/** Converts a race lost to the exclusion constraint into a clear conflict error. */
async function withBookingConflictHandling<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (pgErrorCode(err) === PG_EXCLUSION_VIOLATION) {
      throw new ConflictError(
        "The room was booked for overlapping dates by another request. Choose a different room or dates.",
      );
    }
    throw err;
  }
}

async function nextReservationNumber(tx: DbExecutor): Promise<string> {
  const result = await tx.execute<{ n: string }>(sql`select nextval(${reservationNumberSeq.seqName}) as n`);
  const n = String(result.rows[0].n);
  const year = new Date().getUTCFullYear() % 100;
  return `R${String(year).padStart(2, "0")}-${n.padStart(6, "0")}`;
}

async function lockReservation(tx: DbExecutor, actor: Actor, id: string): Promise<ReservationRow> {
  const [row] = await tx
    .select()
    .from(reservations)
    .where(and(eq(reservations.id, id), eq(reservations.hotelId, actor.hotelId)))
    .for("update");
  if (!row) throw new NotFoundError("Reservation");
  return row;
}

function assertTransition(from: ReservationStatus, to: ReservationStatus) {
  if (!canTransition(from, to)) {
    throw new ConflictError(`A ${STATUS_LABELS[from].toLowerCase()} reservation cannot be changed to ${STATUS_LABELS[to].toLowerCase()}.`);
  }
}

async function recordStatusChange(
  tx: DbExecutor,
  actor: Actor,
  reservationId: string,
  from: ReservationStatus | null,
  to: ReservationStatus,
  note?: string | null,
) {
  await tx.insert(reservationStatusHistory).values({
    reservationId,
    fromStatus: from,
    toStatus: to,
    changedBy: actor.id,
    note: note ?? null,
  });
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createReservation(actor: Actor, input: unknown) {
  assertCan(actor, "reservations:manage");
  const data = parseInput(createReservationSchema, input);
  if (data.initialPayment) assertCan(actor, "payments:record");

  return withBookingConflictHandling(() =>
    db.transaction(async (tx) => {
      const hotel = await getHotelOrThrow(tx, actor.hotelId);
      const today = hotelToday(hotel);
      if (data.checkInDate < today) {
        throw new ValidationError("Check-in date cannot be in the past.", {
          fieldErrors: { checkInDate: "Date is in the past" },
        });
      }

      let guestId: string;
      if (data.guestId) {
        const guest = await tx.query.guests.findFirst({
          where: and(eq(guests.id, data.guestId), eq(guests.hotelId, actor.hotelId)),
        });
        if (!guest) throw new NotFoundError("Guest");
        guestId = guest.id;
      } else {
        assertCan(actor, "guests:manage");
        guestId = (await insertGuest(tx, actor, data.newGuest!)).id;
      }

      const room = await lockRoomForStay(tx, {
        hotelId: actor.hotelId,
        roomId: data.roomId,
        checkInDate: data.checkInDate,
        checkOutDate: data.checkOutDate,
        guests: data.adults + data.children,
      });

      const pricing = calculateStayPricing({
        checkInDate: data.checkInDate,
        checkOutDate: data.checkOutDate,
        nightlyRate: data.nightlyRate ?? room.basePrice,
        discountAmount: data.discountAmount,
        taxRate: hotel.taxRate,
      });

      const [reservation] = await tx
        .insert(reservations)
        .values({
          hotelId: actor.hotelId,
          reservationNumber: await nextReservationNumber(tx),
          guestId,
          roomId: room.id,
          checkInDate: data.checkInDate,
          checkOutDate: data.checkOutDate,
          adults: data.adults,
          children: data.children,
          status: data.status,
          nightlyRate: pricing.nightlyRate,
          subtotal: pricing.subtotal,
          discountAmount: pricing.discountAmount,
          taxRate: pricing.taxRate,
          taxAmount: pricing.taxAmount,
          totalAmount: pricing.totalAmount,
          specialRequests: data.specialRequests,
          createdBy: actor.id,
        })
        .returning();

      await recordStatusChange(tx, actor, reservation.id, null, reservation.status, "Created");
      await writeAudit(tx, actor, {
        action: "reservation.created",
        entityType: "reservation",
        entityId: reservation.id,
        metadata: {
          reservationNumber: reservation.reservationNumber,
          roomNumber: room.roomNumber,
          checkInDate: reservation.checkInDate,
          checkOutDate: reservation.checkOutDate,
          totalAmount: reservation.totalAmount,
          status: reservation.status,
        },
      });

      if (data.initialPayment) {
        await recordPaymentTx(tx, actor, { reservationId: reservation.id, ...data.initialPayment });
      }
      return reservation;
    }),
  );
}

// ---------------------------------------------------------------------------
// Update (dates, room, guests, rate, discount)
// ---------------------------------------------------------------------------

export async function updateReservation(actor: Actor, reservationId: string, input: unknown) {
  assertCan(actor, "reservations:manage");
  const id = parseInput(idSchema, reservationId);
  const data = parseInput(updateReservationSchema, input);

  return withBookingConflictHandling(() =>
    db.transaction(async (tx) => {
      const current = await lockReservation(tx, actor, id);
      const hotel = await getHotelOrThrow(tx, actor.hotelId);
      const today = hotelToday(hotel);
      const scope = editableFields(current.status);
      if (scope === "none") {
        throw new ConflictError(`A ${STATUS_LABELS[current.status].toLowerCase()} reservation cannot be modified.`);
      }

      const next = {
        roomId: data.roomId ?? current.roomId,
        checkInDate: data.checkInDate ?? current.checkInDate,
        checkOutDate: data.checkOutDate ?? current.checkOutDate,
        adults: data.adults ?? current.adults,
        children: data.children ?? current.children,
        nightlyRate: data.nightlyRate ?? current.nightlyRate,
        discountAmount: data.discountAmount ?? current.discountAmount,
        specialRequests: data.specialRequests !== undefined ? data.specialRequests : current.specialRequests,
      };

      if (scope === "in_house") {
        // The guest is in the room: arrival date and room are fixed facts.
        if (next.roomId !== current.roomId || next.checkInDate !== current.checkInDate) {
          throw new ConflictError("The room and arrival date of an in-house guest cannot be changed here.");
        }
        if (next.checkOutDate <= today) {
          throw new ValidationError("For an in-house guest the departure date must be after today. Use check-out to end the stay.", {
            fieldErrors: { checkOutDate: "Must be after today" },
          });
        }
      } else if (next.checkInDate !== current.checkInDate && next.checkInDate < today) {
        throw new ValidationError("Check-in date cannot be in the past.", {
          fieldErrors: { checkInDate: "Date is in the past" },
        });
      }
      if (next.checkOutDate <= next.checkInDate) {
        throw new ValidationError("Check-out must be after check-in.", {
          fieldErrors: { checkOutDate: "Must be after check-in" },
        });
      }

      // Re-check availability, capacity and room status whenever anything that
      // affects inventory changes. The reservation itself is excluded.
      const inventoryChanged =
        next.roomId !== current.roomId ||
        next.checkInDate !== current.checkInDate ||
        next.checkOutDate !== current.checkOutDate ||
        next.adults + next.children !== current.adults + current.children;
      let roomNumber: string | undefined;
      if (inventoryChanged) {
        const room = await lockRoomForStay(tx, {
          hotelId: actor.hotelId,
          roomId: next.roomId,
          checkInDate: next.checkInDate,
          checkOutDate: next.checkOutDate,
          guests: next.adults + next.children,
          excludeReservationId: current.id,
        });
        roomNumber = room.roomNumber;
        // Moving to a different room type without an explicit rate uses that type's base price.
        if (next.roomId !== current.roomId && data.nightlyRate === undefined) {
          const [oldRoom] = await tx.select({ roomTypeId: rooms.roomTypeId }).from(rooms).where(eq(rooms.id, current.roomId));
          if (oldRoom?.roomTypeId !== room.roomTypeId) next.nightlyRate = room.basePrice;
        }
      }

      const pricing = calculateStayPricing({
        checkInDate: next.checkInDate,
        checkOutDate: next.checkOutDate,
        nightlyRate: next.nightlyRate,
        discountAmount: next.discountAmount,
        taxRate: current.taxRate,
      });

      const [updated] = await tx
        .update(reservations)
        .set({
          roomId: next.roomId,
          checkInDate: next.checkInDate,
          checkOutDate: next.checkOutDate,
          adults: next.adults,
          children: next.children,
          specialRequests: next.specialRequests,
          nightlyRate: pricing.nightlyRate,
          subtotal: pricing.subtotal,
          discountAmount: pricing.discountAmount,
          taxAmount: pricing.taxAmount,
          totalAmount: pricing.totalAmount,
        })
        .where(eq(reservations.id, id))
        .returning();

      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const key of ["roomId", "checkInDate", "checkOutDate", "adults", "children", "nightlyRate", "discountAmount", "totalAmount"] as const) {
        if (String(current[key]) !== String(updated[key])) changes[key] = { from: current[key], to: updated[key] };
      }
      await writeAudit(tx, actor, {
        action: "reservation.updated",
        entityType: "reservation",
        entityId: id,
        metadata: { reservationNumber: current.reservationNumber, changes, ...(roomNumber ? { roomNumber } : {}) },
      });
      return updated;
    }),
  );
}

// ---------------------------------------------------------------------------
// Lifecycle transitions
// ---------------------------------------------------------------------------

export async function confirmReservation(actor: Actor, reservationId: string) {
  assertCan(actor, "reservations:manage");
  const id = parseInput(idSchema, reservationId);
  return db.transaction(async (tx) => {
    const r = await lockReservation(tx, actor, id);
    assertTransition(r.status, "confirmed");
    const [updated] = await tx.update(reservations).set({ status: "confirmed" }).where(eq(reservations.id, id)).returning();
    await recordStatusChange(tx, actor, id, r.status, "confirmed");
    await writeAudit(tx, actor, {
      action: "reservation.confirmed",
      entityType: "reservation",
      entityId: id,
      metadata: { reservationNumber: r.reservationNumber },
    });
    return updated;
  });
}

export async function cancelReservation(actor: Actor, reservationId: string, input: unknown) {
  assertCan(actor, "reservations:manage");
  const id = parseInput(idSchema, reservationId);
  const { reason } = parseInput(cancelReservationSchema, input);
  return db.transaction(async (tx) => {
    const r = await lockReservation(tx, actor, id);
    assertTransition(r.status, "cancelled");
    const [updated] = await tx
      .update(reservations)
      .set({ status: "cancelled", cancelledAt: new Date(), cancellationReason: reason })
      .where(eq(reservations.id, id))
      .returning();
    const balance = await getReservationBalance(tx, updated);
    await recordStatusChange(tx, actor, id, r.status, "cancelled", reason);
    await writeAudit(tx, actor, {
      action: "reservation.cancelled",
      entityType: "reservation",
      entityId: id,
      metadata: { reservationNumber: r.reservationNumber, reason, creditDue: fromCents(Math.max(0, -balance.balance)) },
    });
    return { reservation: updated, balance };
  });
}

export async function markNoShow(actor: Actor, reservationId: string) {
  assertCan(actor, "frontdesk:operate");
  const id = parseInput(idSchema, reservationId);
  return db.transaction(async (tx) => {
    const r = await lockReservation(tx, actor, id);
    assertTransition(r.status, "no_show");
    const hotel = await getHotelOrThrow(tx, actor.hotelId);
    const problem = noShowDateProblem(r, hotelToday(hotel));
    if (problem) throw new ConflictError(problem);
    const [updated] = await tx.update(reservations).set({ status: "no_show" }).where(eq(reservations.id, id)).returning();
    await recordStatusChange(tx, actor, id, r.status, "no_show");
    await writeAudit(tx, actor, {
      action: "reservation.no_show",
      entityType: "reservation",
      entityId: id,
      metadata: { reservationNumber: r.reservationNumber },
    });
    return updated;
  });
}

export async function checkIn(actor: Actor, reservationId: string) {
  assertCan(actor, "frontdesk:operate");
  const id = parseInput(idSchema, reservationId);
  return db.transaction(async (tx) => {
    const r = await lockReservation(tx, actor, id);
    assertTransition(r.status, "checked_in");
    const hotel = await getHotelOrThrow(tx, actor.hotelId);
    const problem = checkInDateProblem(r, hotelToday(hotel));
    if (problem) throw new ConflictError(problem);

    const [room] = await tx.select().from(rooms).where(eq(rooms.id, r.roomId)).for("update");
    if (!room) throw new NotFoundError("Room");
    if (room.operationalStatus !== "in_service") {
      throw new ConflictError(`Room ${room.roomNumber} is not in service. Move the reservation to another room.`);
    }
    if (room.housekeepingStatus !== "clean" && room.housekeepingStatus !== "inspected") {
      throw new ConflictError(`Room ${room.roomNumber} is ${room.housekeepingStatus}. It must be clean or inspected before check-in.`);
    }
    // A previous guest may still be in the room (e.g. a late departure).
    const [occupant] = await tx
      .select({ reservationNumber: reservations.reservationNumber })
      .from(reservations)
      .where(and(eq(reservations.roomId, room.id), eq(reservations.status, "checked_in"), ne(reservations.id, id)))
      .limit(1);
    if (occupant) {
      throw new ConflictError(`Room ${room.roomNumber} is still occupied (${occupant.reservationNumber}). Check that guest out first.`);
    }

    const [updated] = await tx
      .update(reservations)
      .set({ status: "checked_in", checkedInAt: new Date() })
      .where(eq(reservations.id, id))
      .returning();
    await recordStatusChange(tx, actor, id, r.status, "checked_in");
    await writeAudit(tx, actor, {
      action: "reservation.checked_in",
      entityType: "reservation",
      entityId: id,
      metadata: { reservationNumber: r.reservationNumber, roomNumber: room.roomNumber },
    });
    return updated;
  });
}

export async function checkOut(actor: Actor, reservationId: string, input: unknown) {
  assertCan(actor, "frontdesk:operate");
  const id = parseInput(idSchema, reservationId);
  const { acknowledgeOutstandingBalance } = parseInput(checkOutSchema, input ?? {});
  return db.transaction(async (tx) => {
    const r = await lockReservation(tx, actor, id);
    assertTransition(r.status, "checked_out");
    const hotel = await getHotelOrThrow(tx, actor.hotelId);
    const balance = await getReservationBalance(tx, r);
    if (balance.balance > 0 && !acknowledgeOutstandingBalance) {
      throw new ConflictError(
        `Outstanding balance of ${formatCents(balance.balance, hotel.currency)}. Record the payment or confirm check-out with an unpaid balance.`,
        { balanceCents: balance.balance },
      );
    }

    const [updated] = await tx
      .update(reservations)
      .set({ status: "checked_out", checkedOutAt: new Date() })
      .where(eq(reservations.id, id))
      .returning();

    // The vacated room needs cleaning. Operational status is untouched.
    await tx.update(rooms).set({ housekeepingStatus: "dirty" }).where(eq(rooms.id, r.roomId));
    const today = hotelToday(hotel);
    const [arrival] = await tx
      .select({ id: reservations.id })
      .from(reservations)
      .where(
        and(
          eq(reservations.roomId, r.roomId),
          eq(reservations.checkInDate, today),
          or(eq(reservations.status, "confirmed"), eq(reservations.status, "pending")),
        ),
      )
      .limit(1);
    await tx.insert(housekeepingTasks).values({
      roomId: r.roomId,
      type: "checkout_clean",
      priority: arrival ? "high" : "normal",
      notes: arrival ? "Same-day arrival expected" : null,
      createdBy: actor.id,
    });

    await recordStatusChange(
      tx,
      actor,
      id,
      r.status,
      "checked_out",
      balance.balance > 0 ? `Checked out with unpaid balance ${fromCents(balance.balance)}` : null,
    );
    await writeAudit(tx, actor, {
      action: "reservation.checked_out",
      entityType: "reservation",
      entityId: id,
      metadata: {
        reservationNumber: r.reservationNumber,
        outstandingBalance: fromCents(balance.balance),
        acknowledgedUnpaid: balance.balance > 0,
      },
    });
    return { reservation: updated, balance };
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

const guestNameSql = sql<string>`${guests.firstName} || ' ' || ${guests.lastName}`;

export async function listReservations(actor: Actor, input: unknown) {
  assertCan(actor, "reservations:view");
  const q = parseInput(reservationListQuerySchema, input);
  const conditions: (SQL | undefined)[] = [eq(reservations.hotelId, actor.hotelId)];
  if (q.q) {
    const p = likePattern(q.q);
    conditions.push(
      or(
        ilike(reservations.reservationNumber, p),
        ilike(guestNameSql, p),
        ilike(guests.phone, p),
        ilike(guests.email, p),
      ),
    );
  }
  if (q.status) conditions.push(eq(reservations.status, q.status));
  // Date range selects stays that overlap [from, to].
  if (q.from) conditions.push(gte(reservations.checkOutDate, q.from));
  if (q.to) conditions.push(lte(reservations.checkInDate, q.to));
  if (q.roomTypeId) conditions.push(eq(rooms.roomTypeId, q.roomTypeId));
  const where = and(...conditions);

  const sortColumn = {
    checkInDate: reservations.checkInDate,
    checkOutDate: reservations.checkOutDate,
    createdAt: reservations.createdAt,
    reservationNumber: reservations.reservationNumber,
    totalAmount: reservations.totalAmount,
    guestName: guests.lastName,
  }[q.sort];
  const order = q.dir === "asc" ? asc(sortColumn) : desc(sortColumn);

  const [[{ total }], rows] = await Promise.all([
    db
      .select({ total: count() })
      .from(reservations)
      .innerJoin(guests, eq(guests.id, reservations.guestId))
      .innerJoin(rooms, eq(rooms.id, reservations.roomId))
      .where(where),
    db
      .select({
        id: reservations.id,
        reservationNumber: reservations.reservationNumber,
        status: reservations.status,
        checkInDate: reservations.checkInDate,
        checkOutDate: reservations.checkOutDate,
        adults: reservations.adults,
        children: reservations.children,
        totalAmount: reservations.totalAmount,
        createdAt: reservations.createdAt,
        guestId: guests.id,
        guestName: guestNameSql,
        guestPhone: guests.phone,
        roomNumber: rooms.roomNumber,
        roomTypeName: roomTypes.name,
        balance: balanceSql,
      })
      .from(reservations)
      .innerJoin(guests, eq(guests.id, reservations.guestId))
      .innerJoin(rooms, eq(rooms.id, reservations.roomId))
      .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
      .where(where)
      .orderBy(order, desc(reservations.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
  ]);
  return paginated(rows, total, q.page, q.pageSize);
}

export async function getReservationDetail(actor: Actor, reservationId: string) {
  assertCan(actor, "reservations:view");
  const id = parseInput(idSchema, reservationId);
  const reservation = await db.query.reservations.findFirst({
    where: and(eq(reservations.id, id), eq(reservations.hotelId, actor.hotelId)),
    with: {
      guest: true,
      room: { with: { roomType: true } },
      creator: { columns: { id: true, name: true } },
    },
  });
  if (!reservation) throw new NotFoundError("Reservation");

  const [paymentRows, chargeRows, history, balance] = await Promise.all([
    db
      .select({
        id: payments.id,
        kind: payments.kind,
        amount: payments.amount,
        method: payments.method,
        status: payments.status,
        transactionReference: payments.transactionReference,
        notes: payments.notes,
        refundOfPaymentId: payments.refundOfPaymentId,
        paidAt: payments.paidAt,
        voidReason: payments.voidReason,
        receivedByName: users.name,
      })
      .from(payments)
      .innerJoin(users, eq(users.id, payments.receivedBy))
      .where(eq(payments.reservationId, id))
      .orderBy(asc(payments.paidAt)),
    db
      .select({
        id: additionalCharges.id,
        description: additionalCharges.description,
        quantity: additionalCharges.quantity,
        unitPrice: additionalCharges.unitPrice,
        totalAmount: additionalCharges.totalAmount,
        status: additionalCharges.status,
        voidReason: additionalCharges.voidReason,
        createdAt: additionalCharges.createdAt,
        createdByName: users.name,
      })
      .from(additionalCharges)
      .innerJoin(users, eq(users.id, additionalCharges.createdBy))
      .where(eq(additionalCharges.reservationId, id))
      .orderBy(asc(additionalCharges.createdAt)),
    db
      .select({
        id: reservationStatusHistory.id,
        fromStatus: reservationStatusHistory.fromStatus,
        toStatus: reservationStatusHistory.toStatus,
        note: reservationStatusHistory.note,
        createdAt: reservationStatusHistory.createdAt,
        changedByName: users.name,
      })
      .from(reservationStatusHistory)
      .innerJoin(users, eq(users.id, reservationStatusHistory.changedBy))
      .where(eq(reservationStatusHistory.reservationId, id))
      .orderBy(asc(reservationStatusHistory.createdAt)),
    getReservationBalance(db, reservation),
  ]);

  return { reservation, payments: paymentRows, charges: chargeRows, history, balance };
}

/** Reservations with an outstanding (positive) balance, for payment lookup. */
export async function findReservationsForPayment(actor: Actor, query: string) {
  assertCan(actor, "payments:view");
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return [];
  const p = likePattern(q);
  return db
    .select({
      id: reservations.id,
      reservationNumber: reservations.reservationNumber,
      status: reservations.status,
      checkInDate: reservations.checkInDate,
      checkOutDate: reservations.checkOutDate,
      guestName: guestNameSql,
      roomNumber: rooms.roomNumber,
      balance: balanceSql,
    })
    .from(reservations)
    .innerJoin(guests, eq(guests.id, reservations.guestId))
    .innerJoin(rooms, eq(rooms.id, reservations.roomId))
    .where(
      and(
        eq(reservations.hotelId, actor.hotelId),
        or(ilike(reservations.reservationNumber, p), ilike(guestNameSql, p), ilike(guests.phone, p)),
      ),
    )
    .orderBy(desc(reservations.checkInDate))
    .limit(10);
}
