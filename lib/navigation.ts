import type { Permission } from "@/lib/permissions";

export type NavItem = { href: string; label: string; icon: string; permission: Permission };

/** Sidebar entries; each is shown only when the role has the permission (pages re-check on the server). */
export const NAV_SECTIONS: { title?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard", permission: "dashboard:view" },
      { href: "/front-desk", label: "Front desk", icon: "ConciergeBell", permission: "frontdesk:operate" },
      { href: "/reservations", label: "Reservations", icon: "CalendarCheck", permission: "reservations:view" },
      { href: "/calendar", label: "Calendar", icon: "CalendarRange", permission: "calendar:view" },
      { href: "/guests", label: "Guests", icon: "Users", permission: "guests:view" },
      { href: "/rooms", label: "Rooms", icon: "BedDouble", permission: "rooms:view" },
      { href: "/payments", label: "Payments", icon: "CreditCard", permission: "payments:view" },
      { href: "/housekeeping", label: "Housekeeping", icon: "SprayCan", permission: "housekeeping:view" },
      { href: "/reports", label: "Reports", icon: "ChartColumn", permission: "reports:view" },
    ],
  },
  {
    title: "Administration",
    items: [
      { href: "/staff", label: "Staff", icon: "UserCog", permission: "staff:manage" },
      { href: "/settings", label: "Settings", icon: "Settings", permission: "settings:manage" },
      { href: "/audit-log", label: "Audit log", icon: "ScrollText", permission: "audit:view" },
    ],
  },
];
