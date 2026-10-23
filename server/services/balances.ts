import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { additionalCharges, payments } from "@/db/schema";
import type { DbExecutor } from "@/lib/db";
import { calculateBalance, type BalanceBreakdown } from "@/lib/pricing";
import { toCents } from "@/lib/utils/money";

export async function getReservationBalance(
  tx: DbExecutor,
  reservation: { id: string; status: string; totalAmount: string },
): Promise<BalanceBreakdown> {
  const [charges] = await tx
    .select({ total: sql<string>`coalesce(sum(${additionalCharges.totalAmount}), 0)` })
    .from(additionalCharges)
    .where(and(eq(additionalCharges.reservationId, reservation.id), eq(additionalCharges.status, "active")));
  const [pay] = await tx
    .select({
      paid: sql<string>`coalesce(sum(${payments.amount}) filter (where ${payments.kind} = 'payment'), 0)`,
      refunded: sql<string>`coalesce(sum(${payments.amount}) filter (where ${payments.kind} = 'refund'), 0)`,
    })
    .from(payments)
    .where(and(eq(payments.reservationId, reservation.id), eq(payments.status, "completed")));
  return calculateBalance({
    status: reservation.status,
    totalAmount: reservation.totalAmount,
    activeChargesCents: toCents(charges?.total ?? "0"),
    paidCents: toCents(pay?.paid ?? "0"),
    refundedCents: toCents(pay?.refunded ?? "0"),
  });
}
