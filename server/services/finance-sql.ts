import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { additionalCharges, payments, reservations } from "@/db/schema";
import { qc } from "./sql-helpers";

/**
 * Correlated SQL expressions for per-reservation financials. Used inside list
 * queries so balances are computed in one round trip (no N+1).
 * All values are NUMERIC returned as strings.
 */
export const activeChargesSql: SQL<string> = sql<string>`coalesce((
  select sum(${qc(additionalCharges.totalAmount)}) from ${additionalCharges}
  where ${qc(additionalCharges.reservationId)} = ${qc(reservations.id)} and ${qc(additionalCharges.status)} = 'active'
), 0)`;

export const paidSql: SQL<string> = sql<string>`coalesce((
  select sum(${qc(payments.amount)}) from ${payments}
  where ${qc(payments.reservationId)} = ${qc(reservations.id)} and ${qc(payments.status)} = 'completed' and ${qc(payments.kind)} = 'payment'
), 0)`;

export const refundedSql: SQL<string> = sql<string>`coalesce((
  select sum(${qc(payments.amount)}) from ${payments}
  where ${qc(payments.reservationId)} = ${qc(reservations.id)} and ${qc(payments.status)} = 'completed' and ${qc(payments.kind)} = 'refund'
), 0)`;

/** Room total (waived for cancelled / no-show) + active charges − net payments. */
export const balanceSql: SQL<string> = sql<string>`(
  (case when ${reservations.status} in ('cancelled', 'no_show') then 0 else ${reservations.totalAmount} end)
  + ${activeChargesSql} - ${paidSql} + ${refundedSql}
)`;
