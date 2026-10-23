import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["admin", "receptionist", "housekeeping"]);

/**
 * Whether a room can be sold. Occupancy is NOT stored here: a room is
 * "occupied" when it has a checked-in reservation. This keeps a single source
 * of truth and prevents housekeeping or status edits from "freeing" a room.
 */
export const roomOperationalStatusEnum = pgEnum("room_operational_status", [
  "in_service",
  "maintenance",
  "out_of_service",
]);

export const housekeepingStatusEnum = pgEnum("housekeeping_status", [
  "dirty",
  "cleaning",
  "clean",
  "inspected",
]);

export const reservationStatusEnum = pgEnum("reservation_status", [
  "pending",
  "confirmed",
  "checked_in",
  "checked_out",
  "cancelled",
  "no_show",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "cash",
  "card",
  "upi",
  "bank_transfer",
  "other",
]);

/** A refund is its own row (kind = refund) so financial history is append-only. */
export const paymentKindEnum = pgEnum("payment_kind", ["payment", "refund"]);

/** "voided" marks an entry recorded in error; the row and amount are retained. */
export const paymentStatusEnum = pgEnum("payment_status", ["completed", "voided"]);

export const chargeStatusEnum = pgEnum("charge_status", ["active", "voided"]);

export const housekeepingTaskStatusEnum = pgEnum("housekeeping_task_status", [
  "pending",
  "in_progress",
  "completed",
  "cancelled",
]);

export const housekeepingTaskTypeEnum = pgEnum("housekeeping_task_type", [
  "checkout_clean",
  "stayover_clean",
  "deep_clean",
  "inspection",
  "other",
]);

export const taskPriorityEnum = pgEnum("task_priority", ["low", "normal", "high", "urgent"]);
