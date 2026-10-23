import "server-only";
import { and, count, desc, eq, gte, ilike, lt, or, sql } from "drizzle-orm";
import { guests, hotels, payments, reservations, rooms, users } from "@/db/schema";
import { db, type DbExecutor } from "@/lib/db";
import {
  ConflictError,
  NotFoundError,
  PG_UNIQUE_VIOLATION,
  ValidationError,
  pgConstraint,
  pgErrorCode,
} from "@/lib/errors";
import { fromCents, toCents, formatCents } from "@/lib/utils/money";
import { addDaysISO, isISODate } from "@/lib/utils/dates";
import { idSchema } from "@/lib/validations/common";
import {
  paymentListQuerySchema,
  recordPaymentSchema,
  refundPaymentSchema,
  voidSchema,
} from "@/lib/validations/payment";
import { assertCan, type Actor } from "../actor";
import { writeAudit } from "../audit";
import { getReservationBalance } from "./balances";
import { getHotelOrThrow, likePattern, paginated, parseInput } from "./common";

type PaymentRow = typeof payments.$inferSelect;
export type PaymentResult = { payment: PaymentRow; duplicate: boolean };

async function findByIdempotencyKey(tx: DbExecutor, key: string) {
  return tx.query.payments.findFirst({ where: eq(payments.idempotencyKey, key) });
}

/** Returns the earlier payment for a repeated submission, or rejects a key reused for different data. */
function resolveDuplicate(
  existing: PaymentRow,
  expected: { reservationId: string; amount: string; kind: "payment" | "refund" },
): PaymentResult {
  if (
    existing.reservationId !== expected.reservationId ||
    existing.kind !== expected.kind ||
    toCents(existing.amount) !== toCents(expected.amount)
  ) {
    throw new ConflictError("This submission key was already used for a different transaction.");
  }
  return { payment: existing, duplicate: true };
}

/**
 * Records a payment inside an existing transaction. The reservation row is
 * locked so concurrent payments are serialised and the balance check is exact.
 */
export async function recordPaymentTx(
  tx: DbExecutor,
  actor: Actor,
  input: {
    reservationId: string;
    amount: string;
    method: PaymentRow["method"];
    transactionReference: string | null;
    notes?: string | null;
    idempotencyKey: string;
  },
): Promise<PaymentResult> {
  const existing = await findByIdempotencyKey(tx, input.idempotencyKey);
  if (existing) return resolveDuplicate(existing, { ...input, kind: "payment" });

  const [reservation] = await tx
    .select()
    .from(reservations)
    .where(and(eq(reservations.id, input.reservationId), eq(reservations.hotelId, actor.hotelId)))
    .for("update");
  if (!reservation) throw new NotFoundError("Reservation");

  const hotel = await getHotelOrThrow(tx, actor.hotelId);
  if (!hotel.enabledPaymentMethods.includes(input.method)) {
    throw new ValidationError("This payment method is not enabled for the hotel.", {
      fieldErrors: { method: "Payment method not enabled" },
    });
  }

  const balance = await getReservationBalance(tx, reservation);
  const amountCents = toCents(input.amount);
  if (balance.balance <= 0) {
    throw new ConflictError("This reservation has no outstanding balance.");
  }
  if (amountCents > balance.balance) {
    throw new ValidationError(
      `Amount exceeds the outstanding balance of ${formatCents(balance.balance, hotel.currency)}.`,
      { fieldErrors: { amount: "Amount exceeds outstanding balance" } },
    );
  }

  const [payment] = await tx
    .insert(payments)
    .values({
      reservationId: reservation.id,
      kind: "payment",
      amount: fromCents(amountCents),
      method: input.method,
      transactionReference: input.transactionReference,
      notes: input.notes ?? null,
      idempotencyKey: input.idempotencyKey,
      receivedBy: actor.id,
    })
    .returning();

  await writeAudit(tx, actor, {
    action: "payment.recorded",
    entityType: "payment",
    entityId: payment.id,
    metadata: {
      reservationId: reservation.id,
      reservationNumber: reservation.reservationNumber,
      amount: payment.amount,
      method: payment.method,
      balanceBefore: fromCents(balance.balance),
      balanceAfter: fromCents(balance.balance - amountCents),
    },
  });
  return { payment, duplicate: false };
}

