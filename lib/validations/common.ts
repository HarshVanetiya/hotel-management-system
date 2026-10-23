import { z } from "zod";
import { isISODate } from "@/lib/utils/dates";

export const idSchema = z.uuid({ message: "Invalid identifier" });

export const isoDateSchema = z
  .string()
  .refine(isISODate, { message: "Use a valid date (YYYY-MM-DD)" });

/** Non-negative decimal amount with at most 2 decimal places, as a string. */
export const moneySchema = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "number" ? String(v) : v.trim()))
  .refine((v) => /^\d{1,10}(\.\d{1,2})?$/.test(v), {
    message: "Enter an amount with up to 2 decimal places",
  });

export const positiveMoneySchema = moneySchema.refine((v) => Number(v) > 0, {
  message: "Amount must be greater than zero",
});

export const percentSchema = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "number" ? String(v) : v.trim()))
  .refine((v) => /^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) <= 100, {
    message: "Enter a percentage between 0 and 100",
  });

/** Trims; converts empty strings to null. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { message: `Must be at most ${max} characters` })
    .nullish()
    .transform((v) => (v ? v : null));

export const requiredText = (max: number, label = "This field") =>
  z
    .string()
    .trim()
    .min(1, { message: `${label} is required` })
    .max(max, { message: `Must be at most ${max} characters` });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(25),
});

export type Pagination = z.infer<typeof paginationSchema>;

export const paymentMethodSchema = z.enum(["cash", "card", "upi", "bank_transfer", "other"]);
export const reservationStatusSchema = z.enum([
  "pending",
  "confirmed",
  "checked_in",
  "checked_out",
  "cancelled",
  "no_show",
]);
export const roleSchema = z.enum(["admin", "receptionist", "housekeeping"]);
export const housekeepingStatusSchema = z.enum(["dirty", "cleaning", "clean", "inspected"]);
export const operationalStatusSchema = z.enum(["in_service", "maintenance", "out_of_service"]);
