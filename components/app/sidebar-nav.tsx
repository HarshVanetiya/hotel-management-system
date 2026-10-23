"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BedDouble,
  CalendarCheck,
  CalendarRange,
  ChartColumn,
  ConciergeBell,
  CreditCard,
  LayoutDashboard,
  ScrollText,
  Settings,
  SprayCan,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/navigation";

const ICONS: Record<string, LucideIcon> = {
  BedDouble,
  CalendarCheck,
  CalendarRange,
  ChartColumn,
  ConciergeBell,
  CreditCard,
  LayoutDashboard,
  ScrollText,
  Settings,
  SprayCan,
  UserCog,
  Users,
};

export function SidebarNav({
  sections,
  onNavigate,
}: {
  sections: { title?: string; items: NavItem[] }[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-5 px-3" aria-label="Main">
      {sections.map((section, i) => (
        <div key={i} className="flex flex-col gap-0.5">
          {section.title ? (
            <p className="text-muted-foreground px-2 pb-1 text-[11px] font-semibold tracking-wider uppercase">
              {section.title}
            </p>
          ) : null}
          {section.items.map((item) => {
            const Icon = ICONS[item.icon];
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "text-sidebar-foreground hover:bg-sidebar-accent/70 focus-visible:ring-ring/50 flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm outline-none focus-visible:ring-[3px]",
                  active && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
                )}
              >
                {Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
