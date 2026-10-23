/**
 * Role-based access control. This module is the single source of truth for
 * what each role may do; it is enforced in server services and route
 * handlers. Navigation uses the same map, but hiding UI is never the check.
 */
export const ROLES = ["admin", "receptionist", "housekeeping"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = {
  "dashboard:view": ["admin", "receptionist"],
  "rooms:view": ["admin", "receptionist"],
  "rooms:manage": ["admin"],
  "rooms:setStatus": ["admin", "receptionist"],
  "roomTypes:manage": ["admin"],
  "reservations:view": ["admin", "receptionist"],
  "reservations:manage": ["admin", "receptionist"],
  "guests:view": ["admin", "receptionist"],
  "guests:manage": ["admin", "receptionist"],
  "guests:viewIdentification": ["admin", "receptionist"],
  "frontdesk:operate": ["admin", "receptionist"],
  "payments:view": ["admin", "receptionist"],
  "payments:record": ["admin", "receptionist"],
  "payments:refund": ["admin", "receptionist"],
  "payments:void": ["admin"],
  "charges:manage": ["admin", "receptionist"],
  "charges:void": ["admin"],
  "housekeeping:view": ["admin", "receptionist", "housekeeping"],
  "housekeeping:update": ["admin", "receptionist", "housekeeping"],
  "housekeeping:inspect": ["admin", "receptionist"],
  "housekeeping:manage": ["admin", "receptionist"],
  "housekeeping:viewAll": ["admin", "receptionist"],
  "calendar:view": ["admin", "receptionist"],
  "reports:view": ["admin"],
  "reports:export": ["admin"],
  "staff:manage": ["admin"],
  "settings:manage": ["admin"],
  "audit:view": ["admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/** The page a role lands on after sign-in. */
export function homePathForRole(role: Role): string {
  return role === "housekeeping" ? "/housekeeping" : "/dashboard";
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  receptionist: "Receptionist",
  housekeeping: "Housekeeping",
};
