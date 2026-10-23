import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { reservations, rooms } from "@/db/schema";
import { db } from "@/lib/db";
import { ConflictError, ForbiddenError, ValidationError } from "@/lib/errors";
import { findAvailableRooms } from "@/server/services/availability";
import {
  cancelReservation,
  createReservation,
  updateReservation,
} from "@/server/services/reservations";
import { setRoomOperationalStatus } from "@/server/services/rooms";
import { createFixture, day, newGuest, type Fixture } from "../support/fixtures";

let fx: Fixture;
beforeEach(async () => {
  fx = await createFixture();
});

const book = (overrides: Record<string, unknown> = {}, actor = fx.receptionist) =>
  createReservation(actor, {
    newGuest: newGuest(),
    roomId: fx.room["101"].id,
    checkInDate: day(10),
    checkOutDate: day(13),
    adults: 2,
    ...overrides,
  });

describe("reservation date validation", () => {
  it("rejects check-out on or before check-in", async () => {
    await expect(book({ checkInDate: day(10), checkOutDate: day(10) })).rejects.toBeInstanceOf(ValidationError);
    await expect(book({ checkInDate: day(10), checkOutDate: day(9) })).rejects.toThrow(/after check-in/);
  });

  it("rejects check-in dates in the past", async () => {
    await expect(book({ checkInDate: day(-1), checkOutDate: day(2) })).rejects.toThrow(/past/);
  });

  it("is enforced by the database as well", async () => {
    const r = await book();
    await expect(
      db.update(reservations).set({ checkOutDate: r.checkInDate }).where(eq(reservations.id, r.id)),
    ).rejects.toThrow();
  });
});

describe("availability and overlap", () => {
  it("allows adjacent stays (check-out day = next check-in day)", async () => {
    await book({ checkInDate: day(10), checkOutDate: day(13) });
    const next = await book({ newGuest: newGuest(2), checkInDate: day(13), checkOutDate: day(15) });
    const prev = await book({ newGuest: newGuest(3), checkInDate: day(8), checkOutDate: day(10) });
    expect(next.status).toBe("confirmed");
    expect(prev.status).toBe("confirmed");
  });

  it("rejects overlapping reservations for the same room", async () => {
    const first = await book({ checkInDate: day(10), checkOutDate: day(13) });
    await expect(book({ newGuest: newGuest(2), checkInDate: day(12), checkOutDate: day(14) })).rejects.toThrow(
      new RegExp(first.reservationNumber),
    );
    await expect(book({ newGuest: newGuest(2), checkInDate: day(9), checkOutDate: day(11) })).rejects.toBeInstanceOf(ConflictError);
    await expect(book({ newGuest: newGuest(2), checkInDate: day(8), checkOutDate: day(16) })).rejects.toBeInstanceOf(ConflictError);
    await expect(book({ newGuest: newGuest(2), checkInDate: day(11), checkOutDate: day(12) })).rejects.toBeInstanceOf(ConflictError);
  });

  it("allows the same dates in a different room", async () => {
    await book();
    const other = await book({ newGuest: newGuest(2), roomId: fx.room["102"].id });
    expect(other.roomId).toBe(fx.room["102"].id);
  });

  it("releases inventory when a reservation is cancelled", async () => {
    const first = await book();
    await cancelReservation(fx.receptionist, first.id, { reason: "Guest changed plans" });
    const again = await book({ newGuest: newGuest(2) });
    expect(again.status).toBe("confirmed");
  });

  it("pending reservations block inventory", async () => {
    await book({ status: "pending" });
    await expect(book({ newGuest: newGuest(2) })).rejects.toBeInstanceOf(ConflictError);
  });

  it("lists only free rooms and excludes a reservation being edited", async () => {
    const r = await book();
    const free = await findAvailableRooms(fx.receptionist, { checkInDate: day(11), checkOutDate: day(12) });
    expect(free.map((x) => x.roomNumber)).toEqual(["102", "201", "301"]);
    const forEdit = await findAvailableRooms(fx.receptionist, {
      checkInDate: day(11),
      checkOutDate: day(12),
      excludeReservationId: r.id,
    });
    expect(forEdit.map((x) => x.roomNumber)).toContain("101");
  });

  it("the exclusion constraint blocks overlaps even if application checks are bypassed", async () => {
    const r = await book();
    await expect(
      db.execute(sql`
        INSERT INTO reservations (hotel_id, reservation_number, guest_id, room_id, check_in_date, check_out_date,
          adults, status, nightly_rate, subtotal, total_amount, created_by)
        VALUES (${fx.hotel.id}, 'MANUAL-1', ${r.guestId}, ${r.roomId}, ${day(11)}, ${day(12)},
          1, 'confirmed', 1, 1, 1, ${fx.admin.id})
      `),
    ).rejects.toMatchObject({ cause: { code: "23P01" } });
  });
});

