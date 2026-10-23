import { describe, expect, it } from "vitest";
import { can, PERMISSIONS, ROLES } from "@/lib/permissions";
import { blocksInventory, canTransition, checkInDateProblem, noShowDateProblem } from "@/lib/reservation-rules";

describe("reservation lifecycle", () => {
  it("defines which statuses hold inventory", () => {
    expect(blocksInventory("pending")).toBe(true);
    expect(blocksInventory("confirmed")).toBe(true);
    expect(blocksInventory("checked_in")).toBe(true);
    expect(blocksInventory("checked_out")).toBe(false);
    expect(blocksInventory("cancelled")).toBe(false);
    expect(blocksInventory("no_show")).toBe(false);
  });

  it("only allows valid transitions", () => {
    expect(canTransition("confirmed", "checked_in")).toBe(true);
    expect(canTransition("checked_in", "checked_out")).toBe(true);
    expect(canTransition("checked_in", "cancelled")).toBe(false);
    expect(canTransition("cancelled", "confirmed")).toBe(false);
    expect(canTransition("checked_out", "checked_in")).toBe(false);
  });

  it("allows check-in only during the stay window", () => {
    const res = { checkInDate: "2026-10-25", checkOutDate: "2026-10-28" };
    expect(checkInDateProblem(res, "2026-10-24")).toMatch(/scheduled/);
    expect(checkInDateProblem(res, "2026-10-25")).toBeNull();
    expect(checkInDateProblem(res, "2026-10-27")).toBeNull();
    expect(checkInDateProblem(res, "2026-10-28")).toMatch(/passed/);
  });

  it("allows no-show on or after the arrival date", () => {
    expect(noShowDateProblem({ checkInDate: "2026-10-25" }, "2026-10-24")).not.toBeNull();
    expect(noShowDateProblem({ checkInDate: "2026-10-25" }, "2026-10-25")).toBeNull();
  });
});

describe("permissions", () => {
  it("keeps housekeeping away from guests, payments and administration", () => {
    for (const p of ["guests:view", "payments:view", "payments:record", "staff:manage", "reports:view", "reservations:view"] as const) {
      expect(can("housekeeping", p)).toBe(false);
    }
    expect(can("housekeeping", "housekeeping:update")).toBe(true);
  });

  it("keeps receptionists out of staff, settings and audit administration", () => {
    expect(can("receptionist", "staff:manage")).toBe(false);
    expect(can("receptionist", "settings:manage")).toBe(false);
    expect(can("receptionist", "audit:view")).toBe(false);
    expect(can("receptionist", "reservations:manage")).toBe(true);
    expect(can("receptionist", "payments:record")).toBe(true);
  });

  it("grants admins every permission", () => {
    for (const p of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) expect(can("admin", p)).toBe(true);
    expect(ROLES).toHaveLength(3);
  });
});
