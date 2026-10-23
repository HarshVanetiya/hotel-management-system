import { z } from "zod";
import { idSchema, optionalText } from "./common";

export const taskTypeSchema = z.enum(["checkout_clean", "stayover_clean", "deep_clean", "inspection", "other"]);
export const taskPrioritySchema = z.enum(["low", "normal", "high", "urgent"]);
export const taskStatusSchema = z.enum(["pending", "in_progress", "completed", "cancelled"]);

export const createTaskSchema = z.object({
  roomId: idSchema,
  type: taskTypeSchema.default("checkout_clean"),
  priority: taskPrioritySchema.default("normal"),
  assignedTo: idSchema.nullish().transform((v) => v ?? null),
  notes: optionalText(1000),
  dueAt: z.iso.datetime({ offset: true }).nullish().transform((v) => (v ? new Date(v) : null)),
});

export const updateTaskSchema = z.object({
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assignedTo: idSchema.nullish(),
  notes: optionalText(1000).optional(),
});
