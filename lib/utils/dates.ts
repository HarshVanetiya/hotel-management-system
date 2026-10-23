import { addDays, differenceInCalendarDays, format, isValid, parseISO } from "date-fns";

/**
 * Business dates (check-in / check-out) are plain calendar dates in the
 * hotel's local timezone, represented as "yyyy-MM-dd" strings end-to-end.
 * They are never converted through UTC instants, so they cannot drift.
 */
export type ISODate = string;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const d = parseISO(value);
  return isValid(d) && format(d, "yyyy-MM-dd") === value;
}

/** Today's date in the given IANA timezone, as yyyy-MM-dd. */
export function todayInTimezone(timeZone: string, now: Date = new Date()): ISODate {
  return dateInTimezone(now, timeZone);
}

/** The hotel-local calendar date of an instant. */
export function dateInTimezone(instant: Date, timeZone: string): ISODate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDaysISO(date: ISODate, days: number): ISODate {
  return format(addDays(parseISO(date), days), "yyyy-MM-dd");
}

/** Number of nights between check-in and check-out (check-out exclusive). */
export function nightsBetween(checkIn: ISODate, checkOut: ISODate): number {
  return differenceInCalendarDays(parseISO(checkOut), parseISO(checkIn));
}

/** Every night occupied by a stay: [checkIn, checkOut). */
export function eachNight(checkIn: ISODate, checkOut: ISODate): ISODate[] {
  const nights = nightsBetween(checkIn, checkOut);
  return Array.from({ length: Math.max(0, nights) }, (_, i) => addDaysISO(checkIn, i));
}

/** Inclusive list of dates between two dates. */
export function eachDate(from: ISODate, to: ISODate): ISODate[] {
  const n = differenceInCalendarDays(parseISO(to), parseISO(from));
  return Array.from({ length: Math.max(0, n + 1) }, (_, i) => addDaysISO(from, i));
}

/**
 * Two stays overlap when existingCheckIn < requestedCheckOut AND
 * existingCheckOut > requestedCheckIn. Adjacent stays (one checks out the day
 * the other checks in) do not overlap. ISO strings compare lexicographically.
 */
export function staysOverlap(
  a: { checkInDate: ISODate; checkOutDate: ISODate },
  b: { checkInDate: ISODate; checkOutDate: ISODate },
): boolean {
  return a.checkInDate < b.checkOutDate && a.checkOutDate > b.checkInDate;
}

export function formatDisplayDate(date: ISODate, pattern = "dd MMM yyyy"): string {
  return format(parseISO(date), pattern);
}

export function formatDateTime(instant: Date | string, timeZone: string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The UTC instant for a hotel-local wall-clock time (e.g. 2026-10-25 14:00 in Asia/Kolkata). */
export function zonedInstant(date: ISODate, time: string, timeZone: string): Date {
  const [h, m] = time.split(":").map(Number);
  const [y, mo, d] = date.split("-").map(Number);
  const target = Date.UTC(y, mo - 1, d, h, m);
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(new Date(guess));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const shown = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    guess += target - shown;
  }
  return new Date(guess);
}
