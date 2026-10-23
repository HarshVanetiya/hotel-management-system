/**
 * Money is stored as NUMERIC(12,2) in PostgreSQL and handled in application
 * code as integer minor units ("cents") to avoid floating-point error.
 * All rounding is explicit: half-up, to 2 decimal places.
 */

const DECIMAL_RE = /^(-)?(\d+)(?:\.(\d+))?$/;

/** Parses a decimal string/number (e.g. "1234.5") into integer cents. Rounds half-up beyond 2 dp. */
export function toCents(value: string | number): number {
  const str = typeof value === "number" ? numberToPlainString(value) : value.trim();
  const match = DECIMAL_RE.exec(str);
  if (!match) throw new Error(`Invalid monetary amount: ${String(value)}`);
  const [, sign, whole, frac = ""] = match;
  const padded = (frac + "000").slice(0, 3);
  let cents = Number(whole) * 100 + Number(padded.slice(0, 2));
  if (Number(padded[2]) >= 5) cents += 1;
  if (!Number.isSafeInteger(cents)) throw new Error("Monetary amount out of range");
  return sign ? -cents : cents;
}

function numberToPlainString(n: number): string {
  if (!Number.isFinite(n)) throw new Error("Invalid monetary amount");
  // toFixed(6) avoids exponent notation and keeps enough precision for rounding.
  return n.toFixed(6).replace(/\.?0+$/, "");
}

/** Converts integer cents to a fixed 2-dp decimal string suitable for NUMERIC columns. */
export function fromCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error("Monetary amount out of range");
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const str = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  return negative ? `-${str}` : str;
}

/** Integer division with half-up rounding for non-negative numerators. */
function divRoundHalfUp(numerator: number, denominator: number): number {
  if (numerator < 0) return -divRoundHalfUp(-numerator, denominator);
  return Math.floor((numerator * 2 + denominator) / (denominator * 2));
}

/**
 * Applies a percentage rate (e.g. "12.00" or "18.5") to an amount in cents.
 * Rates are converted to basis points so the arithmetic stays integral.
 */
export function percentOf(amountCents: number, ratePercent: string | number): number {
  const basisPoints = toCents(ratePercent); // 12.00% -> 1200 bp
  return divRoundHalfUp(amountCents * basisPoints, 10_000);
}

/** Formats a decimal amount (e.g. a NUMERIC column value "1234.50"). */
export function formatMoney(value: string | number, currency: string, locale = "en-IN"): string {
  return formatCents(toCents(value), currency, locale);
}

/** Formats an amount given in integer minor units. */
export function formatCents(cents: number, currency: string, locale = "en-IN"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
