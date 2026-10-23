import "server-only";
import { and, asc, eq, gt, inArray, isNull, lt, ne, notExists, sql } from "drizzle-orm";
import { reservations, roomTypes, rooms } from "@/db/schema";
import { db, type DbExecutor } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { BLOCKING_STATUSES } from "@/lib/reservation-rules";
import { availabilityQuerySchema } from "@/lib/validations/reservation";
import { assertCan, type Actor } from "../actor";
import { parseInput } from "./common";

/** SQL condition: a reservation on `roomId` blocks [checkIn, checkOut). */
function overlapCondition(checkInDate: string, checkOutDate: string) {
  return and(
    inArray(reservations.status, [...BLOCKING_STATUSES]),
    lt(reservations.checkInDate, checkOutDate),
    gt(reservations.checkOutDate, checkInDate),
  );
}

export type AvailableRoom = {
  id: string;
  roomNumber: string;
  floor: number;
  roomTypeId: string;
  roomTypeName: string;
  capacity: number;
  basePrice: string;
  housekeepingStatus: string;
};

/** Rooms that can be sold for the whole requested stay. Computed in a single query. */
export async function findAvailableRooms(actor: Actor, input: unknown): Promise<AvailableRoom[]> {
  assertCan(actor, "reservations:view");
  const q = parseInput(availabilityQuerySchema, input);
  return db
    .select({
      id: rooms.id,
      roomNumber: rooms.roomNumber,
      floor: rooms.floor,
      roomTypeId: rooms.roomTypeId,
      roomTypeName: roomTypes.name,
      capacity: roomTypes.capacity,
      basePrice: roomTypes.basePrice,
      housekeepingStatus: rooms.housekeepingStatus,
    })
    .from(rooms)
    .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
    .where(
      and(
        eq(rooms.hotelId, actor.hotelId),
        isNull(rooms.archivedAt),
        eq(rooms.operationalStatus, "in_service"),
        q.roomTypeId ? eq(rooms.roomTypeId, q.roomTypeId) : undefined,
        q.guests ? sql`${roomTypes.capacity} >= ${q.guests}` : undefined,
        notExists(
          db
            .select({ one: sql`1` })
            .from(reservations)
            .where(
              and(
                eq(reservations.roomId, rooms.id),
                overlapCondition(q.checkInDate, q.checkOutDate),
                q.excludeReservationId ? ne(reservations.id, q.excludeReservationId) : undefined,
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(roomTypes.basePrice), asc(rooms.roomNumber));
}

/**
 * Locks the room row (SELECT … FOR UPDATE) and verifies it can take the stay.
 * The lock serialises concurrent bookings of the same room inside their
 * transactions, so the conflict check below sees any booking committed first.
 * The reservations_no_overlap exclusion constraint is the final safeguard.
 */
export async function lockRoomForStay(
  tx: DbExecutor,
  params: {
    hotelId: string;
    roomId: string;
    checkInDate: string;
    checkOutDate: string;
    guests: number;
    excludeReservationId?: string;
  },
) {
  const [room] = await tx
    .select({
      id: rooms.id,
      roomNumber: rooms.roomNumber,
      operationalStatus: rooms.operationalStatus,
      archivedAt: rooms.archivedAt,
      roomTypeId: rooms.roomTypeId,
      roomTypeName: roomTypes.name,
      capacity: roomTypes.capacity,
      basePrice: roomTypes.basePrice,
    })
    .from(rooms)
    .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
    .where(and(eq(rooms.id, params.roomId), eq(rooms.hotelId, params.hotelId)))
    .for("update", { of: rooms });

  if (!room) throw new NotFoundError("Room");
  if (room.archivedAt) throw new ValidationError(`Room ${room.roomNumber} is archived.`);
  if (room.operationalStatus !== "in_service") {
    const label = room.operationalStatus === "maintenance" ? "under maintenance" : "out of service";
    throw new ConflictError(`Room ${room.roomNumber} is ${label} and cannot be booked.`);
  }
  if (params.guests > room.capacity) {
    throw new ValidationError(
      `Room ${room.roomNumber} (${room.roomTypeName}) accommodates up to ${room.capacity} guest${room.capacity === 1 ? "" : "s"}.`,
      { fieldErrors: { adults: `Maximum ${room.capacity} guests for this room` } },
    );
  }

  const [conflict] = await tx
    .select({
      reservationNumber: reservations.reservationNumber,
      checkInDate: reservations.checkInDate,
      checkOutDate: reservations.checkOutDate,
    })
    .from(reservations)
    .where(
      and(
        eq(reservations.roomId, room.id),
        overlapCondition(params.checkInDate, params.checkOutDate),
        params.excludeReservationId ? ne(reservations.id, params.excludeReservationId) : undefined,
      ),
    )
    .limit(1);
  if (conflict) {
    throw new ConflictError(
      `Room ${room.roomNumber} is not available: it is booked from ${conflict.checkInDate} to ${conflict.checkOutDate} (${conflict.reservationNumber}).`,
      { conflictingReservation: conflict.reservationNumber },
    );
  }
  return room;
}
