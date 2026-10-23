import { z } from "zod";
import { requiredText, roleSchema } from "./common";

/** bcrypt only uses the first 72 bytes, so longer passwords are rejected. */
export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .refine((v) => new TextEncoder().encode(v).length <= 72, "Password must be at most 72 bytes")
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Include at least one letter and one number");

export const createStaffSchema = z.object({
  name: requiredText(120, "Name"),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
  role: roleSchema,
  password: passwordSchema,
});

export const updateStaffSchema = z.object({
  name: requiredText(120, "Name").optional(),
  role: roleSchema.optional(),
  active: z.boolean().optional(),
});

export const resetPasswordSchema = z.object({
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(200),
});
