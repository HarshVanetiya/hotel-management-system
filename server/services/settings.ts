import "server-only";
import { and, count, desc, eq, gte, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { auditLogs, hotels, users } from "@/db/schema";
import { db } from "@/lib/db";
import { addDaysISO, isISODate } from "@/lib/utils/dates";
import { hotelSettingsSchema } from "@/lib/validations/settings";
import { assertCan, type Actor } from "../actor";
import { writeAudit } from "../audit";
import { getHotelOrThrow, paginated, parseInput } from "./common";

/** Hotel configuration readable by any signed-in staff member (currency, timezone, etc.). */
export async function getHotelSettings(actor: Actor) {
  return getHotelOrThrow(db, actor.hotelId);
}

export async function updateHotelSettings(actor: Actor, input: unknown) {
  assertCan(actor, "settings:manage");
  const data = parseInput(hotelSettingsSchema, input);
  return db.transaction(async (tx) => {
    const before = await getHotelOrThrow(tx, actor.hotelId);
    const [updated] = await tx
      .update(hotels)
      .set({ ...data, enabledPaymentMethods: Array.from(new Set(data.enabledPaymentMethods)) })
      .where(eq(hotels.id, actor.hotelId))
      .returning();
    const changed = Object.keys(data).filter(
      (k) => JSON.stringify(before[k as keyof typeof before]) !== JSON.stringify(updated[k as keyof typeof updated]),
    );
    await writeAudit(tx, actor, {
      action: "settings.updated",
      entityType: "hotel",
      entityId: actor.hotelId,
      metadata: {
        changed,
        ...(changed.includes("taxRate") ? { taxRate: { from: before.taxRate, to: updated.taxRate } } : {}),
      },
    });
    return updated;
  });
}

export const auditQuerySchema = z.object({
  action: z.string().trim().max(80).optional(),
  entityType: z.string().trim().max(60).optional(),
  userId: z.uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(50),
});

export async function listAuditLogs(actor: Actor, input: unknown) {
  assertCan(actor, "audit:view");
  const q = parseInput(auditQuerySchema, input);
  const hotel = await getHotelOrThrow(db, actor.hotelId);
  const conditions = [eq(auditLogs.hotelId, actor.hotelId)];
  if (q.action) conditions.push(sql`${auditLogs.action} ilike ${q.action + "%"}`);
  if (q.entityType) conditions.push(eq(auditLogs.entityType, q.entityType));
  if (q.userId) conditions.push(eq(auditLogs.userId, q.userId));
  if (q.from && isISODate(q.from)) {
    conditions.push(gte(auditLogs.createdAt, sql`(${q.from}::date)::timestamp AT TIME ZONE ${hotel.timezone}`));
  }
  if (q.to && isISODate(q.to)) {
    conditions.push(lt(auditLogs.createdAt, sql`(${addDaysISO(q.to, 1)}::date)::timestamp AT TIME ZONE ${hotel.timezone}`));
  }
  const where = and(...conditions);
  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(auditLogs).where(where),
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
        userName: users.name,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
  ]);
  return paginated(rows, total, q.page, q.pageSize);
}
