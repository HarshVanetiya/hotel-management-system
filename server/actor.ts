import { ForbiddenError } from "@/lib/errors";
import { can, type Permission, type Role } from "@/lib/permissions";

/** The authenticated staff member performing an operation (loaded from the DB per request). */
export type Actor = {
  id: string;
  hotelId: string;
  role: Role;
  name: string;
  email: string;
};

export function assertCan(actor: Actor, permission: Permission): void {
  if (!can(actor.role, permission)) throw new ForbiddenError();
}
