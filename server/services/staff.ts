import "server-only";
import { and, asc, count, eq, ne, sql } from "drizzle-orm";
import { users } from "@/db/schema";
import { db, type DbExecutor } from "@/lib/db";
import { ConflictError, NotFoundError, PG_UNIQUE_VIOLATION, pgErrorCode } from "@/lib/errors";
import { hashPassword } from "@/lib/password";
import { idSchema } from "@/lib/validations/common";
import { createStaffSchema, resetPasswordSchema, updateStaffSchema } from "@/lib/validations/staff";
import { assertCan, type Actor } from "../actor";
import { writeAudit } from "../audit";
import { parseInput } from "./common";

const publicColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  active: users.active,
  lastLoginAt: users.lastLoginAt,
  createdAt: users.createdAt,
};

export async function listStaff(actor: Actor) {
  assertCan(actor, "staff:manage");
  return db.select(publicColumns).from(users).where(eq(users.hotelId, actor.hotelId)).orderBy(asc(users.name));
}

export async function createStaff(actor: Actor, input: unknown) {
  assertCan(actor, "staff:manage");
  const data = parseInput(createStaffSchema, input);
  const passwordHash = await hashPassword(data.password);
  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ hotelId: actor.hotelId, name: data.name, email: data.email, role: data.role, passwordHash })
        .returning(publicColumns);
      await writeAudit(tx, actor, {
        action: "staff.created",
        entityType: "user",
        entityId: user.id,
        metadata: { email: user.email, role: user.role },
      });
      return user;
    });
  } catch (err) {
    if (pgErrorCode(err) === PG_UNIQUE_VIOLATION) throw new ConflictError("A staff account with this email already exists.");
    throw err;
  }
}

async function activeAdminCountExcluding(tx: DbExecutor, hotelId: string, userId: string) {
  const [row] = await tx
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.hotelId, hotelId), eq(users.role, "admin"), eq(users.active, true), ne(users.id, userId)));
  return row.n;
}

export async function updateStaff(actor: Actor, userId: string, input: unknown) {
  assertCan(actor, "staff:manage");
  const id = parseInput(idSchema, userId);
  const data = parseInput(updateStaffSchema, input);
  return db.transaction(async (tx) => {
    // Lock all admins of the hotel so two concurrent demotions cannot remove the last admin.
    await tx.execute(sql`select id from users where hotel_id = ${actor.hotelId} and role = 'admin' for update`);
    const current = await tx.query.users.findFirst({ where: and(eq(users.id, id), eq(users.hotelId, actor.hotelId)) });
    if (!current) throw new NotFoundError("Staff member");

    const losesAdmin =
      current.role === "admin" && current.active && ((data.role && data.role !== "admin") || data.active === false);
    if (losesAdmin && (await activeAdminCountExcluding(tx, actor.hotelId, id)) === 0) {
      throw new ConflictError("At least one active administrator is required.");
    }
    if (id === actor.id && (data.active === false || (data.role && data.role !== "admin"))) {
      throw new ConflictError("You cannot deactivate or demote your own account.");
    }

    const securityChange = (data.role && data.role !== current.role) || (data.active !== undefined && data.active !== current.active);
    const [updated] = await tx
      .update(users)
      .set({
        ...data,
        // Revoke existing sessions when access level changes.
        ...(securityChange ? { sessionVersion: current.sessionVersion + 1 } : {}),
      })
      .where(eq(users.id, id))
      .returning(publicColumns);
    await writeAudit(tx, actor, {
      action: "staff.updated",
      entityType: "user",
      entityId: id,
      metadata: {
        email: updated.email,
        role: { from: current.role, to: updated.role },
        active: { from: current.active, to: updated.active },
      },
    });
    return updated;
  });
}

export async function resetStaffPassword(actor: Actor, userId: string, input: unknown) {
  assertCan(actor, "staff:manage");
  const id = parseInput(idSchema, userId);
  const { password } = parseInput(resetPasswordSchema, input);
  const passwordHash = await hashPassword(password);
  return db.transaction(async (tx) => {
    const current = await tx.query.users.findFirst({ where: and(eq(users.id, id), eq(users.hotelId, actor.hotelId)) });
    if (!current) throw new NotFoundError("Staff member");
    await tx
      .update(users)
      .set({ passwordHash, sessionVersion: current.sessionVersion + 1 })
      .where(eq(users.id, id));
    await writeAudit(tx, actor, {
      action: "staff.password_reset",
      entityType: "user",
      entityId: id,
      metadata: { email: current.email },
    });
  });
}
