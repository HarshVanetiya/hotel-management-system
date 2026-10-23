import { Hotel } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { DeniedToast } from "@/components/app/denied-toast";
import { MobileNav } from "@/components/app/mobile-nav";
import { SidebarNav } from "@/components/app/sidebar-nav";
import { UserMenu } from "@/components/app/user-menu";
import { NAV_SECTIONS } from "@/lib/navigation";
import { can, homePathForRole, ROLE_LABELS } from "@/lib/permissions";
import { formatDisplayDate } from "@/lib/utils/dates";
import { getHotelSettings } from "@/server/services/settings";
import { hotelToday } from "@/server/services/common";
import { requirePageActor } from "@/server/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const actor = await requirePageActor();
  const hotel = await getHotelSettings(actor);
  const sections = NAV_SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => can(actor.role, i.permission)) })).filter(
    (s) => s.items.length > 0,
  );
  const today = hotelToday(hotel);

  return (
    <div className="flex min-h-screen">
      <aside className="bg-sidebar sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r lg:flex">
        <Link href={homePathForRole(actor.role)} className="flex items-center gap-2 border-b px-5 py-4">
          <Hotel className="text-primary size-5" aria-hidden />
          <span className="truncate text-sm font-semibold">{hotel.name}</span>
        </Link>
        <div className="flex-1 overflow-y-auto py-4">
          <SidebarNav sections={sections} />
        </div>
        <p className="text-muted-foreground border-t px-5 py-3 text-[11px]">
          Times shown in {hotel.timezone}
        </p>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-4 backdrop-blur sm:px-6">
          <MobileNav sections={sections} hotelName={hotel.name} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium lg:hidden">{hotel.name}</p>
            <p className="text-muted-foreground text-xs sm:text-sm">
              Business date <span className="text-foreground font-medium">{formatDisplayDate(today, "EEE, dd MMM yyyy")}</span>
            </p>
          </div>
          <UserMenu name={actor.name} email={actor.email} roleLabel={ROLE_LABELS[actor.role]} />
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6">{children}</main>
        <Suspense>
          <DeniedToast />
        </Suspense>
      </div>
    </div>
  );
}
