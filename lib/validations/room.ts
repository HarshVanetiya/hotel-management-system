import { z } from "zod";
import {
  housekeepingStatusSchema,
  idSchema,
  moneySchema,
  operationalStatusSchema,
  optionalText,
  requiredText,
} from "./common";

export const roomTypeInputSchema = z.object({
  name: requiredText(80, "Name"),
  description: optionalText(1000),
  capacity: z.coerce.number().int().min(1).max(20),
  basePrice: moneySchema,
  amenities: z
    .array(z.string().trim().min(1).max(60))
    .max(30)
    .default([])
    .transform((list) => Array.from(new Set(list))),
  active: z.boolean().default(true),
});

export const roomInputSchema = z.object({
  roomNumber: requiredText(20, "Room number").regex(/^[A-Za-z0-9-]+$/, "Use letters, digits or dashes"),
  roomTypeId: idSchema,
  floor: z.coerce.number().int().min(-5).max(200),
  notes: optionalText(1000),
});

export const roomStatusSchema = z.object({
  operationalStatus: operationalStatusSchema,
  notes: optionalText(1000).optional(),
});

export const housekeepingStatusUpdateSchema = z.object({
  housekeepingStatus: housekeepingStatusSchema,
});