/** Runs a payment-writing transaction; a concurrent duplicate key resolves to the stored row. */
async function withIdempotency(
  key: string,
  expected: { reservationId: string; amount: string; kind: "payment" | "refund" },
  run: () => Promise<PaymentResult>,
): Promise<PaymentResult> {
  try {
    return await run();
  } catch (err) {
    if (pgErrorCode(err) === PG_UNIQUE_VIOLATION && pgConstraint(err) === "payments_idempotency_key_unique") {
      const existing = await findByIdempotencyKey(db, key);
      if (existing) return resolveDuplicate(existing, expected);
    }
    throw err;
  }
}

export async function recordPayment(actor: Actor, input: unknown): Promise<PaymentResult> {
  assertCan(actor, "payments:record");
  const data = parseInput(recordPaymentSchema, input);
  return withIdempotency(data.idempotencyKey, { ...data, kind: "payment" }, () =>
    db.transaction((tx) => recordPaymentTx(tx, actor, data)),
  );
}

/** Refunds part or all of a completed payment as a new, linked ledger row. */
export async function refundPayment(actor: Actor, paymentId: string, input: unknown): Promise<PaymentResult> {
  assertCan(actor, "payments:refund");
  const id = parseInput(idSchema, paymentId);
  const data = parseInput(refundPaymentSchema, input);

  const run = () =>
    db.transaction(async (tx) => {
      const existing = await findByIdempotencyKey(tx, data.idempotencyKey);
      if (existing) {
        return resolveDuplicate(existing, { reservationId: existing.reservationId, amount: data.amount, kind: "refund" });
      }
      const [original] = await tx
        .select({ payment: payments, hotelId: reservations.hotelId, reservationNumber: reservations.reservationNumber })
        .from(payments)
        .innerJoin(reservations, eq(reservations.id, payments.reservationId))
        .where(eq(payments.id, id))
        .for("update", { of: payments });
      if (!original || original.hotelId !== actor.hotelId) throw new NotFoundError("Payment");
      const p = original.payment;
      if (p.kind !== "payment") throw new ValidationError("Only payments can be refunded.");
      if (p.status !== "completed") throw new ConflictError("A voided payment cannot be refunded.");

      const [{ refunded }] = await tx
        .select({ refunded: sql<string>`coalesce(sum(${payments.amount}), 0)` })
        .from(payments)
        .where(and(eq(payments.refundOfPaymentId, p.id), eq(payments.status, "completed")));
      const refundable = toCents(p.amount) - toCents(refunded);
      const amountCents = toCents(data.amount);
      if (amountCents > refundable) {
        throw new ValidationError(`Refund exceeds the refundable amount of ${fromCents(refundable)}.`, {
          fieldErrors: { amount: "Exceeds refundable amount" },
        });
      }

      const [refund] = await tx
        .insert(payments)
        .values({
          reservationId: p.reservationId,
          kind: "refund",
          amount: fromCents(amountCents),
          method: data.method ?? p.method,
          transactionReference: data.transactionReference,
          notes: data.reason,
          refundOfPaymentId: p.id,
          idempotencyKey: data.idempotencyKey,
          receivedBy: actor.id,
        })
        .returning();
      await writeAudit(tx, actor, {
        action: "payment.refunded",
        entityType: "payment",
        entityId: refund.id,
        metadata: {
          originalPaymentId: p.id,
          reservationNumber: original.reservationNumber,
          amount: refund.amount,
          reason: data.reason,
        },
      });
      return { payment: refund, duplicate: false };
    });

  try {
    return await run();
  } catch (err) {
    if (pgErrorCode(err) === PG_UNIQUE_VIOLATION) {
      const existing = await findByIdempotencyKey(db, data.idempotencyKey);
      if (existing) return resolveDuplicate(existing, { reservationId: existing.reservationId, amount: data.amount, kind: "refund" });
    }
    throw err;
  }
}

/** Voids an entry recorded in error. The row is kept and marked voided (admin only). */
export async function voidPayment(actor: Actor, paymentId: string, input: unknown) {
  assertCan(actor, "payments:void");
  const id = parseInput(idSchema, paymentId);
  const { reason } = parseInput(voidSchema, input);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ payment: payments, hotelId: reservations.hotelId, reservationNumber: reservations.reservationNumber })
      .from(payments)
      .innerJoin(reservations, eq(reservations.id, payments.reservationId))
      .where(eq(payments.id, id))
      .for("update", { of: payments });
    if (!row || row.hotelId !== actor.hotelId) throw new NotFoundError("Payment");
    if (row.payment.status === "voided") throw new ConflictError("This entry is already voided.");
    if (row.payment.kind === "payment") {
      const [{ n }] = await tx
        .select({ n: count() })
        .from(payments)
        .where(and(eq(payments.refundOfPaymentId, id), eq(payments.status, "completed")));
      if (n > 0) throw new ConflictError("Void the refunds linked to this payment first.");
    }
    const [updated] = await tx
      .update(payments)
      .set({ status: "voided", voidedAt: new Date(), voidedBy: actor.id, voidReason: reason })
      .where(eq(payments.id, id))
      .returning();
    await writeAudit(tx, actor, {
      action: "payment.voided",
      entityType: "payment",
      entityId: id,
      metadata: { kind: updated.kind, amount: updated.amount, reservationNumber: row.reservationNumber, reason },
    });
    return updated;
  });
}

