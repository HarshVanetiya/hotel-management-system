/**
 * DEVELOPMENT-ONLY demo data. Never run against production.
 *
 *   ALLOW_DEMO_SEED=true npm run db:seed [-- --reset]
 *
 * - Refuses to run when NODE_ENV=production or ALLOW_DEMO_SEED is not "true".
 * - Uses the existing hotel (created by `npm run setup:admin`) or creates a
 *   clearly-labelled demo hotel.
 * - Demo staff accounts get RANDOM passwords printed once to this console;
 *   there are no fixed or publicly known credentials.
 * - All names, emails (@example.test) and phone numbers are synthetic.
 * - --reset removes existing operational data (rooms, guests, reservations,
 *   payments, tasks, audit logs) but keeps the hotel and staff accounts.
 */
import "./load-env";
import { randomBytes, randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { eq, sql } from "drizzle-orm";
import {
  additionalCharges,
  guests,
  hotels,
  housekeepingTasks,
  payments,
  reservationNumberSeq,
  reservationStatusHistory,
  reservations,
  roomTypes,
  rooms,
  users,
} from "@/db/schema";
import { closeDb, getDb } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { calculateStayPricing } from "@/lib/pricing";
import { addDaysISO, todayInTimezone, zonedInstant } from "@/lib/utils/dates";
import { fromCents, toCents } from "@/lib/utils/money";

const { values: args } = parseArgs({ options: { reset: { type: "boolean", default: false } } });

if (process.env.NODE_ENV === "production" || process.env.ALLOW_DEMO_SEED !== "true") {
  console.error("Refusing to seed: set ALLOW_DEMO_SEED=true in a development environment (NODE_ENV must not be production).");
  process.exit(1);
}

// Deterministic PRNG so the demo looks the same on every run.
let state = 20261023;
const rand = () => {
  state = (state * 1664525 + 1013904223) % 4294967296;
  return state / 4294967296;
};
const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
const between = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

const FIRST = ["Aarav", "Diya", "Kabir", "Meera", "Rohan", "Ananya", "Vikram", "Isha", "Arjun", "Sara", "Noah", "Emma", "Liam", "Olivia", "Yuki", "Mateo", "Lena", "Omar", "Priya", "Daniel"];
const LAST = ["Sample", "Example", "Demo", "Testwood", "Placeholder", "Mockford", "Fictus", "Specimen"];
const CHARGES = [
  ["Restaurant", 650, 2400],
  ["Room service", 300, 1200],
  ["Laundry", 150, 600],
  ["Minibar", 120, 500],
  ["Airport transfer", 900, 1500],
] as const;

async function main() {
  const db = getDb();
  try {
    if (args.reset) {
      await db.execute(sql`
        TRUNCATE audit_logs, housekeeping_tasks, additional_charges, payments, reservation_status_history,
          reservations, guests, rooms, room_types, rate_limits RESTART IDENTITY CASCADE
      `);
      console.log("Cleared existing operational data (hotel and staff accounts kept).");
    }

    let hotel = await db.query.hotels.findFirst();
    if (!hotel) {
      [hotel] = await db
        .insert(hotels)
        .values({
          name: "Harbourview Demo Hotel (synthetic data)",
          address: "1 Example Street, Demo City",
          phone: "+91 00000 00000",
          email: "frontdesk@example.test",
          currency: "INR",
          timezone: "Asia/Kolkata",
          taxRate: "12.00",
          enabledPaymentMethods: ["cash", "card", "upi", "bank_transfer"],
        })
        .returning();
    }
    const existingRooms = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.hotelId, hotel.id)).limit(1);
    if (existingRooms.length > 0) {
      console.error("This hotel already has rooms. Run with --reset to replace operational data with demo data.");
      process.exit(1);
    }
    const tz = hotel.timezone;
    const today = todayInTimezone(tz);
    const at = (date: string, time: string) => zonedInstant(date, time, tz);

    // --- Staff (random passwords, printed once) ---------------------------------------
    const credentials: string[] = [];
    async function ensureUser(email: string, name: string, role: "admin" | "receptionist" | "housekeeping") {
      const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
      if (existing) return existing;
      const password = `${randomBytes(9).toString("base64url")}9a`;
      const [u] = await db
        .insert(users)
        .values({ hotelId: hotel!.id, email, name, role, passwordHash: await hashPassword(password) })
        .returning();
      credentials.push(`${role.padEnd(13)} ${email.padEnd(36)} ${password}`);
      return u;
    }
    const admins = await db.select().from(users).where(eq(users.role, "admin"));
    const admin = admins[0] ?? (await ensureUser("admin.demo@example.test", "Demo Admin", "admin"));
    const reception = await ensureUser("reception.demo@example.test", "Riya Reception (demo)", "receptionist");
    const hk1 = await ensureUser("housekeeping.demo@example.test", "Hari Housekeeping (demo)", "housekeeping");
    const hk2 = await ensureUser("housekeeping2.demo@example.test", "Lata Housekeeping (demo)", "housekeeping");
    const staff = [admin.id, reception.id];

    // --- Room types & rooms ------------------------------------------------------------
    const types = await db
      .insert(roomTypes)
      .values([
        { hotelId: hotel.id, name: "Standard", capacity: 2, basePrice: "2500.00", description: "Queen bed, city view", amenities: ["Wi-Fi", "Air conditioning", "TV"] },
        { hotelId: hotel.id, name: "Deluxe", capacity: 3, basePrice: "4000.00", description: "King bed, sea view", amenities: ["Wi-Fi", "Air conditioning", "Minibar", "Balcony"] },
        { hotelId: hotel.id, name: "Family Room", capacity: 5, basePrice: "6000.00", description: "Two queen beds and sofa bed", amenities: ["Wi-Fi", "Air conditioning", "Kitchenette"] },
        { hotelId: hotel.id, name: "Suite", capacity: 4, basePrice: "8500.00", description: "Separate living room", amenities: ["Wi-Fi", "Bathtub", "Minibar", "Lounge access"] },
      ])
      .returning();
    const layout: { floor: number; type: number }[] = [];
    for (let floor = 1; floor <= 4; floor++) {
      for (let n = 1; n <= 5; n++) layout.push({ floor, type: floor === 4 ? (n <= 3 ? 3 : 2) : floor === 3 ? (n <= 3 ? 1 : 2) : 0 });
    }
    const roomRows = await db
      .insert(rooms)
      .values(
        layout.map((l, i) => ({
          hotelId: hotel!.id,
          roomNumber: `${l.floor}0${(i % 5) + 1}`,
          roomTypeId: types[l.type].id,
          floor: l.floor,
          housekeepingStatus: "clean" as const,
        })),
      )
      .returning();
    const maintenanceRoom = roomRows[6]; // 202
    const outOfServiceRoom = roomRows[13]; // 304

    // --- Guests ---------------------------------------------------------------------------
    const guestRows = await db
      .insert(guests)
      .values(
        Array.from({ length: 36 }, (_, i) => {
          const first = FIRST[i % FIRST.length];
          const last = `${pick(LAST)}`;
          return {
            hotelId: hotel!.id,
            firstName: first,
            lastName: last,
            email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@example.test`,
            phone: `+91 90000 ${String(10000 + i).padStart(5, "0")}`,
            notes: i % 7 === 0 ? "Synthetic guest — prefers a high floor" : null,
          };
        }),
      )
      .returning();

    // --- Reservations: walk each room's timeline without overlaps -------------------------
    let created = 0;
    for (const room of roomRows) {
      const type = types.find((t) => t.id === room.roomTypeId)!;
      let cursor = addDaysISO(today, -between(28, 32));
      const horizon = addDaysISO(today, 24);
      while (cursor < horizon) {
        cursor = addDaysISO(cursor, between(0, 3)); // gap between stays
        const nights = between(1, 4);
        const checkIn = cursor;
        const checkOut = addDaysISO(checkIn, nights);
        cursor = checkOut;
        if (checkIn >= horizon) break;
        const blockedRoom = room.id === maintenanceRoom.id || room.id === outOfServiceRoom.id;
        if (blockedRoom && checkOut >= today) break; // nobody in house in a blocked room
        if (rand() < 0.15 && checkIn > today) continue; // leave some future inventory free

        let status: (typeof reservations.$inferSelect)["status"];
        if (checkOut <= today) status = rand() < 0.08 ? "no_show" : "checked_out";
        else if (checkIn < today || (checkIn === today && rand() < 0.4)) status = "checked_in";
        else status = rand() < 0.1 ? "pending" : "confirmed";
        // A few guests are still in house on their departure day (due out today).
        if (status === "checked_out" && checkOut === today && rand() < 0.5) status = "checked_in";
        const cancelled = status === "confirmed" && rand() < 0.12;

        const adults = between(1, Math.min(2, type.capacity));
        const children = type.capacity > 2 ? between(0, type.capacity - adults) : 0;
        const discount = rand() < 0.2 ? fromCents(between(2, 10) * 10000) : "0";
        const pricing = calculateStayPricing({
          checkInDate: checkIn,
          checkOutDate: checkOut,
          nightlyRate: type.basePrice,
          discountAmount: toCents(discount) <= toCents(type.basePrice) * nights ? discount : "0",
          taxRate: hotel.taxRate,
        });
        const bookedOn = addDaysISO(checkIn, -between(1, 25));
        const createdAt = at(bookedOn < today ? bookedOn : today, `${String(between(8, 20)).padStart(2, "0")}:${String(between(0, 59)).padStart(2, "0")}`);
        const [{ n }] = (await db.execute<{ n: string }>(sql`select nextval(${reservationNumberSeq.seqName}) as n`)).rows;
        const guest = pick(guestRows);
        const createdBy = pick(staff);
        const finalStatus = cancelled ? "cancelled" : status;

        const [res] = await db
          .insert(reservations)
          .values({
            hotelId: hotel.id,
            reservationNumber: `R${String(new Date().getUTCFullYear() % 100).padStart(2, "0")}-${String(n).padStart(6, "0")}`,
            guestId: guest.id,
            roomId: room.id,
            checkInDate: checkIn,
            checkOutDate: checkOut,
            adults,
            children,
            status: finalStatus,
            nightlyRate: pricing.nightlyRate,
            subtotal: pricing.subtotal,
            discountAmount: pricing.discountAmount,
            taxRate: pricing.taxRate,
            taxAmount: pricing.taxAmount,
            totalAmount: pricing.totalAmount,
            specialRequests: rand() < 0.15 ? "Late arrival, extra pillows (synthetic)" : null,
            createdBy,
            createdAt,
            checkedInAt: status === "checked_in" || status === "checked_out" ? at(checkIn, "14:30") : null,
            checkedOutAt: status === "checked_out" ? at(checkOut, "10:45") : null,
            cancelledAt: cancelled ? at(bookedOn < today ? addDaysISO(bookedOn, 1) < today ? addDaysISO(bookedOn, 1) : today : today, "12:00") : null,
            cancellationReason: cancelled ? "Guest changed travel plans (demo)" : null,
          })
          .returning();
        created++;

        const history: { from: typeof finalStatus | null; to: typeof finalStatus; at: Date; note?: string }[] = [
          { from: null, to: status === "pending" ? "pending" : "confirmed", at: createdAt, note: "Created" },
        ];
        if (cancelled) history.push({ from: "confirmed", to: "cancelled", at: res.cancelledAt!, note: res.cancellationReason! });
        if (status === "no_show") history.push({ from: "confirmed", to: "no_show", at: at(addDaysISO(checkIn, 1), "09:00") });
        if (status === "checked_in" || status === "checked_out") history.push({ from: "confirmed", to: "checked_in", at: res.checkedInAt! });
        if (status === "checked_out") history.push({ from: "checked_in", to: "checked_out", at: res.checkedOutAt! });
        await db.insert(reservationStatusHistory).values(
          history.map((h) => ({ reservationId: res.id, fromStatus: h.from, toStatus: h.to, changedBy: createdBy, note: h.note ?? null, createdAt: h.at })),
        );

        // Charges for stays that happened.
        let chargesCents = 0;
        if (status === "checked_in" || status === "checked_out") {
          for (let c = between(0, 2); c > 0; c--) {
            const [desc, min, max] = pick(CHARGES);
            const unit = between(min, max) * 100;
            const qty = between(1, 2);
            const day = addDaysISO(checkIn, between(0, Math.max(0, Math.min(nights, status === "checked_in" ? 0 : nights) - 1)));
            chargesCents += unit * qty;
            await db.insert(additionalCharges).values({
              reservationId: res.id,
              description: desc,
              quantity: qty,
              unitPrice: fromCents(unit),
              totalAmount: fromCents(unit * qty),
              createdBy: reception.id,
              createdAt: at(day <= today ? day : today, "20:15"),
            });
          }
        }

        // Payments.
        const owed = pricing.cents.total + chargesCents;
        const method = () => pick(["cash", "card", "upi", "upi", "card"] as const);
        const pay = async (cents: number, date: string, time: string) => {
          if (cents <= 0) return;
          await db.insert(payments).values({
            reservationId: res.id,
            amount: fromCents(cents),
            method: method(),
            transactionReference: rand() < 0.6 ? `DEMO-${randomBytes(4).toString("hex").toUpperCase()}` : null,
            idempotencyKey: randomUUID(),
            receivedBy: pick(staff),
            paidAt: at(date, time),
          });
        };
        if (status === "checked_out") {
          const deposit = rand() < 0.5 ? Math.round(owed * 0.3) : 0;
          await pay(deposit, bookedOn < today ? bookedOn : today, "11:00");
          const unpaid = rand() < 0.1 ? Math.round(owed * 0.15) : 0;
          await pay(owed - deposit - unpaid, checkOut, "10:30");
        } else if (status === "checked_in") {
          await pay(Math.round(owed * pick([0, 0.3, 0.5, 1])), checkIn, "14:40");
        } else if ((status === "confirmed" || cancelled) && rand() < 0.5) {
          await pay(Math.round(pricing.cents.total * 0.25), bookedOn < today ? bookedOn : today, "16:00");
        }
      }
    }

    // --- Room state & housekeeping -----------------------------------------------------------
    await db.update(rooms).set({ operationalStatus: "maintenance", notes: "Bathroom leak — plumber booked (demo)" }).where(eq(rooms.id, maintenanceRoom.id));
    await db.update(rooms).set({ operationalStatus: "out_of_service", notes: "Renovation (demo)" }).where(eq(rooms.id, outOfServiceRoom.id));
    const departedToday = await db.execute<{ room_id: string }>(sql`
      select distinct room_id from reservations
      where hotel_id = ${hotel.id} and status = 'checked_out' and check_out_date in (${today}::date, ${addDaysISO(today, -1)}::date)
        and room_id not in (select room_id from reservations where status = 'checked_in')
    `);
    for (const [i, row] of departedToday.rows.entries()) {
      await db.update(rooms).set({ housekeepingStatus: i % 3 === 2 ? "cleaning" : "dirty" }).where(eq(rooms.id, row.room_id));
      await db.insert(housekeepingTasks).values({
        roomId: row.room_id,
        type: "checkout_clean",
        status: i % 3 === 2 ? "in_progress" : "pending",
        priority: i % 2 === 0 ? "high" : "normal",
        assignedTo: i % 3 === 1 ? null : i % 2 === 0 ? hk1.id : hk2.id,
        createdBy: reception.id,
      });
    }
    const inHouse = await db.execute<{ room_id: string }>(sql`select room_id from reservations where hotel_id = ${hotel.id} and status = 'checked_in'`);
    for (const [i, row] of inHouse.rows.slice(0, 4).entries()) {
      await db.insert(housekeepingTasks).values({
        roomId: row.room_id,
        type: "stayover_clean",
        priority: "low",
        assignedTo: i % 2 === 0 ? hk1.id : hk2.id,
        notes: i === 0 ? "Guest requested fresh towels (demo)" : null,
        createdBy: reception.id,
      });
    }
    await db.insert(housekeepingTasks).values({
      roomId: maintenanceRoom.id,
      type: "deep_clean",
      priority: "normal",
      notes: "After plumbing repair (demo)",
      createdBy: admin.id,
    });
    // A few rooms already inspected and ready.
    const vacantClean = await db.execute<{ id: string }>(sql`
      select id from rooms where hotel_id = ${hotel.id} and housekeeping_status = 'clean' and operational_status = 'in_service'
        and id not in (select room_id from reservations where status = 'checked_in') limit 3
    `);
    for (const row of vacantClean.rows) await db.update(rooms).set({ housekeepingStatus: "inspected" }).where(eq(rooms.id, row.id));

    console.log(`Seeded "${hotel.name}": ${types.length} room types, ${roomRows.length} rooms, ${guestRows.length} guests, ${created} reservations.`);
    if (credentials.length) {
      console.log("\nDemo staff accounts (random passwords, shown only once — development use only):");
      for (const c of credentials) console.log(`  ${c}`);
    }
    if (admins.length === 0 && credentials.some((c) => c.startsWith("admin"))) {
      console.log("\nTip: for a real deployment create your own administrator with `npm run setup:admin` instead.");
    }
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
