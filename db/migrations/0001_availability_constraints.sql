-- Custom migration: database-level guarantees that Drizzle's schema DSL cannot express.

-- 1) Double-booking protection --------------------------------------------------
-- btree_gist lets a GiST index combine scalar equality (room_id) with range
-- overlap (&&). It is available on Neon and standard PostgreSQL.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint

-- A room cannot have two inventory-blocking reservations whose stays overlap.
-- daterange(check_in, check_out, '[)') is half-open: a stay checking out on the
-- 28th does not overlap one checking in on the 28th.
-- Only pending, confirmed and checked_in reservations block inventory;
-- cancelled, no_show and checked_out reservations release the room.
ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_no_overlap"
  EXCLUDE USING gist (
    "room_id" WITH =,
    daterange("check_in_date", "check_out_date", '[)') WITH &&
  )
  WHERE ("status" IN ('pending', 'confirmed', 'checked_in'));
--> statement-breakpoint

-- 2) Append-only financial and audit history -----------------------------------
CREATE OR REPLACE FUNCTION hms_prevent_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Deleting rows from % is not allowed; void or archive instead', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER "payments_no_delete" BEFORE DELETE ON "payments"
  FOR EACH ROW EXECUTE FUNCTION hms_prevent_delete();
--> statement-breakpoint
CREATE TRIGGER "additional_charges_no_delete" BEFORE DELETE ON "additional_charges"
  FOR EACH ROW EXECUTE FUNCTION hms_prevent_delete();
--> statement-breakpoint
CREATE TRIGGER "audit_logs_no_delete" BEFORE DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION hms_prevent_delete();
--> statement-breakpoint
CREATE TRIGGER "reservations_no_delete" BEFORE DELETE ON "reservations"
  FOR EACH ROW EXECUTE FUNCTION hms_prevent_delete();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION hms_audit_logs_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs rows are immutable' USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER "audit_logs_no_update" BEFORE UPDATE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION hms_audit_logs_immutable();
--> statement-breakpoint

-- Ledger rows may only transition completed -> voided; the financial facts
-- (amount, method, kind, reservation, timestamps) can never be rewritten.
CREATE OR REPLACE FUNCTION hms_payments_guard_update() RETURNS trigger AS $$
BEGIN
  IF NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.method IS DISTINCT FROM OLD.method
     OR NEW.reservation_id IS DISTINCT FROM OLD.reservation_id
     OR NEW.refund_of_payment_id IS DISTINCT FROM OLD.refund_of_payment_id
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.received_by IS DISTINCT FROM OLD.received_by
     OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR (OLD.status = 'voided' AND NEW.status <> 'voided') THEN
    RAISE EXCEPTION 'Payment records are immutable except for voiding'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER "payments_guard_update" BEFORE UPDATE ON "payments"
  FOR EACH ROW EXECUTE FUNCTION hms_payments_guard_update();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION hms_charges_guard_update() RETURNS trigger AS $$
BEGIN
  IF NEW.quantity IS DISTINCT FROM OLD.quantity
     OR NEW.unit_price IS DISTINCT FROM OLD.unit_price
     OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
     OR NEW.reservation_id IS DISTINCT FROM OLD.reservation_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR (OLD.status = 'voided' AND NEW.status <> 'voided') THEN
    RAISE EXCEPTION 'Charge records are immutable except for voiding'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER "additional_charges_guard_update" BEFORE UPDATE ON "additional_charges"
  FOR EACH ROW EXECUTE FUNCTION hms_charges_guard_update();
