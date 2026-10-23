import "server-only";
import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { guests, reservations, rooms } from "@/db/schema";
import { db, type DbExecutor } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { toCents } from "@/lib/utils/money";
import { guestInputSchema, type GuestInput } from "@/lib/validations/guest";
import { idSchema } from "@/lib/validations/common";
import { assertCan, type Actor } from "../actor";
import { writeAudit } from "../audit";
import { likePattern, paginated, parseInput } from "./common";
import { balanceSql } from "./finance-sql";
import { qc } from "./sql-helpers";

/** Shows only the last 4 characters of an identification reference. */
export function maskIdentification(ref: string | null): string | null {
  if (!ref) return null;
  return ref.length <= 4 ? "••••" : `••••${ref.slice(-4)}`;
}

export async function insertGuest(tx: DbExecutor, actor: Actor, data: GuestInput) {
  const [guest] = await tx
    .insert(guests)
    .values({ ...data, hotelId: actor.hotelId })
    .returning();
  await writeAudit(tx, actor, {
    action: "guest.created",
    entityType: "guest",
    entityId: guest.id,
    metadata: { name: `${guest.firstName} ${guest.lastName}` },
  });
  return guest;
}

export async function createGuest(actor: Actor, input: unknown) {
  assertCan(actor, "guests:manage");
  const data = parseInput(guestInputSchema, input);
  return db.transaction((tx) => insertGuest(tx, actor, data));
}

export async function updateGuest(actor: Actor, guestId: string, input: unknown) {
  assertCan(actor, "guests:manage");
  const id = parseInput(idSchema, guestId);
  const data = parseInput(guestInputSchema, input);
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(guests)
      .set(data)
      .where(and(eq(guests.id, id), eq(guests.hotelId, actor.hotelId)))
      .returning();
    if (!updated) throw new NotFoundError("Guest");
    // Only field names are logged, never the (potentially sensitive) values.
    await writeAudit(tx, actor, {
      action: "guest.updated",
      entityType: "guest",
      entityId: id,
      metadata: { fields: Object.keys(data) },
    });
    return updated;
  });
}

const guestSearchCondition = (actor: Actor, q?: string) => {
  const conditions = [eq(guests.hotelId, actor.hotelId)];
  if (q) {
    const p = likePattern(q);
    conditions.push(
      or(
        ilike(guests.firstName, p),
        ilike(guests.lastName, p),
        ilike(sql`${guests.firstName} || ' ' || ${guests.lastName}`, p),
        ilike(guests.email, p),
        ilike(guests.phone, p),
      )!,
    );
  }
  return and(...conditions);
};

export const guestListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(25),
});

export async function listGuests(actor: Actor, input: unknown) {
  assertCan(actor, "guests:view");
  const q = parseInput(guestListQuerySchema, input);
  const where = guestSearchCondition(actor, q.q);
  const [{ total }] = await db.select({ total: count() }).from(guests).where(where);
  const rows = await db
    .select({
      id: guests.id,
      firstName: guests.firstName,
      lastName: guests.lastName,
      email: guests.email,
      phone: guests.phone,
      createdAt: guests.createdAt,
      totalStays: sql<number>`(
        select count(*)::int from ${reservations}
        where ${qc(reservations.guestId)} = ${qc(guests.id)} and ${qc(reservations.status)} in ('checked_in', 'checked_out')
      )`,
      lastStay: sql<string | null>`(
        select max(${qc(reservations.checkInDate)})::text from ${reservations}
        where ${qc(reservations.guestId)} = ${qc(guests.id)} and ${qc(reservations.status)} in ('checked_in', 'checked_out')
      )`,
    })
    .from(guests)
    .where(where)
    .orderBy(asc(guests.lastName), asc(guests.firstName))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);
  return paginated(rows, total, q.page, q.pageSize);
}

/** Lightweight search used by the reservation form's guest picker. */
export async function searchGuests(actor: Actor, query: string) {
  assertCan(actor, "guests:view");
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return [];
  return db
    .select({
      id: guests.id,
      firstName: guests.firstName,
      lastName: guests.lastName,
      email: guests.email,
      phone: guests.phone,
    })
    .from(guests)
    .where(guestSearchCondition(actor, q))
    .orderBy(asc(guests.lastName))
    .limit(10);
}

export async function getGuestProfile(actor: Actor, guestId: string) {
  assertCan(actor, "guests:view");
  const id = parseInput(idSchema, guestId);
  const guest = await db.query.guests.findFirst({
    where: and(eq(guests.id, id), eq(guests.hotelId, actor.hotelId)),
  });
  if (!guest) throw new NotFoundError("Guest");

  const history = await db
    .select({
      id: reservations.id,
      reservationNumber: reservations.reservationNumber,
      checkInDate: reservations.checkInDate,
      checkOutDate: reservations.checkOutDate,
      status: reservations.status,
      totalAmount: reservations.totalAmount,
      roomNumber: rooms.roomNumber,
      balance: balanceSql,
    })
    .from(reservations)
    .innerJoin(rooms, eq(rooms.id, reservations.roomId))
    .where(eq(reservations.guestId, id))
    .orderBy(desc(reservations.checkInDate));

  const totalStays = history.filter((r) => r.status === "checked_in" || r.status === "checked_out").length;
  const outstandingCents = history.reduce((sum, r) => sum + Math.max(0, toCents(r.balance)), 0);

  const showId = can(actor.role, "guests:viewIdentification");
  return {
    guest: {
      ...guest,
      identificationReference: showId ? guest.identificationReference : maskIdentification(guest.identificationReference),
    },
    history,
    totalStays,
    outstandingCents,
  };
}
