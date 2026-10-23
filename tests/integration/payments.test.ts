import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { payments } from "@/db/schema";
import { db } from "@/lib/db";
import { ConflictError, ForbiddenError, ValidationError } from "@/lib/errors";
import { getReservationBalance } from "@/server/services/balances";
import { addCharge } from "@/server/services/charges";
import { recordPayment, refundPayment, voidPayment } from "@/server/services/payments";
import { cancelReservation, checkIn, createReservation } from "@/server/services/reservations";
import { createFixture, day, newGuest, type Fixture } from "../support/fixtures";

let fx: Fixture;
beforeEach(async () => {
  fx = await createFixture();
});

/** 2 nights × 2500 + 12% tax = 5600.00 */
async function reservation(offset = 0) {
  return createReservation(fx.receptionist, {
    newGuest: newGuest(),
    roomId: fx.room["101"].id,
    checkInDate: day(offset),
    checkOutDate: day(offset + 2),
    adults: 1,
  });
}

const pay = (reservationId: string, amount: string, key: string = randomUUID(), actor = fx.receptionist) =>
  recordPayment(actor, { reservationId, amount, method: "cash", idempotencyKey: key });

describe("partial payments and balances", () => {
  it("tracks multiple partial payments and the outstanding balance", async () => {
    const r = await reservation();
    await pay(r.id, "1000");
    await pay(r.id, "1600.50");
    const b = await getReservationBalance(db, r);
    expect(b.paid).toBe(260050);
    expect(b.balance).toBe(560000 - 260050);
  });

  it("includes additional charges in the balance", async () => {
    const r = await reservation();
    await addCharge(fx.receptionist, r.id, { description: "Laundry", quantity: 3, unitPrice: "150.00" });
    const b = await getReservationBalance(db, r);
    expect(b.charges).toBe(45000);
    expect(b.balance).toBe(560000 + 45000);
  });

  it("rejects overpayment and payments when nothing is owed", async () => {
    const r = await reservation();
    await expect(pay(r.id, "5600.01")).rejects.toBeInstanceOf(ValidationError);
    await pay(r.id, "5600.00");
    await expect(pay(r.id, "1")).rejects.toBeInstanceOf(ConflictError);
  });

  it("records an initial payment together with the reservation", async () => {
    const r = await createReservation(fx.receptionist, {
      newGuest: newGuest(),
      roomId: fx.room["102"].id,
      checkInDate: day(1),
      checkOutDate: day(2),
      adults: 1,
      initialPayment: { amount: "1000", method: "upi", idempotencyKey: randomUUID() },
    });
    const b = await getReservationBalance(db, r);
    expect(b.paid).toBe(100000);
  });

  it("rejects disabled payment methods", async () => {
    const r = await reservation();
    await expect(
      recordPayment(fx.receptionist, { reservationId: r.id, amount: "10", method: "bank_transfer", idempotencyKey: randomUUID() }),
    ).rejects.toThrow(/not enabled/);
  });
});

describe("duplicate payment submission prevention", () => {
  it("returns the original payment for a repeated idempotency key", async () => {
    const r = await reservation();
    const key = randomUUID();
    const first = await pay(r.id, "500", key);
    const second = await pay(r.id, "500", key);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.payment.id).toBe(first.payment.id);
    const rows = await db.select().from(payments).where(eq(payments.reservationId, r.id));
    expect(rows).toHaveLength(1);
  });

  it("records only one payment for concurrent double-submits", async () => {
    const r = await reservation();
    const key = randomUUID();
    const results = await Promise.all(Array.from({ length: 5 }, () => pay(r.id, "500", key)));
    expect(new Set(results.map((x) => x.payment.id)).size).toBe(1);
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(payments)
      .where(eq(payments.reservationId, r.id));
    expect(n).toBe(1);
  });

  it("rejects a reused key with different payment data", async () => {
    const r = await reservation();
    const key = randomUUID();
    await pay(r.id, "500", key);
    await expect(pay(r.id, "700", key)).rejects.toBeInstanceOf(ConflictError);
  });

  it("concurrent distinct payments cannot exceed the balance", async () => {
    const r = await reservation();
    const results = await Promise.allSettled([pay(r.id, "4000"), pay(r.id, "4000")]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  });
});

describe("refunds and voids", () => {
  it("refunds as a separate ledger entry and restores the balance", async () => {
    const r = await reservation();
    const { payment } = await pay(r.id, "2000");
    await refundPayment(fx.receptionist, payment.id, { amount: "500", reason: "Rate adjustment", idempotencyKey: randomUUID() });
    const b = await getReservationBalance(db, r);
    expect(b.netPaid).toBe(150000);
    await expect(
      refundPayment(fx.receptionist, payment.id, { amount: "1500.01", reason: "Too much", idempotencyKey: randomUUID() }),
    ).rejects.toBeInstanceOf(ValidationError);
    const rows = await db.select().from(payments).where(eq(payments.reservationId, r.id));
    expect(rows.map((x) => x.kind).sort()).toEqual(["payment", "refund"]);
  });

  it("shows a credit after cancellation that can be refunded", async () => {
    const r = await reservation(3);
    const { payment } = await pay(r.id, "1000");
    const { balance } = await cancelReservation(fx.receptionist, r.id, { reason: "Guest request" });
    expect(balance.balance).toBe(-100000);
    await refundPayment(fx.receptionist, payment.id, { amount: "1000", reason: "Cancelled", idempotencyKey: randomUUID() });
    expect((await getReservationBalance(db, { ...r, status: "cancelled" })).balance).toBe(0);
  });

  it("only admins can void, and voided entries are kept", async () => {
    const r = await reservation();
    const { payment } = await pay(r.id, "100");
    await expect(voidPayment(fx.receptionist, payment.id, { reason: "Mistake" })).rejects.toBeInstanceOf(ForbiddenError);
    await voidPayment(fx.admin, payment.id, { reason: "Recorded on wrong reservation" });
    const [row] = await db.select().from(payments).where(eq(payments.id, payment.id));
    expect(row.status).toBe("voided");
    expect(row.amount).toBe("100.00");
    expect((await getReservationBalance(db, r)).paid).toBe(0);
  });

  it("the database forbids deleting or rewriting payment history", async () => {
    const r = await reservation();
    const { payment } = await pay(r.id, "100");
    await expect(db.delete(payments).where(eq(payments.id, payment.id))).rejects.toThrow();
    await expect(db.update(payments).set({ amount: "1.00" }).where(eq(payments.id, payment.id))).rejects.toThrow();
  });
});

describe("payment authorization", () => {
  it("housekeeping cannot record payments", async () => {
    const r = await reservation();
    await expect(pay(r.id, "100", randomUUID(), fx.housekeeper)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("charges can be posted to in-house stays", async () => {
    const r = await reservation(0);
    await checkIn(fx.receptionist, r.id);
    const charge = await addCharge(fx.receptionist, r.id, { description: "Room service", quantity: 2, unitPrice: "349.50" });
    expect(charge.totalAmount).toBe("699.00");
  });
});
