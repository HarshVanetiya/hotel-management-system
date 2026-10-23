import "server-only";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { housekeepingTasks, reservations, rooms, users } from "@/db/schema";
import { db, type DbExecutor } from "@/lib/db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { idSchema } from "@/lib/validations/common";
import { createTaskSchema, taskStatusSchema, updateTaskSchema } from "@/lib/validations/housekeeping";
import { housekeepingStatusUpdateSchema } from "@/lib/validations/room";
import { assertCan, type Actor } from "../actor";
import { writeAudit } from "../audit";
import { parseInput } from "./common";

type HousekeepingStatus = (typeof rooms.$inferSelect)["housekeepingStatus"];

/**
 * Housekeeping status rules. Housekeeping only ever changes the cleaning
 * state; it never changes operational status, and occupancy is derived from
 * checked-in reservations, so cleaning a room can never make an occupied or
 * maintenance room sellable.
 *  - "inspected" (ready for arrival) requires the inspect permission, and is
 *    rejected while the room is occupied or not in service.
 */
export function housekeepingTransitionProblem(params: {
  role: Actor["role"];
  target: HousekeepingStatus;
  operationalStatus: string;
  occupied: boolean;
}): string | null {
  if (params.target === "inspected") {
    if (!can(params.role, "housekeeping:inspect")) return "Only a supervisor can mark a room as inspected.";
    if (params.occupied) return "An occupied room cannot be marked inspected (ready for arrival).";
    if (params.operationalStatus !== "in_service") {
      return "A room that is not in service cannot be marked inspected.";
    }
  }
  return null;
}

async function isOccupied(tx: DbExecutor, roomId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: reservations.id })
    .from(reservations)
    .where(and(eq(reservations.roomId, roomId), eq(reservations.status, "checked_in")))
    .limit(1);
  return Boolean(row);
}

async function applyRoomHousekeepingStatus(
  tx: DbExecutor,
  actor: Actor,
  roomId: string,
  target: HousekeepingStatus,
  source: string,
) {
  const [room] = await tx
    .select()
    .from(rooms)
    .where(and(eq(rooms.id, roomId), eq(rooms.hotelId, actor.hotelId)))
    .for("update");
  if (!room) throw new NotFoundError("Room");
  const problem = housekeepingTransitionProblem({
    role: actor.role,
    target,
    operationalStatus: room.operationalStatus,
    occupied: await isOccupied(tx, roomId),
  });
  if (problem) throw new ConflictError(problem);
  if (room.housekeepingStatus === target) return room;
  const [updated] = await tx
    .update(rooms)
    .set({ housekeepingStatus: target })
    .where(eq(rooms.id, roomId))
    .returning();
  await writeAudit(tx, actor, {
    action: "room.housekeeping_status_changed",
    entityType: "room",
    entityId: roomId,
    metadata: { roomNumber: room.roomNumber, from: room.housekeepingStatus, to: target, source },
  });
  return updated;
}

export async function setRoomHousekeepingStatus(actor: Actor, roomId: string, input: unknown) {
  assertCan(actor, "housekeeping:update");
  const id = parseInput(idSchema, roomId);
  const { housekeepingStatus } = parseInput(housekeepingStatusUpdateSchema, input);
  return db.transaction((tx) => applyRoomHousekeepingStatus(tx, actor, id, housekeepingStatus, "manual"));
}

export const taskListQuerySchema = z.object({
  status: z.union([taskStatusSchema, z.literal("open")]).default("open"),
  floor: z.coerce.number().int().optional(),
  roomId: idSchema.optional(),
  assignedTo: z.union([idSchema, z.literal("me"), z.literal("unassigned")]).optional(),
});

/** Housekeeping staff only see tasks assigned to them or unassigned tasks. */
export async function listTasks(actor: Actor, input: unknown = {}) {
  assertCan(actor, "housekeeping:view");
  const q = parseInput(taskListQuerySchema, input);
  const seeAll = can(actor.role, "housekeeping:viewAll");
  const assignee =
    q.assignedTo === "me"
      ? eq(housekeepingTasks.assignedTo, actor.id)
      : q.assignedTo === "unassigned"
        ? isNull(housekeepingTasks.assignedTo)
        : q.assignedTo
          ? eq(housekeepingTasks.assignedTo, q.assignedTo)
          : undefined;
  const priorityOrder = sql`case ${housekeepingTasks.priority} when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`;
  return db
    .select({
      id: housekeepingTasks.id,
      type: housekeepingTasks.type,
      status: housekeepingTasks.status,
      priority: housekeepingTasks.priority,
      notes: housekeepingTasks.notes,
      dueAt: housekeepingTasks.dueAt,
      completedAt: housekeepingTasks.completedAt,
      createdAt: housekeepingTasks.createdAt,
      roomId: rooms.id,
      roomNumber: rooms.roomNumber,
      floor: rooms.floor,
      roomHousekeepingStatus: rooms.housekeepingStatus,
      assignedTo: housekeepingTasks.assignedTo,
      assigneeName: users.name,
    })
    .from(housekeepingTasks)
    .innerJoin(rooms, eq(rooms.id, housekeepingTasks.roomId))
    .leftJoin(users, eq(users.id, housekeepingTasks.assignedTo))
    .where(
      and(
        eq(rooms.hotelId, actor.hotelId),
        q.status === "open"
          ? inArray(housekeepingTasks.status, ["pending", "in_progress"])
          : eq(housekeepingTasks.status, q.status),
        q.floor !== undefined ? eq(rooms.floor, q.floor) : undefined,
        q.roomId ? eq(rooms.id, q.roomId) : undefined,
        assignee,
        seeAll ? undefined : or(eq(housekeepingTasks.assignedTo, actor.id), isNull(housekeepingTasks.assignedTo)),
      ),
    )
    .orderBy(priorityOrder, asc(housekeepingTasks.dueAt), desc(housekeepingTasks.createdAt))
    .limit(200);
}

