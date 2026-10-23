import Link from "next/link";
import { HousekeepingBadge, ROOM_STATE_STYLES, roomState, type RoomState } from "@/components/app/status-badge";
import { cn } from "@/lib/utils";

type BoardRoom = {
  id: string;
  roomNumber: string;
  floor: number;
  roomTypeName: string;
  operationalStatus: string;
  housekeepingStatus: string;
  occupied: boolean;
  occupantName: string | null;
  arrivingToday: boolean;
  departingToday: boolean;
};

export function RoomStateLegend() {
  return (
    <ul className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" aria-label="Legend">
      {(Object.keys(ROOM_STATE_STYLES) as RoomState[]).map((s) => (
        <li key={s} className="inline-flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-sm", ROOM_STATE_STYLES[s].dot)} aria-hidden />
          {ROOM_STATE_STYLES[s].label}
        </li>
      ))}
      <li className="inline-flex items-center gap-1.5">
        <span className="rounded border border-amber-300 bg-amber-50 px-1 text-[10px] text-amber-800">ARR</span> Arrival today
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span className="rounded border border-violet-300 bg-violet-50 px-1 text-[10px] text-violet-800">DEP</span> Departure due
      </li>
    </ul>
  );
}

/** Visual floor-by-floor board. Colour is always paired with a text label. */
export function RoomBoard({ rooms, linkRooms = true }: { rooms: BoardRoom[]; linkRooms?: boolean }) {
  const floors = Array.from(new Set(rooms.map((r) => r.floor))).sort((a, b) => a - b);
  return (
    <div className="grid gap-5">
      {floors.map((floor) => (
        <section key={floor} aria-label={`Floor ${floor}`}>
          <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">Floor {floor}</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {rooms
              .filter((r) => r.floor === floor)
              .map((r) => {
                const state = roomState(r);
                const s = ROOM_STATE_STYLES[state];
                const content = (
                  <>
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-base font-semibold tabular-nums">{r.roomNumber}</span>
                      <span className="flex gap-1">
                        {r.arrivingToday ? (
                          <span className="rounded border border-amber-300 bg-amber-50 px-1 text-[10px] text-amber-800">ARR</span>
                        ) : null}
                        {r.departingToday ? (
                          <span className="rounded border border-violet-300 bg-violet-50 px-1 text-[10px] text-violet-800">DEP</span>
                        ) : null}
                      </span>
                    </div>
                    <p className="text-muted-foreground truncate text-xs">{r.roomTypeName}</p>
                    <p className="mt-1 truncate text-xs font-medium">
                      {s.label}
                      {r.occupantName ? ` · ${r.occupantName}` : ""}
                    </p>
                    <div className="mt-1.5">
                      <HousekeepingBadge status={r.housekeepingStatus} />
                    </div>
                  </>
                );
                const cls = cn(
                  "bg-card block rounded-md border border-l-4 p-2.5 shadow-xs transition-colors",
                  s.tile,
                  state === "maintenance" || state === "out_of_service" ? "bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,rgba(0,0,0,0.03)_6px,rgba(0,0,0,0.03)_12px)]" : "",
                  linkRooms && "hover:bg-muted/40",
                );
                return linkRooms ? (
                  <Link key={r.id} href={`/rooms/${r.id}`} className={cls}>
                    {content}
                  </Link>
                ) : (
                  <div key={r.id} className={cls}>
                    {content}
                  </div>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}
