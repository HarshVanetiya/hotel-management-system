import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgSequence,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  chargeStatusEnum,
  housekeepingStatusEnum,
  housekeepingTaskStatusEnum,
  housekeepingTaskTypeEnum,
  paymentKindEnum,
  paymentMethodEnum,
  paymentStatusEnum,
  reservationStatusEnum,
  roomOperationalStatusEnum,
  taskPriorityEnum,
  userRoleEnum,
} from "./enums";

const money = (name: string) => numeric(name, { precision: 12, scale: 2, mode: "string" });

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const reservationNumberSeq = pgSequence("reservation_number_seq", { startWith: 1001 });

// ---------------------------------------------------------------------------
// Hotels
// ---------------------------------------------------------------------------
export const hotels = pgTable(
  "hotels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 160 }).notNull(),
    address: text("address"),
    phone: varchar("phone", { length: 40 }),
    email: varchar("email", { length: 254 }),
    /** ISO-4217 code, e.g. INR, USD. */
    currency: varchar("currency", { length: 3 }).notNull().default("INR"),
    /** IANA timezone; all business dates are interpreted in this zone. */
    timezone: varchar("timezone", { length: 64 }).notNull().default("Asia/Kolkata"),
    checkInTime: time("check_in_time").notNull().default("14:00"),
    checkOutTime: time("check_out_time").notNull().default("11:00"),
    /** Percentage applied to room revenue (after discount), e.g. 12.00. */
    taxRate: numeric("tax_rate", { precision: 5, scale: 2, mode: "string" }).notNull().default("0"),
    enabledPaymentMethods: paymentMethodEnum("enabled_payment_methods")
      .array()
      .notNull()
      .default(sql`ARRAY['cash','card','upi']::payment_method[]`),
    ...timestamps,
  },
  (t) => [check("hotels_tax_rate_range", sql`${t.taxRate} >= 0 AND ${t.taxRate} <= 100`)],
);

// ---------------------------------------------------------------------------
// Users (staff)
// ---------------------------------------------------------------------------
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 120 }).notNull(),
    email: varchar("email", { length: 254 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull(),
    active: boolean("active").notNull().default(true),
    /** Incremented on password reset / role change / deactivation to revoke sessions. */
    sessionVersion: integer("session_version").notNull().default(1),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("users_email_lower_unique").on(sql`lower(${t.email})`),
    index("users_hotel_idx").on(t.hotelId),
  ],
);

// ---------------------------------------------------------------------------
// Room types & rooms
// ---------------------------------------------------------------------------
export const roomTypes = pgTable(
  "room_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 80 }).notNull(),
    description: text("description"),
    capacity: integer("capacity").notNull(),
    basePrice: money("base_price").notNull(),
    amenities: text("amenities").array().notNull().default(sql`ARRAY[]::text[]`),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("room_types_hotel_name_unique").on(t.hotelId, sql`lower(${t.name})`),
    check("room_types_capacity_positive", sql`${t.capacity} BETWEEN 1 AND 20`),
    check("room_types_base_price_nonneg", sql`${t.basePrice} >= 0`),
  ],
);

export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "restrict" }),
    roomNumber: varchar("room_number", { length: 20 }).notNull(),
    roomTypeId: uuid("room_type_id")
      .notNull()
      .references(() => roomTypes.id, { onDelete: "restrict" }),
    floor: integer("floor").notNull(),
    operationalStatus: roomOperationalStatusEnum("operational_status").notNull().default("in_service"),
    housekeepingStatus: housekeepingStatusEnum("housekeeping_status").notNull().default("clean"),
    notes: text("notes"),
    /** Archived rooms are hidden from inventory but kept for history. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("rooms_hotel_number_unique").on(t.hotelId, t.roomNumber),
    index("rooms_room_type_idx").on(t.roomTypeId),
    index("rooms_hotel_floor_idx").on(t.hotelId, t.floor),
  ],
);

// ---------------------------------------------------------------------------
// Guests
// ---------------------------------------------------------------------------
export const guests = pgTable(
  "guests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "restrict" }),
    firstName: varchar("first_name", { length: 80 }).notNull(),
    lastName: varchar("last_name", { length: 80 }).notNull(),
    email: varchar("email", { length: 254 }),
    phone: varchar("phone", { length: 40 }),
    address: text("address"),
    /** e.g. passport, national_id, driving_license. No document images are stored. */
    identificationType: varchar("identification_type", { length: 40 }),
    identificationReference: varchar("identification_reference", { length: 80 }),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("guests_hotel_name_idx").on(t.hotelId, t.lastName, t.firstName),
    index("guests_hotel_phone_idx").on(t.hotelId, t.phone),
    index("guests_hotel_email_idx").on(t.hotelId, sql`lower(${t.email})`),
  ],
);

