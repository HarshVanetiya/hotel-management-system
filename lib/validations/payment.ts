import { z } from "zod";
import { idSchema, optionalText, paymentMethodSchema, positiveMoneySchema, requiredText } from "./common";

export const recordPaymentSchema = z.object({
  reservationId: idSchema,
  amount: positiveMoneySchema,
  method: paymentMethodSchema,
  transactionReference: optionalText(120),
  notes: optionalText(500),
  /** Generated once per form submission; repeated submissions are de-duplicated. */
  idempotencyKey: idSchema,
});

export type RecordPaymentInput = z.input<typeof recordPaymentSchema>;

export const refundPaymentSchema = z.object({
  amount: positiveMoneySchema,
  method: paymentMethodSchema.optional(),
  reason: requiredText(500, "Refund reason"),
  transactionReference: optionalText(120),
  idempotencyKey: idSchema,
});

export const voidSchema = z.object({
  reason: requiredText(500, "Reason"),
});

export const addChargeSchema = z.object({
  description: requiredText(200, "Description"),
  quantity: z.coerce.number().int().min(1).max(1000),
  unitPrice: positiveMoneySchema,
});

export const paymentListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  method: paymentMethodSchema.optional(),
  status: z.enum(["completed", "voided"]).optional(),
  kind: z.enum(["payment", "refund"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(25),
});
