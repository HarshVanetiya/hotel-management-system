import { z } from "zod";
import { optionalText, requiredText } from "./common";

export const IDENTIFICATION_TYPES = ["passport", "national_id", "driving_license", "other"] as const;

export const guestInputSchema = z.object({
  firstName: requiredText(80, "First name"),
  lastName: requiredText(80, "Last name"),
  email: z
    .string()
    .trim()
    .max(254)
    .nullish()
    .transform((v) => (v ? v.toLowerCase() : null))
    .refine((v) => v === null || z.email().safeParse(v).success, { message: "Enter a valid email" }),
  phone: z
    .string()
    .trim()
    .max(40)
    .nullish()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^[+()\-\s\d]{6,40}$/.test(v), { message: "Enter a valid phone number" }),
  address: optionalText(500),
  identificationType: z.enum(IDENTIFICATION_TYPES).nullish().transform((v) => v ?? null),
  identificationReference: optionalText(80),
  notes: optionalText(2000),
});

export type GuestInput = z.infer<typeof guestInputSchema>;