// ---------------------------------------------------------------------------
// Reservations
// ---------------------------------------------------------------------------
export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "restrict" }),
    reservationNumber: varchar("reservation_number", { length: 24 }).notNull(),
    guestId: uuid("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "restrict" }),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "restrict" }),
    /** Hotel-local business dates. The guest occupies nights [checkIn, checkOut). */
    checkInDate: date("check_in_date", { mode: "string" }).notNull(),
    checkOutDate: date("check_out_date", { mode: "string" }).notNull(),
    adults: integer("adults").notNull().default(1),
    children: integer("children").notNull().default(0),
    status: reservationStatusEnum("status").notNull().default("confirmed"),
    nightlyRate: money("nightly_rate").notNull(),
    subtotal: money("subtotal").notNull(),
    discountAmount: money("discount_amount").notNull().default("0"),
    /** Tax rate snapshot (percent) used to compute taxAmount. */
    taxRate: numeric("tax_rate", { precision: 5, scale: 2, mode: "string" }).notNull().default("0"),
    taxAmount: money("tax_amount").notNull().default("0"),
    /** Room total = subtotal - discount + tax. Additional charges are tracked separately. */
    totalAmount: money("total_amount").notNull(),
    specialRequests: text("special_requests"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    checkedOutAt: timestamp("checked_out_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationReason: text("cancellation_reason"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("reservations_hotel_number_unique").on(t.hotelId, t.reservationNumber),
    index("reservations_room_dates_idx").on(t.roomId, t.checkInDate, t.checkOutDate),
    index("reservations_hotel_checkin_idx").on(t.hotelId, t.checkInDate),
    index("reservations_hotel_checkout_idx").on(t.hotelId, t.checkOutDate),
    index("reservations_hotel_status_idx").on(t.hotelId, t.status),
    index("reservations_guest_idx").on(t.guestId),
    check("reservations_dates_order", sql`${t.checkOutDate} > ${t.checkInDate}`),
    check("reservations_adults_positive", sql`${t.adults} >= 1`),
    check("reservations_children_nonneg", sql`${t.children} >= 0`),
    check(
      "reservations_amounts_nonneg",
      sql`${t.nightlyRate} >= 0 AND ${t.subtotal} >= 0 AND ${t.discountAmount} >= 0 AND ${t.taxAmount} >= 0 AND ${t.totalAmount} >= 0`,
    ),
    check("reservations_discount_le_subtotal", sql`${t.discountAmount} <= ${t.subtotal}`),
    // Overlap protection lives in a custom migration (btree_gist exclusion constraint).
  ],
);

export const reservationStatusHistory = pgTable(
  "reservation_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reservationId: uuid("reservation_id")
      .notNull()
      .references(() => reservations.id, { onDelete: "restrict" }),
    fromStatus: reservationStatusEnum("from_status"),
    toStatus: reservationStatusEnum("to_status").notNull(),
    changedBy: uuid("changed_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reservation_status_history_res_idx").on(t.reservationId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Payments (append-only ledger)
// ---------------------------------------------------------------------------
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reservationId: uuid("reservation_id")
      .notNull()
      .references(() => reservations.id, { onDelete: "restrict" }),
    kind: paymentKindEnum("kind").notNull().default("payment"),
    /** Always positive; `kind` determines the direction. */
    amount: money("amount").notNull(),
    method: paymentMethodEnum("method").notNull(),
    status: paymentStatusEnum("status").notNull().default("completed"),
    /** External reference only (e.g. UPI/terminal ref). Never card numbers or CVVs. */
    transactionReference: varchar("transaction_reference", { length: 120 }),
    notes: text("notes"),
    /** For refunds: the payment being refunded. */
    refundOfPaymentId: uuid("refund_of_payment_id").references((): AnyPgColumn => payments.id, {
      onDelete: "restrict",
    }),
    /** Client-generated key that makes payment submission idempotent. */
    idempotencyKey: uuid("idempotency_key").notNull(),
    receivedBy: uuid("received_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: uuid("voided_by").references(() => users.id, { onDelete: "restrict" }),
    voidReason: text("void_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payments_idempotency_key_unique").on(t.idempotencyKey),
    index("payments_reservation_idx").on(t.reservationId),
    index("payments_paid_at_idx").on(t.paidAt),
    index("payments_refund_of_idx").on(t.refundOfPaymentId),
    check("payments_amount_positive", sql`${t.amount} > 0`),
    check(
      "payments_refund_link",
      sql`(${t.kind} = 'refund') = (${t.refundOfPaymentId} IS NOT NULL)`,
    ),
    check(
      "payments_void_consistency",
      sql`(${t.status} = 'voided') = (${t.voidedAt} IS NOT NULL)`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Additional charges
// ---------------------------------------------------------------------------
export const additionalCharges = pgTable(
  "additional_charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reservationId: uuid("reservation_id")
      .notNull()
      .references(() => reservations.id, { onDelete: "restrict" }),
    description: varchar("description", { length: 200 }).notNull(),
    quantity: integer("quantity").notNull(),
    unitPrice: money("unit_price").notNull(),
    totalAmount: money("total_amount").notNull(),
    status: chargeStatusEnum("status").notNull().default("active"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: uuid("voided_by").references(() => users.id, { onDelete: "restrict" }),
    voidReason: text("void_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("additional_charges_reservation_idx").on(t.reservationId),
    index("additional_charges_created_idx").on(t.createdAt),
    check("additional_charges_quantity_positive", sql`${t.quantity} > 0`),
    check("additional_charges_unit_price_nonneg", sql`${t.unitPrice} >= 0`),
    check("additional_charges_total_matches", sql`${t.totalAmount} = ${t.unitPrice} * ${t.quantity}`),
  ],
);

// ---------------------------------------------------------------------------
// Housekeeping
// ---------------------------------------------------------------------------
export const housekeepingTasks = pgTable(
  "housekeeping_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "restrict" }),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    type: housekeepingTaskTypeEnum("type").notNull().default("checkout_clean"),
    status: housekeepingTaskStatusEnum("status").notNull().default("pending"),
    priority: taskPriorityEnum("priority").notNull().default("normal"),
    notes: text("notes"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("housekeeping_tasks_room_idx").on(t.roomId),
    index("housekeeping_tasks_assignee_status_idx").on(t.assignedTo, t.status),
    index("housekeeping_tasks_status_idx").on(t.status),
  ],
);

// ---------------------------------------------------------------------------
// Audit log (append-only)
// ---------------------------------------------------------------------------
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hotelId: uuid("hotel_id").references(() => hotels.id, { onDelete: "restrict" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "restrict" }),
    action: varchar("action", { length: 80 }).notNull(),
    entityType: varchar("entity_type", { length: 60 }).notNull(),
    entityId: varchar("entity_id", { length: 64 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_hotel_created_idx").on(t.hotelId, t.createdAt),
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
    index("audit_logs_user_idx").on(t.userId),
  ],
);

// ---------------------------------------------------------------------------
// Rate limiting (fixed window, shared across server instances)
// ---------------------------------------------------------------------------
export const rateLimits = pgTable("rate_limits", {
  key: varchar("key", { length: 200 }).primaryKey(),
  count: integer("count").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
});