async function assertAssignable(tx: DbExecutor, actor: Actor, userId: string | null | undefined) {
  if (!userId) return;
  const user = await tx.query.users.findFirst({
    where: and(eq(users.id, userId), eq(users.hotelId, actor.hotelId), eq(users.active, true)),
  });
  if (!user) throw new ValidationError("Assignee not found or inactive.", { fieldErrors: { assignedTo: "Invalid assignee" } });
}

export async function createTask(actor: Actor, input: unknown) {
  assertCan(actor, "housekeeping:manage");
  const data = parseInput(createTaskSchema, input);
  return db.transaction(async (tx) => {
    const room = await tx.query.rooms.findFirst({
      where: and(eq(rooms.id, data.roomId), eq(rooms.hotelId, actor.hotelId)),
    });
    if (!room) throw new NotFoundError("Room");
    await assertAssignable(tx, actor, data.assignedTo);
    const [task] = await tx
      .insert(housekeepingTasks)
      .values({ ...data, createdBy: actor.id })
      .returning();
    await writeAudit(tx, actor, {
      action: "housekeeping_task.created",
      entityType: "housekeeping_task",
      entityId: task.id,
      metadata: { roomNumber: room.roomNumber, type: task.type, priority: task.priority },
    });
    return task;
  });
}

const CLEANING_TYPES = new Set(["checkout_clean", "stayover_clean", "deep_clean"]);

/**
 * Updates a task. Housekeeping staff may only progress tasks that are
 * assigned to them or unassigned (claiming them); assignment, priority and
 * cancellation require the manage permission. Completing a cleaning task
 * marks the room clean; completing an inspection marks it inspected (subject
 * to the same occupancy / maintenance rules).
 */
export async function updateTask(actor: Actor, taskId: string, input: unknown) {
  assertCan(actor, "housekeeping:update");
  const id = parseInput(idSchema, taskId);
  const data = parseInput(updateTaskSchema, input);
  const manage = can(actor.role, "housekeeping:manage");

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ task: housekeepingTasks, hotelId: rooms.hotelId })
      .from(housekeepingTasks)
      .innerJoin(rooms, eq(rooms.id, housekeepingTasks.roomId))
      .where(eq(housekeepingTasks.id, id))
      .for("update", { of: housekeepingTasks });
    if (!row || row.hotelId !== actor.hotelId) throw new NotFoundError("Task");
    const task = row.task;

    if (!manage) {
      if (task.assignedTo && task.assignedTo !== actor.id) throw new ForbiddenError("This task is assigned to someone else.");
      if (data.priority !== undefined || data.status === "cancelled") throw new ForbiddenError();
      if (data.assignedTo !== undefined && data.assignedTo !== actor.id) throw new ForbiddenError();
    }
    if (task.status === "completed" || task.status === "cancelled") {
      throw new ConflictError("This task is already closed.");
    }
    if (data.assignedTo !== undefined) await assertAssignable(tx, actor, data.assignedTo);

    const patch: Partial<typeof housekeepingTasks.$inferInsert> = {};
    if (data.priority) patch.priority = data.priority;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.assignedTo !== undefined) patch.assignedTo = data.assignedTo;
    // Starting an unassigned task claims it.
    if (!manage && !task.assignedTo && data.status) patch.assignedTo = actor.id;

    if (data.status && data.status !== task.status) {
      patch.status = data.status;
      if (data.status === "in_progress" && CLEANING_TYPES.has(task.type)) {
        await applyRoomHousekeepingStatus(tx, actor, task.roomId, "cleaning", "task_started");
      }
      if (data.status === "completed") {
        patch.completedAt = new Date();
        if (CLEANING_TYPES.has(task.type)) {
          await applyRoomHousekeepingStatus(tx, actor, task.roomId, "clean", "task_completed");
        } else if (task.type === "inspection") {
          await applyRoomHousekeepingStatus(tx, actor, task.roomId, "inspected", "task_completed");
        }
      }
    }

    const [updated] = await tx.update(housekeepingTasks).set(patch).where(eq(housekeepingTasks.id, id)).returning();
    await writeAudit(tx, actor, {
      action: "housekeeping_task.updated",
      entityType: "housekeeping_task",
      entityId: id,
      metadata: { from: task.status, to: updated.status, assignedTo: updated.assignedTo, priority: updated.priority },
    });
    return updated;
  });
}

export async function listHousekeepingStaff(actor: Actor) {
  assertCan(actor, "housekeeping:manage");
  return db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(and(eq(users.hotelId, actor.hotelId), eq(users.active, true), inArray(users.role, ["housekeeping", "admin"])))
    .orderBy(asc(users.name));
}