export async function listPayments(actor: Actor, input: unknown) {
  assertCan(actor, "payments:view");
  const q = parseInput(paymentListQuerySchema, input);
  const hotel = await getHotelOrThrow(db, actor.hotelId);
  const tz = hotel.timezone;
  const conditions = [eq(reservations.hotelId, actor.hotelId)];
  // Date filters are hotel-local calendar days.
  if (q.from && isISODate(q.from)) {
    conditions.push(gte(payments.paidAt, sql`(${q.from}::date)::timestamp AT TIME ZONE ${tz}`));
  }
  if (q.to && isISODate(q.to)) {
    conditions.push(lt(payments.paidAt, sql`(${addDaysISO(q.to, 1)}::date)::timestamp AT TIME ZONE ${tz}`));
  }
  if (q.method) conditions.push(eq(payments.method, q.method));
  if (q.status) conditions.push(eq(payments.status, q.status));
  if (q.kind) conditions.push(eq(payments.kind, q.kind));
  if (q.q) {
    const p = likePattern(q.q);
    conditions.push(
      or(
        ilike(reservations.reservationNumber, p),
        ilike(sql`${guests.firstName} || ' ' || ${guests.lastName}`, p),
        ilike(payments.transactionReference, p),
      )!,
    );
  }
  const where = and(...conditions);
  const base = db
    .select({ n: count() })
    .from(payments)
    .innerJoin(reservations, eq(reservations.id, payments.reservationId))
    .innerJoin(guests, eq(guests.id, reservations.guestId))
    .where(where);
  const [[{ n: total }], [sums], rows] = await Promise.all([
    base,
    db
      .select({
        collected: sql<string>`coalesce(sum(case when ${payments.kind} = 'payment' then ${payments.amount} else -${payments.amount} end) filter (where ${payments.status} = 'completed'), 0)`,
      })
      .from(payments)
      .innerJoin(reservations, eq(reservations.id, payments.reservationId))
      .innerJoin(guests, eq(guests.id, reservations.guestId))
      .where(where),
    db
      .select({
        id: payments.id,
        kind: payments.kind,
        amount: payments.amount,
        method: payments.method,
        status: payments.status,
        transactionReference: payments.transactionReference,
        paidAt: payments.paidAt,
        reservationId: reservations.id,
        reservationNumber: reservations.reservationNumber,
        guestName: sql<string>`${guests.firstName} || ' ' || ${guests.lastName}`,
        receivedByName: users.name,
      })
      .from(payments)
      .innerJoin(reservations, eq(reservations.id, payments.reservationId))
      .innerJoin(guests, eq(guests.id, reservations.guestId))
      .innerJoin(users, eq(users.id, payments.receivedBy))
      .where(where)
      .orderBy(desc(payments.paidAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
  ]);
  return { ...paginated(rows, total, q.page, q.pageSize), netCollected: sums?.collected ?? "0" };
}

export async function getPaymentReceipt(actor: Actor, paymentId: string) {
  assertCan(actor, "payments:view");
  const id = parseInput(idSchema, paymentId);
  const [row] = await db
    .select({
      payment: payments,
      reservation: reservations,
      guest: { firstName: guests.firstName, lastName: guests.lastName, email: guests.email, phone: guests.phone },
      roomNumber: rooms.roomNumber,
      receivedByName: users.name,
      hotel: hotels,
    })
    .from(payments)
    .innerJoin(reservations, eq(reservations.id, payments.reservationId))
    .innerJoin(guests, eq(guests.id, reservations.guestId))
    .innerJoin(rooms, eq(rooms.id, reservations.roomId))
    .innerJoin(users, eq(users.id, payments.receivedBy))
    .innerJoin(hotels, eq(hotels.id, reservations.hotelId))
    .where(and(eq(payments.id, id), eq(reservations.hotelId, actor.hotelId)));
  if (!row) throw new NotFoundError("Payment");
  const balance = await getReservationBalance(db, row.reservation);
  return { ...row, balance };
}
