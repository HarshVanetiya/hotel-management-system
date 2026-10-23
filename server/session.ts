import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, homePathForRole, type Permission } from "@/lib/permissions";
import type { Actor } from "./actor";

/**
 * Resolves the signed-in staff member for this request. The user row is
 * re-read so deactivation, role changes and password resets (which bump
 * sessionVersion) take effect immediately, not when the JWT expires.
 */
export const getActor = cache(async (): Promise<Actor | null> => {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) return null;
  const user = await db.query.users.findFirst({ where: eq(users.id, uid) });
  if (!user || !user.active || user.sessionVersion !== session.user.sessionVersion) return null;
  return { id: user.id, hotelId: user.hotelId, role: user.role, name: user.name, email: user.email };
});

/** For Server Components: redirects to login, or to the role's home page when not permitted. */
export async function requirePageActor(permission?: Permission): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (permission && !can(actor.role, permission)) redirect(`${homePathForRole(actor.role)}?denied=1`);
  return actor;
}
