import { z } from "zod";
import {
  idSchema,
  isoDateSchema,
  moneySchema,
  optionalText,
  paymentMethodSchema,
  positiveMoneySchema,
  requiredText,
} from "./common";
import { guestInputSchema } from "./guest";

const datesRefinement = <T extends { checkInDate: string; checkOutDate: string }>(v: T) =>
  v.checkOutDate > v.checkInDate;

export const initialPaymentSchema = z.object({
  amount: positiveMoneySchema,
  method: paymentMethodSchema,
  transactionReference: optionalText(120),
  idempotencyKey: idSchema,
});

export const createReservationSchema = z
  .object({
    guestId: idSchema.optional(),
    newGuest: guestInputSchema.optional(),
    roomId: idSchema,
    checkInDate: isoDateSchema,
    checkOutDate: isoDateSchema,
    adults: z.coerce.number().int().min(1, "At least one adult is required").max(20),
    children: z.coerce.number().int().min(0).max(20).default(0),
    /** Optional override; defaults to the room type's base price. */
    nightlyRate: moneySchema.optional(),
    discountAmount: moneySchema.default("0"),
    specialRequests: optionalText(2000),
    status: z.enum(["pending", "confirmed"]).default("confirmed"),
    initialPayment: initialPaymentSchema.optional(),
  })
  .refine(datesRefinement, {
    message: "Check-out must be after check-in",
    path: ["checkOutDate"],
  })
  .refine((v) => Boolean(v.guestId) !== Boolean(v.newGuest), {
    message: "Select an existing guest or enter a new guest",
    path: ["guestId"],
  });

export type CreateReservationInput = z.input<typeof createReservationSchema>;

export const updateReservationSchema = z
  .object({
    roomId: idSchema.optional(),
    checkInDate: isoDateSchema.optional(),
    checkOutDate: isoDateSchema.optional(),
    adults: z.coerce.number().int().min(1).max(20).optional(),
    children: z.coerce.number().int().min(0).max(20).optional(),
    nightlyRate: moneySchema.optional(),
    discountAmount: moneySchema.optional(),
    specialRequests: optionalText(2000).optional(),
  })
  .refine(
    (v) => !(v.checkInDate && v.checkOutDate) || v.checkOutDate > v.checkInDate,
    { message: "Check-out must be after check-in", path: ["checkOutDate"] },
  );

export type UpdateReservationInput = z.input<typeof updateReservationSchema>;

export const cancelReservationSchema = z.object({
  reason: requiredText(500, "Cancellation reason"),
});

export const checkOutSchema = z.object({
  acknowledgeOutstandingBalance: z.boolean().default(false),
});

export const availabilityQuerySchema = z
  .object({
    checkInDate: isoDateSchema,
    checkOutDate: isoDateSchema,
    roomTypeId: idSchema.optional(),
    guests: z.coerce.number().int().min(1).max(40).optional(),
    excludeReservationId: idSchema.optional(),
  })
  .refine(datesRefinement, { message: "Check-out must be after check-in", path: ["checkOutDate"] });

export const RESERVATION_SORT_FIELDS = [
  "checkInDate",
  "checkOutDate",
  "createdAt",
  "reservationNumber",
  "totalAmount",
  "guestName",
] as const;

export const reservationListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z
    .enum(["pending", "confirmed", "checked_in", "checked_out", "cancelled", "no_show"])
    .optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  roomTypeId: idSchema.optional(),
  sort: z.enum(RESERVATION_SORT_FIELDS).default("checkInDate"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
});

export type ReservationListQuery = z.infer<typeof reservationListQuerySchema>;
