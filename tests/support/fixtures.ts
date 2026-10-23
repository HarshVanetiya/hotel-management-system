import { sql } from "drizzle-orm";
import { hotels, roomTypes, rooms, users } from "@/db/schema";
import { db } from "@/lib/db";
import { addDaysISO, todayInTimezone } from "@/lib/utils/dates";
import type { Actor } from "@/server/actor";
import { assertTestDatabase } from "./guard";

export const TZ = "Asia/Kolkata";
export const today = () => todayInTimezone(TZ);
export const day = (offset: number) => addDaysISO(today(), offset);

export async function resetDatabase() {
  assertTestDatabase(process.env.DATABASE_URL);
  await db.execute(sql`
    TRUNCATE audit_logs, rate_limits, housekeeping_tasks, additional_charges, payments,
      reservation_status_history, reservations, guests, rooms, room_types, users, hotels
    RESTART IDENTITY CASCADE
  `);
}

export type Fixture = Awaited<ReturnType<typeof createFixture>>;

/** A small synthetic hotel: 3 room types, 4 rooms and one user per role. */
export async function createFixture(opts: { taxRate?: string } = {}) {
  await resetDatabase();
  const [hotel] = await db
    .insert(hotels)
    .values({ name: "Test Hotel", currency: "INR", timezone: TZ, taxRate: opts.taxRate ?? "12.00" })
    .returning();
  const mkUser = async (role: Actor["role"], name: string) => {
    const [u] = await db
      .insert(users)
      .values({ hotelId: hotel.id, name, email: `${role}@test.invalid`, role, passwordHash: "x" })
      .returning();
    return { id: u.id, hotelId: hotel.id, role, name, email: u.email } satisfies Actor;
  };
  const admin = await mkUser("admin", "Ada Admin");
  const receptionist = await mkUser("receptionist", "Rita Reception");
  const housekeeper = await mkUser("housekeeping", "Hank Housekeeping");

  const [standard, deluxe, suite] = await db
    .insert(roomTypes)
    .values([
      { hotelId: hotel.id, name: "Standard", capacity: 2, basePrice: "2500.00" },
      { hotelId: hotel.id, name: "Deluxe", capacity: 3, basePrice: "4000.00" },
      { hotelId: hotel.id, name: "Suite", capacity: 4, basePrice: "7999.99" },
    ])
    .returning();
  const roomRows = await db
    .insert(rooms)
    .values([
      { hotelId: hotel.id, roomNumber: "101", roomTypeId: standard.id, floor: 1, housekeepingStatus: "clean" },
      { hotelId: hotel.id, roomNumber: "102", roomTypeId: standard.id, floor: 1, housekeepingStatus: "clean" },
      { hotelId: hotel.id, roomNumber: "201", roomTypeId: deluxe.id, floor: 2, housekeepingStatus: "clean" },
      { hotelId: hotel.id, roomNumber: "301", roomTypeId: suite.id, floor: 3, housekeepingStatus: "clean" },
    ])
    .returning();
  const room = Object.fromEntries(roomRows.map((r) => [r.roomNumber, r])) as Record<string, (typeof roomRows)[number]>;
  return { hotel, admin, receptionist, housekeeper, types: { standard, deluxe, suite }, room };
}

export const newGuest = (n = 1) => ({
  firstName: `Test${n}`,
  lastName: "Guest",
  email: `guest${n}@example.test`,
  phone: `+91 90000 0000${n}`,
});
