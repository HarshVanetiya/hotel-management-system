import { z } from "zod";
import { isValidTimeZone } from "@/lib/utils/dates";
import { optionalText, paymentMethodSchema, percentSchema, requiredText } from "./common";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Use HH:MM");

export const hotelSettingsSchema = z.object({
  name: requiredText(160, "Hotel name"),
  address: optionalText(500),
  phone: optionalText(40),
  email: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || z.email().safeParse(v).success, "Enter a valid email"),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Use a 3-letter ISO currency code"),
  timezone: z.string().refine(isValidTimeZone, "Unknown timezone"),
  checkInTime: timeSchema,
  checkOutTime: timeSchema,
  taxRate: percentSchema,
  enabledPaymentMethods: z.array(paymentMethodSchema).min(1, "Enable at least one method"),
});
