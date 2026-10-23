import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { auditLogs, housekeepingTasks, reservationStatusHistory, rooms } from "@/db/schema";
import { db } from "@/lib/db";
import { ConflictError } from "@/lib/errors";
import { recordPayment } from "@/server/services/payments";
import {
  cancelReservation,
  checkIn,
  checkOut,
  createReservation,
  markNoShow,
  updateReservation,
} from "@/server/services/reservations";
import { createFixture, day, newGuest, type Fixture } from "../support/fixtures";

let fx: Fixture;
beforeEach(async () => {
  fx = await createFixture();
});

const book = (from: number, to: number, roomNumber = "101") =>
  createReservation(fx.receptionist, {
    newGuest: newGuest(),
    roomId: fx.room[roomNumber].id,
    checkInDate: day(from),
    checkOutDate: day(to),
    adults: 1,
  });

describe("check-in", () => {
  it("checks in an arrival for today and records history and audit", async () => {
    const r = await book(0, 2);
    const updated = await checkIn(fx.receptionist, r.id);
    expect(updated.status).toBe("checked_in");
    expect(updated.checkedInAt).toBeInstanceOf(Date);
    const history = await db.select().from(reservationStatusHistory).where(eq(reservationStatusHistory.reservationId, r.id));
    expect(history.map((h) => h.toStatus)).toEqual(["confirmed", "checked_in"]);
    const audit = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, r.id), eq(auditLogs.action, "reservation.checked_in")));
    expect(audit).toHaveLength(1);
  });

  it("rejects early check-in before the arrival date", async () => {
    const r = await book(1, 3);
    await expect(checkIn(fx.receptionist, r.id)).rejects.toThrow(/scheduled/);
  });

  it("rejects check-in into a dirty room", async () => {
    const r = await book(0, 1);
    await db.update(rooms).set({ housekeepingStatus: "dirty" }).where(eq(rooms.id, fx.room["101"].id));
    await expect(checkIn(fx.receptionist, r.id)).rejects.toThrow(/dirty/);
  });

  it("rejects check-in when the previous guest has not checked out", async () => {
    // A guest who should have left today is still in the room.
    const first = await book(0, 1, "102");
    await checkIn(fx.receptionist, first.id);
    const second = await book(1, 2, "102");
    // Simulate the next day: shift the stays one day back.
    await db.execute(
      `update reservations set check_in_date = check_in_date - 1, check_out_date = check_out_date - 1 where id in ('${first.id}', '${second.id}')`,
    );
    await expect(checkIn(fx.receptionist, second.id)).rejects.toThrow(/still occupied/);
  });

  it("cannot check in cancelled reservations or check in twice", async () => {
    const r = await book(0, 1);
    await checkIn(fx.receptionist, r.id);
    await expect(checkIn(fx.receptionist, r.id)).rejects.toBeInstanceOf(ConflictError);
    const c = await book(0, 1, "102");
    await cancelReservation(fx.receptionist, c.id, { reason: "x" });
    await expect(checkIn(fx.receptionist, c.id)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("check-out", () => {
  it("requires settling or acknowledging the outstanding balance", async () => {
    const r = await book(0, 1);
    await checkIn(fx.receptionist, r.id);
    await expect(checkOut(fx.receptionist, r.id, {})).rejects.toMatchObject({
      status: 409,
      details: { balanceCents: 280000 },
    });
    const { reservation } = await checkOut(fx.receptionist, r.id, { acknowledgeOutstandingBalance: true });
    expect(reservation.status).toBe("checked_out");
  });

  it("checks out a settled stay, marks the room dirty and queues cleaning", async () => {
    const r = await book(0, 1);
    await checkIn(fx.receptionist, r.id);
    await recordPayment(fx.receptionist, { reservationId: r.id, amount: "2800", method: "card", idempotencyKey: randomUUID() });
    const { balance } = await checkOut(fx.receptionist, r.id, {});
    expect(balance.balance).toBe(0);
    const [room] = await db.select().from(rooms).where(eq(rooms.id, fx.room["101"].id));
    expect(room.housekeepingStatus).toBe("dirty");
    expect(room.operationalStatus).toBe("in_service");
    const tasks = await db.select().from(housekeepingTasks).where(eq(housekeepingTasks.roomId, room.id));
    expect(tasks).toHaveLength(1);
    expect(tasks[0].type).toBe("checkout_clean");
  });

  it("only checked-in reservations can be checked out", async () => {
    const r = await book(0, 1);
    await expect(checkOut(fx.receptionist, r.id, {})).rejects.toBeInstanceOf(ConflictError);
  });

  it("frees the room for a new booking once checked out", async () => {
    const r = await book(0, 2);
    await checkIn(fx.receptionist, r.id);
    await checkOut(fx.receptionist, r.id, { acknowledgeOutstandingBalance: true });
    const next = await book(1, 3);
    expect(next.status).toBe("confirmed");
  });
});

describe("in-house modifications, cancellation and no-show", () => {
  it("allows extending an in-house stay but not changing its room", async () => {
    const r = await book(0, 1);
    await checkIn(fx.receptionist, r.id);
    const extended = await updateReservation(fx.receptionist, r.id, { checkOutDate: day(3) });
    expect(extended.totalAmount).toBe("8400.00");
    await expect(updateReservation(fx.receptionist, r.id, { roomId: fx.room["102"].id })).rejects.toBeInstanceOf(ConflictError);
  });

  it("cannot cancel a checked-in reservation", async () => {
    const r = await book(0, 1);
    await checkIn(fx.receptionist, r.id);
    await expect(cancelReservation(fx.receptionist, r.id, { reason: "x" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("records no-shows only from the arrival date, releasing the room", async () => {
    const future = await book(2, 3);
    await expect(markNoShow(fx.receptionist, future.id)).rejects.toThrow(/arrival date/);
    const r = await book(0, 2, "102");
    const ns = await markNoShow(fx.receptionist, r.id);
    expect(ns.status).toBe("no_show");
    const rebook = await book(0, 2, "102");
    expect(rebook.status).toBe("confirmed");
  });

  it("requires a cancellation reason", async () => {
    const r = await book(1, 2);
    await expect(cancelReservation(fx.receptionist, r.id, { reason: " " })).rejects.toThrow(/required/);
  });
});
