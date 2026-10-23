import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { guests, reservations, rooms } from "@/db/schema";
import { db } from "@/lib/db";
import { assertCan, type Actor } from "../actor";
import { balanceSql } from "./finance-sql";

/** Open (not cancelled/no-show) reservations that still owe money. */
export async function runOutstanding(actor: Actor) {
  assertCan(actor, "payments:view");
  return db
    .select({
      id: reservations.id,
      reservationNumber: reservations.reservationNumber,
      status: reservations.status,
      guestName: sql<string>`${guests.firstName} || ' ' || ${guests.lastName}`,
      roomNumber: rooms.roomNumber,
      balance: balanceSql,
    })
    .from(reservations)
    .innerJoin(guests, eq(guests.id, reservations.guestId))
    .innerJoin(rooms, eq(rooms.id, reservations.roomId))
    .where(
      and(
        eq(reservations.hotelId, actor.hotelId),
        inArray(reservations.status, ["pending", "confirmed", "checked_in", "checked_out"]),
        sql`${balanceSql} > 0`,
      ),
    )
    .orderBy(desc(reservations.checkInDate))
    .limit(100);
}
