"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { ReservationStatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { useApiAction } from "@/hooks/use-api-action";
import type { ReservationStatus } from "@/lib/format";
import { addDaysISO, formatDisplayDate, nightsBetween } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";

type CalRoom = {
  id: string;
  roomNumber: string;
  roomTypeName: string;
  operationalStatus: string;
  capacity: number;
};
type CalStay = {
  id: string;
  reservationNumber: string;
  roomId: string;
  checkInDate: string;
  checkOutDate: string;
  status: ReservationStatus;
  guestName: string;
  adults: number;
  children: number;
};

const BAR_STYLES: Record<string, string> = {
  pending: "bg-amber-100 border-amber-400 text-amber-900 border-dashed",
  confirmed: "bg-blue-100 border-blue-400 text-blue-900",
  checked_in: "bg-emerald-100 border-emerald-500 text-emerald-900",
  checked_out: "bg-slate-100 border-slate-300 text-slate-600",
};

export function CalendarGrid({
  rooms,
  stays,
  start,
  days,
  today,
  canManage,
}: {
  rooms: CalRoom[];
  stays: CalStay[];
  start: string;
  days: number;
  today: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const { run, pending } = useApiAction();
  const [selected, setSelected] = useState<CalStay | null>(null);
  const dates = useMemo(() => Array.from({ length: days }, (_, i) => addDaysISO(start, i)), [start, days]);
  const byRoom = useMemo(() => {
    const m = new Map<string, CalStay[]>();
    for (const s of stays) m.set(s.roomId, [...(m.get(s.roomId) ?? []), s]);
    return m;
  }, [stays]);
  const movable = selected && (selected.status === "pending" || selected.status === "confirmed");

  /** Occupied nights per room (excluding the selected stay), used to grey out invalid move targets. */
  const busy = useMemo(() => {
    const set = new Set<string>();
    for (const s of stays) {
      if (s.status === "checked_out" || s.id === selected?.id) continue;
      for (let d = s.checkInDate; d < s.checkOutDate; d = addDaysISO(d, 1)) set.add(`${s.roomId}|${d}`);
    }
    return set;
  }, [stays, selected]);

  async function moveTo(room: CalRoom, date: string) {
    if (!selected) return;
    const nights = nightsBetween(selected.checkInDate, selected.checkOutDate);
    const checkOutDate = addDaysISO(date, nights);
    const ok = window.confirm(
      `Move ${selected.reservationNumber} (${selected.guestName}) to room ${room.roomNumber}, ${formatDisplayDate(date)} → ${formatDisplayDate(checkOutDate)}?\n\nAvailability and pricing will be re-checked; the rate changes if the room type differs.`,
    );
    if (!ok) return;
    const res = await run(
      `/api/reservations/${selected.id}`,
      { roomId: room.id, checkInDate: date, checkOutDate },
      { method: "PATCH", successMessage: `${selected.reservationNumber} moved to room ${room.roomNumber}.` },
    );
    if (res) setSelected(null);
  }

  const cols = `minmax(110px,140px) repeat(${days}, minmax(44px, 1fr))`;

  return (
    <div className="grid gap-3">
      {selected ? (
        <div className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 shadow-xs" role="status">
          <div className="text-sm">
            <p className="flex flex-wrap items-center gap-2 font-medium">
              <Link href={`/reservations/${selected.id}`} className="text-primary hover:underline">
                {selected.reservationNumber}
              </Link>
              · {selected.guestName} <ReservationStatusBadge status={selected.status} />
            </p>
            <p className="text-muted-foreground">
              {formatDisplayDate(selected.checkInDate)} → {formatDisplayDate(selected.checkOutDate)} ·{" "}
              {movable && canManage
                ? "Click a free night in any room to move this booking there (same length of stay)."
                : "This booking cannot be moved from the calendar."}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
            <X /> Clear selection
          </Button>
        </div>
      ) : null}

      <div className="bg-card overflow-x-auto rounded-lg border shadow-xs">
        <div className="min-w-max" style={{ minWidth: `${140 + days * 44}px` }}>
          <div className="bg-muted/50 sticky top-0 z-10 grid border-b text-xs" style={{ gridTemplateColumns: cols }}>
            <div className="bg-muted/50 sticky left-0 z-10 px-3 py-2 font-medium">Room</div>
            {dates.map((d) => {
              const weekend = [0, 6].includes(new Date(`${d}T00:00:00`).getDay());
              return (
                <div
                  key={d}
                  className={cn(
                    "border-l px-1 py-1.5 text-center",
                    weekend && "bg-muted",
                    d === today && "bg-primary/10 text-primary font-semibold",
                  )}
                >
                  <div>{formatDisplayDate(d, "EEE")}</div>
                  <div className="tabular-nums">{formatDisplayDate(d, "dd MMM")}</div>
                </div>
              );
            })}
          </div>
          {rooms.map((room) => {
            const blocked = room.operationalStatus !== "in_service";
            return (
              <div key={room.id} className="grid border-b last:border-b-0" style={{ gridTemplateColumns: cols }}>
                <div className="bg-card sticky left-0 z-[5] border-r px-3 py-2" style={{ gridRow: 1, gridColumn: 1 }}>
                  <p className="text-sm font-semibold tabular-nums">{room.roomNumber}</p>
                  <p className="text-muted-foreground truncate text-[11px]">
                    {room.roomTypeName}
                    {blocked ? " · " : ""}
                    {blocked ? <span className="text-rose-700">{room.operationalStatus === "maintenance" ? "Maintenance" : "Out of service"}</span> : null}
                  </p>
                </div>
                {dates.map((d, i) => {
                  const isBusy = busy.has(`${room.id}|${d}`);
                  const past = d < today;
                  const clickable = canManage && !blocked && !isBusy && !past && !pending;
                  const moveTarget = Boolean(movable && clickable);
                  return (
                    <button
                      key={d}
                      type="button"
                      style={{ gridRow: 1, gridColumn: i + 2 }}
                      disabled={!clickable}
                      aria-label={
                        clickable
                          ? `${movable ? "Move selected booking to" : "New booking in"} room ${room.roomNumber} from ${d}`
                          : `Room ${room.roomNumber}, ${d}`
                      }
                      onClick={() => {
                        if (movable) void moveTo(room, d);
                        else router.push(`/reservations/new?roomId=${room.id}&checkIn=${d}&checkOut=${addDaysISO(d, 1)}`);
                      }}
                      className={cn(
                        "min-h-12 border-l",
                        blocked &&
                          "bg-[repeating-linear-gradient(135deg,transparent,transparent_5px,rgba(225,29,72,0.08)_5px,rgba(225,29,72,0.08)_10px)]",
                        d === today && "bg-primary/5",
                        clickable && "hover:bg-primary/10 focus-visible:bg-primary/10 outline-none",
                        moveTarget && "bg-emerald-50/60",
                      )}
                    />
                  );
                })}
                {(byRoom.get(room.id) ?? []).map((s) => {
                  const from = Math.max(0, nightsBetween(start, s.checkInDate));
                  const to = Math.min(days, nightsBetween(start, s.checkOutDate));
                  if (to <= from) return null;
                  const clippedLeft = s.checkInDate < start;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelected(selected?.id === s.id ? null : s)}
                      style={{ gridRow: 1, gridColumn: `${from + 2} / ${to + 2}` }}
                      title={`${s.reservationNumber} · ${s.guestName} · ${s.checkInDate} → ${s.checkOutDate}`}
                      className={cn(
                        "z-[2] mx-0.5 my-1.5 truncate rounded-md border px-2 text-left text-xs font-medium",
                        BAR_STYLES[s.status],
                        clippedLeft && "rounded-l-none",
                        selected?.id === s.id && "ring-primary ring-2 ring-offset-1",
                      )}
                    >
                      {s.guestName}
                      <span className="ml-1 font-normal opacity-75">{s.reservationNumber}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
