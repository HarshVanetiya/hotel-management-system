import { ValidationError } from "@/lib/errors";
import { fromCents, percentOf, toCents } from "@/lib/utils/money";
import { nightsBetween, type ISODate } from "@/lib/utils/dates";

export const MAX_STAY_NIGHTS = 90;

export type StayPricing = {
  nights: number;
  nightlyRate: string;
  subtotal: string;
  discountAmount: string;
  taxRate: string;
  taxAmount: string;
  totalAmount: string;
  cents: { nightlyRate: number; subtotal: number; discount: number; tax: number; total: number };
};

/**
 * Room pricing for a stay. Always computed on the server:
 *   subtotal = nightlyRate × nights
 *   taxable  = subtotal − discount        (discount may not exceed subtotal)
 *   tax      = round_half_up(taxable × taxRate%)
 *   total    = taxable + tax
 * Additional charges are tracked separately and are not taxed here.
 */
export function calculateStayPricing(input: {
  checkInDate: ISODate;
  checkOutDate: ISODate;
  nightlyRate: string;
  discountAmount: string;
  taxRate: string;
}): StayPricing {
  const nights = nightsBetween(input.checkInDate, input.checkOutDate);
  if (nights < 1) throw new ValidationError("Check-out must be after check-in.");
  if (nights > MAX_STAY_NIGHTS) {
    throw new ValidationError(`Stays are limited to ${MAX_STAY_NIGHTS} nights per reservation.`);
  }
  const rate = toCents(input.nightlyRate);
  const discount = toCents(input.discountAmount);
  if (rate < 0 || discount < 0) throw new ValidationError("Amounts cannot be negative.");
  const subtotal = rate * nights;
  if (discount > subtotal) throw new ValidationError("Discount cannot exceed the room subtotal.");
  const taxable = subtotal - discount;
  const tax = percentOf(taxable, input.taxRate);
  const total = taxable + tax;
  return {
    nights,
    nightlyRate: fromCents(rate),
    subtotal: fromCents(subtotal),
    discountAmount: fromCents(discount),
    taxRate: fromCents(toCents(input.taxRate)),
    taxAmount: fromCents(tax),
    totalAmount: fromCents(total),
    cents: { nightlyRate: rate, subtotal, discount, tax, total },
  };
}

export type BalanceBreakdown = {
  roomTotal: number;
  charges: number;
  paid: number;
  refunded: number;
  netPaid: number;
  /** Amount still owed by the guest; negative means a credit is due to the guest. */
  balance: number;
};

/**
 * Balance in cents. For cancelled and no-show reservations the room total is
 * not owed (any fee must be posted as an additional charge), so payments on
 * them show up as a credit to be refunded.
 */
export function calculateBalance(input: {
  status: string;
  totalAmount: string;
  activeChargesCents: number;
  paidCents: number;
  refundedCents: number;
}): BalanceBreakdown {
  const roomTotal =
    input.status === "cancelled" || input.status === "no_show" ? 0 : toCents(input.totalAmount);
  const netPaid = input.paidCents - input.refundedCents;
  return {
    roomTotal,
    charges: input.activeChargesCents,
    paid: input.paidCents,
    refunded: input.refundedCents,
    netPaid,
    balance: roomTotal + input.activeChargesCents - netPaid,
  };
}
