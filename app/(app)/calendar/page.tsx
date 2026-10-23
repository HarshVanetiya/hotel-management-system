import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { hrefWith } from "@/components/app/pagination";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { CalendarGrid } from "@/features/calendar/calendar-grid";
import { can } from "@/lib/permissions";
import { flatParams } from "@/lib/search-params";
import { addDaysISO, formatDisplayDate } from "@/lib/utils/dates";
import { calendarQuerySchema, getCalendar } from "@/server/services/operations";
import { listRoomTypes } from "@/server/services/rooms";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const actor = await requirePageActor("calendar:view");
  const params = flatParams(await searchParams);
  const parsed = calendarQuerySchema.safeParse(params);
  const [cal, roomTypes] = await Promise.all([getCalendar(actor, parsed.success ? parsed.data : {}), listRoomTypes(actor)]);
  const end = addDaysISO(cal.start, cal.days - 1);

  return (
    <>
      <PageHeader
        title="Calendar"
        description={`${formatDisplayDate(cal.start)} – ${formatDisplayDate(end)}. Click an empty night to book it, or select a booking to move it.`}
      />
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button asChild variant="outline" size="icon" aria-label="Previous week">
            <Link href={hrefWith("/calendar", params, { start: addDaysISO(cal.start, -7) })}>
              <ChevronLeft />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={hrefWith("/calendar", params, { start: undefined })}>Today</Link>
          </Button>
          <Button asChild variant="outline" size="icon" aria-label="Next week">
            <Link href={hrefWith("/calendar", params, { start: addDaysISO(cal.start, 7) })}>
              <ChevronRight />
            </Link>
          </Button>
        </div>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="start" value={params.start ?? ""} />
          <div className="grid gap-1">
            <Label htmlFor="roomTypeId" className="text-xs">
              Room type
            </Label>
            <NativeSelect id="roomTypeId" name="roomTypeId" defaultValue={params.roomTypeId ?? ""} className="w-40">
              <option value="">All types</option>
              {roomTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="days" className="text-xs">
              Range
            </Label>
            <NativeSelect id="days" name="days" defaultValue={String(cal.days)} className="w-28">
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="21">21 days</option>
              <option value="31">31 days</option>
            </NativeSelect>
          </div>
          <Button type="submit" variant="secondary">
            Apply
          </Button>
        </form>
      </div>
      <ul className="text-muted-foreground mb-3 flex flex-wrap gap-4 text-xs" aria-label="Legend">
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded border border-dashed border-amber-400 bg-amber-100" /> Pending
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded border border-blue-400 bg-blue-100" /> Confirmed
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded border border-emerald-500 bg-emerald-100" /> Checked in
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded border border-slate-300 bg-slate-100" /> Checked out
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded border bg-[repeating-linear-gradient(135deg,transparent,transparent_2px,rgba(225,29,72,0.3)_2px,rgba(225,29,72,0.3)_4px)]" />{" "}
          Not in service
        </li>
      </ul>
      <CalendarGrid
        rooms={cal.rooms}
        stays={cal.reservations}
        start={cal.start}
        days={cal.days}
        today={cal.today}
        canManage={can(actor.role, "reservations:manage")}
      />
    </>
  );
}