describe("capacity and room status", () => {
  it("rejects more guests than the room type allows", async () => {
    await expect(book({ adults: 2, children: 1 })).rejects.toThrow(/accommodates up to 2/);
    const ok = await book({ roomId: fx.room["201"].id, adults: 2, children: 1 });
    expect(ok.adults + ok.children).toBe(3);
  });

  it("rejects rooms under maintenance", async () => {
    await setRoomOperationalStatus(fx.admin, fx.room["101"].id, { operationalStatus: "maintenance" });
    await expect(book()).rejects.toThrow(/maintenance/);
    const free = await findAvailableRooms(fx.receptionist, { checkInDate: day(10), checkOutDate: day(11) });
    expect(free.map((x) => x.roomNumber)).not.toContain("101");
  });
});

describe("concurrent booking attempts", () => {
  it("lets exactly one of several simultaneous requests book the same room", async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => book({ newGuest: newGuest(i + 1) })),
    );
    const ok = attempts.filter((a) => a.status === "fulfilled");
    const failed = attempts.filter((a) => a.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(5);
    for (const f of failed) expect(f.reason).toBeInstanceOf(ConflictError);
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(reservations)
      .where(eq(reservations.roomId, fx.room["101"].id));
    expect(n).toBe(1);
  });

  it("serialises concurrent moves into the same room", async () => {
    const a = await book({ roomId: fx.room["101"].id });
    const b = await book({ newGuest: newGuest(2), roomId: fx.room["102"].id });
    const c = await book({ newGuest: newGuest(3), roomId: fx.room["201"].id });
    const target = fx.room["301"].id;
    const results = await Promise.allSettled([
      updateReservation(fx.receptionist, a.id, { roomId: target }),
      updateReservation(fx.receptionist, b.id, { roomId: target }),
      updateReservation(fx.receptionist, c.id, { roomId: target }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
});

describe("pricing is computed on the server", () => {
  it("uses the room type base rate, discount and hotel tax", async () => {
    const r = await book({ discountAmount: "500", checkInDate: day(10), checkOutDate: day(13) });
    expect(r.nightlyRate).toBe("2500.00");
    expect(r.subtotal).toBe("7500.00");
    expect(r.taxAmount).toBe("840.00");
    expect(r.totalAmount).toBe("7840.00");
  });

  it("ignores client-supplied totals", async () => {
    const r = await book({ totalAmount: "1.00", subtotal: "1.00", taxAmount: "0" });
    expect(r.totalAmount).toBe("8400.00");
  });

  it("recalculates and rechecks availability when dates or rooms change", async () => {
    const r = await book();
    await book({ newGuest: newGuest(2), checkInDate: day(13), checkOutDate: day(15) });
    await expect(updateReservation(fx.receptionist, r.id, { checkOutDate: day(14) })).rejects.toBeInstanceOf(ConflictError);
    const shorter = await updateReservation(fx.receptionist, r.id, { checkOutDate: day(12) });
    expect(shorter.subtotal).toBe("5000.00");
    expect(shorter.totalAmount).toBe("5600.00");
    const moved = await updateReservation(fx.receptionist, r.id, { roomId: fx.room["201"].id });
    expect(moved.nightlyRate).toBe("4000.00");
    expect(moved.totalAmount).toBe("8960.00");
  });

  it("rejects a discount above the subtotal", async () => {
    await expect(book({ discountAmount: "999999" })).rejects.toThrow(/Discount/);
  });
});

describe("authorization", () => {
  it("housekeeping staff cannot create reservations", async () => {
    await expect(book({}, fx.housekeeper)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("cannot book rooms of another hotel", async () => {
    const otherHotelActor = { ...fx.receptionist, hotelId: randomUUID() };
    await expect(book({}, otherHotelActor)).rejects.toThrow();
    const [room] = await db.select().from(rooms).where(eq(rooms.id, fx.room["101"].id));
    expect(room).toBeDefined();
  });
});
