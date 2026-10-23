CREATE TYPE "public"."charge_status" AS ENUM('active', 'voided');--> statement-breakpoint
CREATE TYPE "public"."housekeeping_status" AS ENUM('dirty', 'cleaning', 'clean', 'inspected');--> statement-breakpoint
CREATE TYPE "public"."housekeeping_task_status" AS ENUM('pending', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."housekeeping_task_type" AS ENUM('checkout_clean', 'stayover_clean', 'deep_clean', 'inspection', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_kind" AS ENUM('payment', 'refund');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'card', 'upi', 'bank_transfer', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('completed', 'voided');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."room_operational_status" AS ENUM('in_service', 'maintenance', 'out_of_service');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'receptionist', 'housekeeping');--> statement-breakpoint
CREATE SEQUENCE "public"."reservation_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1001 CACHE 1;--> statement-breakpoint
CREATE TABLE "additional_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"description" varchar(200) NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"status" charge_status DEFAULT 'active' NOT NULL,
	"created_by" uuid NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "additional_charges_quantity_positive" CHECK ("additional_charges"."quantity" > 0),
	CONSTRAINT "additional_charges_unit_price_nonneg" CHECK ("additional_charges"."unit_price" >= 0),
	CONSTRAINT "additional_charges_total_matches" CHECK ("additional_charges"."total_amount" = "additional_charges"."unit_price" * "additional_charges"."quantity")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" uuid,
	"user_id" uuid,
	"action" varchar(80) NOT NULL,
	"entity_type" varchar(60) NOT NULL,
	"entity_id" varchar(64),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" uuid NOT NULL,
	"first_name" varchar(80) NOT NULL,
	"last_name" varchar(80) NOT NULL,
	"email" varchar(254),
	"phone" varchar(40),
	"address" text,
	"identification_type" varchar(40),
	"identification_reference" varchar(80),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hotels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"address" text,
	"phone" varchar(40),
	"email" varchar(254),
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"timezone" varchar(64) DEFAULT 'Asia/Kolkata' NOT NULL,
	"check_in_time" time DEFAULT '14:00' NOT NULL,
	"check_out_time" time DEFAULT '11:00' NOT NULL,
	"tax_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"enabled_payment_methods" "payment_method"[] DEFAULT ARRAY['cash','card','upi']::payment_method[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hotels_tax_rate_range" CHECK ("hotels"."tax_rate" >= 0 AND "hotels"."tax_rate" <= 100)
);
--> statement-breakpoint
CREATE TABLE "housekeeping_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"assigned_to" uuid,
	"type" "housekeeping_task_type" DEFAULT 'checkout_clean' NOT NULL,
	"status" "housekeeping_task_status" DEFAULT 'pending' NOT NULL,
	"priority" "task_priority" DEFAULT 'normal' NOT NULL,
	"notes" text,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"kind" "payment_kind" DEFAULT 'payment' NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"method" "payment_method" NOT NULL,
	"status" "payment_status" DEFAULT 'completed' NOT NULL,
	"transaction_reference" varchar(120),
	"notes" text,
	"refund_of_payment_id" uuid,
	"idempotency_key" uuid NOT NULL,
	"received_by" uuid NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount" > 0),
	CONSTRAINT "payments_refund_link" CHECK (("payments"."kind" = 'refund') = ("payments"."refund_of_payment_id" IS NOT NULL)),
	CONSTRAINT "payments_void_consistency" CHECK (("payments"."status" = 'voided') = ("payments"."voided_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" varchar(200) PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"window_start" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservation_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"from_status" "reservation_status",
	"to_status" "reservation_status" NOT NULL,
	"changed_by" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" uuid NOT NULL,
	"reservation_number" varchar(24) NOT NULL,
	"guest_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"check_in_date" date NOT NULL,
	"check_out_date" date NOT NULL,
	"adults" integer DEFAULT 1 NOT NULL,
	"children" integer DEFAULT 0 NOT NULL,
	"status" "reservation_status" DEFAULT 'confirmed' NOT NULL,
	"nightly_rate" numeric(12, 2) NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL,
	"discount_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"special_requests" text,
	"created_by" uuid NOT NULL,
	"checked_in_at" timestamp with time zone,
	"checked_out_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservations_dates_order" CHECK ("reservations"."check_out_date" > "reservations"."check_in_date"),
	CONSTRAINT "reservations_adults_positive" CHECK ("reservations"."adults" >= 1),
	CONSTRAINT "reservations_children_nonneg" CHECK ("reservations"."children" >= 0),
	CONSTRAINT "reservations_amounts_nonneg" CHECK ("reservations"."nightly_rate" >= 0 AND "reservations"."subtotal" >= 0 AND "reservations"."discount_amount" >= 0 AND "reservations"."tax_amount" >= 0 AND "reservations"."total_amount" >= 0),
	CONSTRAINT "reservations_discount_le_subtotal" CHECK ("reservations"."discount_amount" <= "reservations"."subtotal")
);
--> statement-breakpoint
CREATE TABLE "room_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" text,
	"capacity" integer NOT NULL,
	"base_price" numeric(12, 2) NOT NULL,
	"amenities" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_types_capacity_positive" CHECK ("room_types"."capacity" BETWEEN 1 AND 20),
	CONSTRAINT "room_types_base_price_nonneg" CHECK ("room_types"."base_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" uuid NOT NULL,
	"room_number" varchar(20) NOT NULL,
	"room_type_id" uuid NOT NULL,
	"floor" integer NOT NULL,
	"operational_status" "room_operational_status" DEFAULT 'in_service' NOT NULL,
	"housekeeping_status" "housekeeping_status" DEFAULT 'clean' NOT NULL,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"email" varchar(254) NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"session_version" integer DEFAULT 1 NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "additional_charges" ADD CONSTRAINT "additional_charges_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "additional_charges" ADD CONSTRAINT "additional_charges_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "additional_charges" ADD CONSTRAINT "additional_charges_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "housekeeping_tasks" ADD CONSTRAINT "housekeeping_tasks_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "housekeeping_tasks" ADD CONSTRAINT "housekeeping_tasks_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "housekeeping_tasks" ADD CONSTRAINT "housekeeping_tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_refund_of_payment_id_payments_id_fk" FOREIGN KEY ("refund_of_payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_status_history" ADD CONSTRAINT "reservation_status_history_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_status_history" ADD CONSTRAINT "reservation_status_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_types" ADD CONSTRAINT "room_types_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "additional_charges_reservation_idx" ON "additional_charges" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "additional_charges_created_idx" ON "additional_charges" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_hotel_created_idx" ON "audit_logs" USING btree ("hotel_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_user_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "guests_hotel_name_idx" ON "guests" USING btree ("hotel_id","last_name","first_name");--> statement-breakpoint
CREATE INDEX "guests_hotel_phone_idx" ON "guests" USING btree ("hotel_id","phone");--> statement-breakpoint
CREATE INDEX "guests_hotel_email_idx" ON "guests" USING btree ("hotel_id",lower("email"));--> statement-breakpoint
CREATE INDEX "housekeeping_tasks_room_idx" ON "housekeeping_tasks" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "housekeeping_tasks_assignee_status_idx" ON "housekeeping_tasks" USING btree ("assigned_to","status");--> statement-breakpoint
CREATE INDEX "housekeeping_tasks_status_idx" ON "housekeeping_tasks" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_idempotency_key_unique" ON "payments" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "payments_reservation_idx" ON "payments" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "payments_paid_at_idx" ON "payments" USING btree ("paid_at");--> statement-breakpoint
CREATE INDEX "payments_refund_of_idx" ON "payments" USING btree ("refund_of_payment_id");--> statement-breakpoint
CREATE INDEX "reservation_status_history_res_idx" ON "reservation_status_history" USING btree ("reservation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_hotel_number_unique" ON "reservations" USING btree ("hotel_id","reservation_number");--> statement-breakpoint
CREATE INDEX "reservations_room_dates_idx" ON "reservations" USING btree ("room_id","check_in_date","check_out_date");--> statement-breakpoint
CREATE INDEX "reservations_hotel_checkin_idx" ON "reservations" USING btree ("hotel_id","check_in_date");--> statement-breakpoint
CREATE INDEX "reservations_hotel_checkout_idx" ON "reservations" USING btree ("hotel_id","check_out_date");--> statement-breakpoint
CREATE INDEX "reservations_hotel_status_idx" ON "reservations" USING btree ("hotel_id","status");--> statement-breakpoint
CREATE INDEX "reservations_guest_idx" ON "reservations" USING btree ("guest_id");--> statement-breakpoint
CREATE UNIQUE INDEX "room_types_hotel_name_unique" ON "room_types" USING btree ("hotel_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_hotel_number_unique" ON "rooms" USING btree ("hotel_id","room_number");--> statement-breakpoint
CREATE INDEX "rooms_room_type_idx" ON "rooms" USING btree ("room_type_id");--> statement-breakpoint
CREATE INDEX "rooms_hotel_floor_idx" ON "rooms" USING btree ("hotel_id","floor");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "users_hotel_idx" ON "users" USING btree ("hotel_id");