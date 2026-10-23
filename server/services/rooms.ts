import "server-only";
import { and, asc, count, eq, gte, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { guests, reservations, roomTypes, rooms } from "@/db/schema";
import { db } from "@/lib/db";
import { ConflictError, NotFoundError, PG_UNIQUE_VIOLATION, pgErrorCode } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { BLOCKING_STATUSES } from "@/lib/reservation-rules";
import { idSchema, operationalStatusSchema } from "@/lib/validations/common";
import { roomInputSchema, roomStatusSchema, roomTypeInputSchema } from "@/lib/validations/room";
import { assertCan, type Actor } from "../actor";
import { writeAudit } from "../audit";
import { getHotelOrThrow, hotelToday, likePattern, parseInput } from "./common";
import { qc } from "./sql-helpers";

async function uniqueViolationAs<T>(fn: () => Promise<T>, message: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (pgErrorCode(err) === PG_UNIQUE_VIOLATION) throw new ConflictError(message);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Room types
// ---------------------------------------------------------------------------

export async function listRoomTypes(actor: Actor, opts: { includeInactive?: boolean } = {}) {
  assertCan(actor, "housekeeping:view");
  return db
    .select({
      id: roomTypes.id,
      name: roomTypes.name,
      description: roomTypes.description,
      capacity: roomTypes.capacity,
      basePrice: roomTypes.basePrice,
      amenities: roomTypes.amenities,
      active: roomTypes.active,
      roomCount: sql<number>`(select count(*)::int from ${rooms} where ${qc(rooms.roomTypeId)} = ${qc(roomTypes.id)} and ${qc(rooms.archivedAt)} is null)`,
    })
    .from(roomTypes)
    .where(and(eq(roomTypes.hotelId, actor.hotelId), opts.includeInactive ? undefined : eq(roomTypes.active, true)))
    .orderBy(asc(roomTypes.basePrice), asc(roomTypes.name));
}

export async function createRoomType(actor: Actor, input: unknown) {
  assertCan(actor, "roomTypes:manage");
  const data = parseInput(roomTypeInputSchema, input);
  return uniqueViolationAs(
    () =>
      db.transaction(async (tx) => {
        const [rt] = await tx.insert(roomTypes).values({ ...data, hotelId: actor.hotelId }).returning();
        await writeAudit(tx, actor, {
          action: "room_type.created",
          entityType: "room_type",
          entityId: rt.id,
          metadata: { name: rt.name, basePrice: rt.basePrice, capacity: rt.capacity },
        });
        return rt;
      }),
    "A room type with this name already exists.",
  );
}

export async function updateRoomType(actor: Actor, roomTypeId: string, input: unknown) {
  assertCan(actor, "roomTypes:manage");
  const id = parseInput(idSchema, roomTypeId);
  const data = parseInput(roomTypeInputSchema, input);
  return uniqueViolationAs(
    () =>
      db.transaction(async (tx) => {
        const before = await tx.query.roomTypes.findFirst({
          where: and(eq(roomTypes.id, id), eq(roomTypes.hotelId, actor.hotelId)),
        });
        if (!before) throw new NotFoundError("Room type");
        const [rt] = await tx.update(roomTypes).set(data).where(eq(roomTypes.id, id)).returning();
        await writeAudit(tx, actor, {
          action: "room_type.updated",
          entityType: "room_type",
          entityId: id,
          metadata: {
            name: rt.name,
            basePrice: { from: before.basePrice, to: rt.basePrice },
            capacity: { from: before.capacity, to: rt.capacity },
            active: rt.active,
          },
        });
        return rt;
      }),
    "A room type with this name already exists.",
  );
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

export const roomListQuerySchema = z.object({
  q: z.string().trim().max(50).optional(),
  floor: z.coerce.number().int().optional(),
  roomTypeId: idSchema.optional(),
  operationalStatus: operationalStatusSchema.optional(),
  housekeepingStatus: z.enum(["dirty", "cleaning", "clean", "inspected"]).optional(),
  occupancy: z.enum(["occupied", "vacant"]).optional(),
});

/** Rooms with derived occupancy. Guest names are only included for roles that may see guests. */
export async function listRooms(actor: Actor, input: unknown = {}) {
  assertCan(actor, "housekeeping:view");
  const q = parseInput(roomListQuerySchema, input);
  const hotel = await getHotelOrThrow(db, actor.hotelId);
  const today = hotelToday(hotel);
  const showGuests = can(actor.role, "guests:view");

  const occupantSql = sql<string | null>`(
    select ${qc(reservations.id)} from ${reservations}
    where ${qc(reservations.roomId)} = ${qc(rooms.id)} and ${qc(reservations.status)} = 'checked_in'
    limit 1
  )`;

  const rows = await db
    .select({
      id: rooms.id,
      roomNumber: rooms.roomNumber,
      floor: rooms.floor,
      operationalStatus: rooms.operationalStatus,
      housekeepingStatus: rooms.housekeepingStatus,
      notes: rooms.notes,
      roomTypeId: roomTypes.id,
      roomTypeName: roomTypes.name,
      capacity: roomTypes.capacity,
      basePrice: roomTypes.basePrice,
      occupyingReservationId: occupantSql,
      arrivingToday: sql<boolean>`exists(
        select 1 from ${reservations} where ${qc(reservations.roomId)} = ${qc(rooms.id)}
        and ${qc(reservations.checkInDate)} = ${today} and ${qc(reservations.status)} in ('pending', 'confirmed')
      )`,
      departingToday: sql<boolean>`exists(
        select 1 from ${reservations} where ${qc(reservations.roomId)} = ${qc(rooms.id)}
        and ${qc(reservations.checkOutDate)} <= ${today} and ${qc(reservations.status)} = 'checked_in'
      )`,
    })
    .from(rooms)
    .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
    .where(
      and(
        eq(rooms.hotelId, actor.hotelId),
        isNull(rooms.archivedAt),
        q.q ? ilike(rooms.roomNumber, likePattern(q.q)) : undefined,
        q.floor !== undefined ? eq(rooms.floor, q.floor) : undefined,
        q.roomTypeId ? eq(rooms.roomTypeId, q.roomTypeId) : undefined,
        q.operationalStatus ? eq(rooms.operationalStatus, q.operationalStatus) : undefined,
        q.housekeepingStatus ? eq(rooms.housekeepingStatus, q.housekeepingStatus) : undefined,
        q.occupancy === "occupied" ? sql`${occupantSql} is not null` : undefined,
        q.occupancy === "vacant" ? sql`${occupantSql} is null` : undefined,
      ),
    )
    .orderBy(asc(rooms.floor), asc(rooms.roomNumber));

  let occupantNames = new Map<string, string>();
  const occupantIds = rows.map((r) => r.occupyingReservationId).filter((v): v is string => Boolean(v));
  if (showGuests && occupantIds.length > 0) {
    const names = await db
      .select({ id: reservations.id, name: sql<string>`${guests.firstName} || ' ' || ${guests.lastName}` })
      .from(reservations)
      .innerJoin(guests, eq(guests.id, reservations.guestId))
      .where(inArray(reservations.id, occupantIds));
    occupantNames = new Map(names.map((n) => [n.id, n.name]));
  }

  return rows.map((r) => ({
    ...r,
    occupied: Boolean(r.occupyingReservationId),
    occupantName: r.occupyingReservationId ? (occupantNames.get(r.occupyingReservationId) ?? null) : null,
    basePrice: showGuests ? r.basePrice : null,
  }));
}

export async function getRoomDetail(actor: Actor, roomId: string) {
  assertCan(actor, "rooms:view");
  const id = parseInput(idSchema, roomId);
  const room = await db.query.rooms.findFirst({
    where: and(eq(rooms.id, id), eq(rooms.hotelId, actor.hotelId)),
    with: { roomType: true },
  });
  if (!room) throw new NotFoundError("Room");
  const hotel = await getHotelOrThrow(db, actor.hotelId);
  const today = hotelToday(hotel);
  const upcoming = await db
    .select({
      id: reservations.id,
      reservationNumber: reservations.reservationNumber,
      checkInDate: reservations.checkInDate,
      checkOutDate: reservations.checkOutDate,
      status: reservations.status,
      guestName: sql<string>`${guests.firstName} || ' ' || ${guests.lastName}`,
    })
    .from(reservations)
    .innerJoin(guests, eq(guests.id, reservations.guestId))
    .where(
      and(
        eq(reservations.roomId, id),
        inArray(reservations.status, [...BLOCKING_STATUSES]),
        or(gte(reservations.checkOutDate, today), eq(reservations.status, "checked_in")),
      ),
    )
    .orderBy(asc(reservations.checkInDate))
    .limit(20);
  return { room, upcoming };
}

export async function createRoom(actor: Actor, input: unknown) {
  assertCan(actor, "rooms:manage");
  const data = parseInput(roomInputSchema, input);
  return uniqueViolationAs(
    () =>
      db.transaction(async (tx) => {
        const rt = await tx.query.roomTypes.findFirst({
          where: and(eq(roomTypes.id, data.roomTypeId), eq(roomTypes.hotelId, actor.hotelId)),
        });
        if (!rt) throw new NotFoundError("Room type");
        const [room] = await tx
          .insert(rooms)
          .values({ ...data, hotelId: actor.hotelId, housekeepingStatus: "dirty" })
          .returning();
        await writeAudit(tx, actor, {
          action: "room.created",
          entityType: "room",
          entityId: room.id,
          metadata: { roomNumber: room.roomNumber, roomType: rt.name },
        });
        return room;
      }),
    "A room with this number already exists.",
  );
}

export async function updateRoom(actor: Actor, roomId: string, input: unknown) {
  assertCan(actor, "rooms:manage");
  const id = parseInput(idSchema, roomId);
  const data = parseInput(roomInputSchema, input);
  return uniqueViolationAs(
    () =>
      db.transaction(async (tx) => {
        const [current] = await tx
          .select({ room: rooms, capacity: roomTypes.capacity })
          .from(rooms)
          .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
          .where(and(eq(rooms.id, id), eq(rooms.hotelId, actor.hotelId)))
          .for("update", { of: rooms });
        if (!current) throw new NotFoundError("Room");
        const rt = await tx.query.roomTypes.findFirst({
          where: and(eq(roomTypes.id, data.roomTypeId), eq(roomTypes.hotelId, actor.hotelId)),
        });
        if (!rt) throw new NotFoundError("Room type");
        if (rt.capacity < current.capacity) {
          // Changing to a smaller type must not invalidate existing bookings.
          const [tooBig] = await tx
            .select({ n: count() })
            .from(reservations)
            .where(
              and(
                eq(reservations.roomId, id),
                inArray(reservations.status, [...BLOCKING_STATUSES]),
                sql`${reservations.adults} + ${reservations.children} > ${rt.capacity}`,
              ),
            );
          if (tooBig.n > 0) {
            throw new ConflictError(`${tooBig.n} active reservation(s) exceed the capacity of ${rt.name}.`);
          }
        }
        const [room] = await tx.update(rooms).set(data).where(eq(rooms.id, id)).returning();
        await writeAudit(tx, actor, {
          action: "room.updated",
          entityType: "room",
          entityId: id,
          metadata: { roomNumber: room.roomNumber, roomType: rt.name, floor: room.floor },
        });
        return room;
      }),
    "A room with this number already exists.",
  );
}

/**
 * Changes whether a room can be sold (maintenance blocking). A room with a
 * guest in it cannot be taken out of service. Future reservations are
 * reported so staff can move them.
 */
export async function setRoomOperationalStatus(actor: Actor, roomId: string, input: unknown) {
  assertCan(actor, "rooms:setStatus");
  const id = parseInput(idSchema, roomId);
  const data = parseInput(roomStatusSchema, input);
  return db.transaction(async (tx) => {
    const [room] = await tx
      .select()
      .from(rooms)
      .where(and(eq(rooms.id, id), eq(rooms.hotelId, actor.hotelId)))
      .for("update");
    if (!room) throw new NotFoundError("Room");
    const hotel = await getHotelOrThrow(tx, actor.hotelId);
    let affected: { reservationNumber: string; checkInDate: string }[] = [];
    if (data.operationalStatus !== "in_service") {
      const [occupant] = await tx
        .select({ reservationNumber: reservations.reservationNumber })
        .from(reservations)
        .where(and(eq(reservations.roomId, id), eq(reservations.status, "checked_in")))
        .limit(1);
      if (occupant) {
        throw new ConflictError(
          `Room ${room.roomNumber} is occupied (${occupant.reservationNumber}). Move or check out the guest first.`,
        );
      }
      affected = await tx
        .select({ reservationNumber: reservations.reservationNumber, checkInDate: reservations.checkInDate })
        .from(reservations)
        .where(
          and(
            eq(reservations.roomId, id),
            inArray(reservations.status, ["pending", "confirmed"]),
            gte(reservations.checkOutDate, hotelToday(hotel)),
          ),
        )
        .orderBy(asc(reservations.checkInDate));
    }
    const [updated] = await tx
      .update(rooms)
      .set({
        operationalStatus: data.operationalStatus,
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      })
      .where(eq(rooms.id, id))
      .returning();
    await writeAudit(tx, actor, {
      action: "room.status_changed",
      entityType: "room",
      entityId: id,
      metadata: {
        roomNumber: room.roomNumber,
        from: room.operationalStatus,
        to: updated.operationalStatus,
        affectedReservations: affected.map((a) => a.reservationNumber),
      },
    });
    return { room: updated, affectedReservations: affected };
  });
}

export async function archiveRoom(actor: Actor, roomId: string) {
  assertCan(actor, "rooms:manage");
  const id = parseInput(idSchema, roomId);
  return db.transaction(async (tx) => {
    const [room] = await tx
      .select()
      .from(rooms)
      .where(and(eq(rooms.id, id), eq(rooms.hotelId, actor.hotelId)))
      .for("update");
    if (!room) throw new NotFoundError("Room");
    const [active] = await tx
      .select({ n: count() })
      .from(reservations)
      .where(and(eq(reservations.roomId, id), inArray(reservations.status, [...BLOCKING_STATUSES])));
    if (active.n > 0) {
      throw new ConflictError("This room has active or upcoming reservations and cannot be archived.");
    }
    const [updated] = await tx
      .update(rooms)
      .set({ archivedAt: new Date(), operationalStatus: "out_of_service" })
      .where(eq(rooms.id, id))
      .returning();
    await writeAudit(tx, actor, {
      action: "room.archived",
      entityType: "room",
      entityId: id,
      metadata: { roomNumber: room.roomNumber },
    });
    return updated;
  });
}
