import "server-only";
import { and, eq } from "drizzle-orm";
import { additionalCharges, reservations } from "@/db/schema";
import { db } from "@/lib/db";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { fromCents, toCents } from "@/lib/utils/money";
import { idSchema } from "@/lib/validations/common";
import { addChargeSchema, voidSchema } from "@/lib/validations/payment";
import { assertCan, type Actor } from "../actor";
import { writeAudit } from "../audit";
import { parseInput } from "./common";

/** Posts an additional charge (restaurant, laundry…). The total is computed on the server. */
export async function addCharge(actor: Actor, reservationId: string, input: unknown) {
  assertCan(actor, "charges:manage");
  const id = parseInput(idSchema, reservationId);
  const data = parseInput(addChargeSchema, input);
  return db.transaction(async (tx) => {
    const [reservation] = await tx
      .select()
      .from(reservations)
      .where(and(eq(reservations.id, id), eq(reservations.hotelId, actor.hotelId)))
      .for("update");
    if (!reservation) throw new NotFoundError("Reservation");
    if (reservation.status === "pending") {
      throw new ConflictError("Confirm the reservation before posting charges.");
    }
    const unitCents = toCents(data.unitPrice);
    const [charge] = await tx
      .insert(additionalCharges)
      .values({
        reservationId: id,
        description: data.description,
        quantity: data.quantity,
        unitPrice: fromCents(unitCents),
        totalAmount: fromCents(unitCents * data.quantity),
        createdBy: actor.id,
      })
      .returning();
    await writeAudit(tx, actor, {
      action: "charge.added",
      entityType: "charge",
      entityId: charge.id,
      metadata: {
        reservationNumber: reservation.reservationNumber,
        description: charge.description,
        total: charge.totalAmount,
      },
    });
    return charge;
  });
}

export async function voidCharge(actor: Actor, chargeId: string, input: unknown) {
  assertCan(actor, "charges:void");
  const id = parseInput(idSchema, chargeId);
  const { reason } = parseInput(voidSchema, input);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ charge: additionalCharges, hotelId: reservations.hotelId })
      .from(additionalCharges)
      .innerJoin(reservations, eq(reservations.id, additionalCharges.reservationId))
      .where(eq(additionalCharges.id, id))
      .for("update", { of: additionalCharges });
    if (!row || row.hotelId !== actor.hotelId) throw new NotFoundError("Charge");
    if (row.charge.status === "voided") throw new ConflictError("This charge is already voided.");
    const [updated] = await tx
      .update(additionalCharges)
      .set({ status: "voided", voidedAt: new Date(), voidedBy: actor.id, voidReason: reason })
      .where(eq(additionalCharges.id, id))
      .returning();
    await writeAudit(tx, actor, {
      action: "charge.voided",
      entityType: "charge",
      entityId: id,
      metadata: { total: updated.totalAmount, description: updated.description, reason },
    });
    return updated;
  });
}
