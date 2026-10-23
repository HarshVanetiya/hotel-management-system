import { describe, expect, it } from "vitest";
import { dateInTimezone, eachNight, isISODate, nightsBetween, staysOverlap } from "@/lib/utils/dates";

describe("business dates", () => {
  it("counts nights with check-out exclusive", () => {
    expect(nightsBetween("2026-10-25", "2026-10-28")).toBe(3);
    expect(eachNight("2026-10-25", "2026-10-28")).toEqual(["2026-10-25", "2026-10-26", "2026-10-27"]);
  });

  it("handles month and DST boundaries as calendar days", () => {
    expect(nightsBetween("2026-10-31", "2026-11-02")).toBe(2);
    expect(nightsBetween("2026-03-28", "2026-03-30")).toBe(2);
  });

  it("validates ISO dates strictly", () => {
    expect(isISODate("2026-02-28")).toBe(true);
    expect(isISODate("2026-02-30")).toBe(false);
    expect(isISODate("26-02-01")).toBe(false);
  });

  it("derives the hotel-local date from an instant", () => {
    const instant = new Date("2026-10-24T20:00:00Z");
    expect(dateInTimezone(instant, "Asia/Kolkata")).toBe("2026-10-25"); // 01:30 IST
    expect(dateInTimezone(instant, "America/New_York")).toBe("2026-10-24");
  });
});

describe("overlap rule", () => {
  const existing = { checkInDate: "2026-10-25", checkOutDate: "2026-10-28" };

  it("treats back-to-back stays as non-overlapping", () => {
    expect(staysOverlap(existing, { checkInDate: "2026-10-28", checkOutDate: "2026-10-30" })).toBe(false);
    expect(staysOverlap(existing, { checkInDate: "2026-10-22", checkOutDate: "2026-10-25" })).toBe(false);
  });

  it("detects partial, enclosing and enclosed overlaps", () => {
    expect(staysOverlap(existing, { checkInDate: "2026-10-27", checkOutDate: "2026-10-29" })).toBe(true);
    expect(staysOverlap(existing, { checkInDate: "2026-10-24", checkOutDate: "2026-10-26" })).toBe(true);
    expect(staysOverlap(existing, { checkInDate: "2026-10-20", checkOutDate: "2026-11-01" })).toBe(true);
    expect(staysOverlap(existing, { checkInDate: "2026-10-26", checkOutDate: "2026-10-27" })).toBe(true);
  });
});
