import { describe, expect, it } from "vitest";
import { formatCents, fromCents, percentOf, toCents } from "@/lib/utils/money";

describe("money", () => {
  it("parses decimal strings into integer cents without float error", () => {
    expect(toCents("0.1")).toBe(10);
    expect(toCents("0.2")).toBe(20);
    expect(toCents("19.99")).toBe(1999);
    expect(toCents("1234567.89")).toBe(123456789);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  it("rounds half-up beyond two decimals", () => {
    expect(toCents("1.005")).toBe(101);
    expect(toCents("1.004")).toBe(100);
  });

  it("formats cents back to fixed decimals", () => {
    expect(fromCents(5)).toBe("0.05");
    expect(fromCents(123456)).toBe("1234.56");
    expect(fromCents(-250)).toBe("-2.50");
  });

  it("rejects malformed amounts", () => {
    expect(() => toCents("12,50")).toThrow();
    expect(() => toCents("abc")).toThrow();
  });

  it("applies percentage rates with half-up rounding", () => {
    expect(percentOf(10000, "12")).toBe(1200);
    expect(percentOf(999, "12.5")).toBe(125); // 124.875 -> 125
    expect(percentOf(1, "50")).toBe(1); // 0.5 -> 1
    expect(percentOf(12345, "0")).toBe(0);
  });

  it("formats currency", () => {
    expect(formatCents(123456, "INR")).toContain("1,234.56");
  });
});
