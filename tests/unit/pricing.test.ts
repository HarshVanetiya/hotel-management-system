import { describe, expect, it } from "vitest";
import { calculateBalance, calculateStayPricing } from "@/lib/pricing";

describe("calculateStayPricing", () => {
  it("computes subtotal, discount, tax and total", () => {
    const p = calculateStayPricing({
      checkInDate: "2026-10-25",
      checkOutDate: "2026-10-28",
      nightlyRate: "2500.00",
      discountAmount: "500",
      taxRate: "12.00",
    });
    expect(p.nights).toBe(3);
    expect(p.subtotal).toBe("7500.00");
    expect(p.discountAmount).toBe("500.00");
    expect(p.taxAmount).toBe("840.00"); // 12% of 7000
    expect(p.totalAmount).toBe("7840.00");
  });

  it("rounds tax half-up on odd amounts", () => {
    const p = calculateStayPricing({
      checkInDate: "2026-10-25",
      checkOutDate: "2026-10-26",
      nightlyRate: "99.99",
      discountAmount: "0",
      taxRate: "18",
    });
    expect(p.taxAmount).toBe("18.00"); // 17.9982
    expect(p.totalAmount).toBe("117.99");
  });

  it("rejects invalid date ranges and excessive discounts", () => {
    const base = { nightlyRate: "100", discountAmount: "0", taxRate: "0" };
    expect(() => calculateStayPricing({ ...base, checkInDate: "2026-10-25", checkOutDate: "2026-10-25" })).toThrow(/after check-in/);
    expect(() => calculateStayPricing({ ...base, checkInDate: "2026-10-25", checkOutDate: "2026-10-24" })).toThrow();
    expect(() =>
      calculateStayPricing({ ...base, checkInDate: "2026-10-25", checkOutDate: "2026-10-26", discountAmount: "100.01" }),
    ).toThrow(/Discount/);
  });
});

describe("calculateBalance", () => {
  it("adds charges and subtracts net payments", () => {
    const b = calculateBalance({ status: "checked_in", totalAmount: "1000.00", activeChargesCents: 25000, paidCents: 60000, refundedCents: 10000 });
    expect(b.netPaid).toBe(50000);
    expect(b.balance).toBe(100000 + 25000 - 50000);
  });

  it("waives the room total for cancelled and no-show reservations", () => {
    const b = calculateBalance({ status: "cancelled", totalAmount: "1000.00", activeChargesCents: 0, paidCents: 30000, refundedCents: 0 });
    expect(b.balance).toBe(-30000); // credit due to the guest
  });
});
