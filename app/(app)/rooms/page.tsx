import type { Metadata } from "next";
import Link from "next/link";
import { LayoutGrid, List, Plus, Tags } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { hrefWith } from "@/components/app/pagination";
import { PageHeader } from "@/components/app/page-header";
import { HousekeepingBadge, RoomStateBadge, roomState } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RoomBoard, RoomStateLegend } from "@/features/rooms/room-board";
import { RoomFormDialog, RoomStatusDialog } from "@/features/rooms/room-dialogs";
import { HOUSEKEEPING_LABELS, OPERATIONAL_LABELS } from "@/lib/format";
import { can } from "@/lib/permissions";
import { flatParams } from "@/lib/search-params";
import { cn } from "@/lib/utils";
import { listRoomTypes, listRooms, roomListQuerySchema } from "@/server/services/rooms";
import { getHotelSettings } from "@/server/services/settings";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Rooms" };

export default async function RoomsPage({ searchParams }: PageProps<"/rooms">) {
  const actor = await requirePageActor("rooms:view");
  const params = flatParams(await searchParams);
  const view = params.view === "board" ? "board" : "list";
  const parsed = roomListQuerySchema.safeParse(params);
  const [rooms, roomTypes, allRooms, hotel] = await Promise.all([
    listRooms(actor, parsed.success ? parsed.data : {}),
    listRoomTypes(actor, { includeInactive: true }),
    listRooms(actor, {}),
    getHotelSettings(actor),
  ]);
  const floors = Array.from(new Set(allRooms.map((r) => r.floor))).sort((a, b) => a - b);
  const manage = can(actor.role, "rooms:manage");
  const setStatus = can(actor.role, "rooms:setStatus");

  return (
    <>
      <PageHeader
        title="Rooms"
        description="Inventory, room status and cleaning state. Occupancy comes from checked-in reservations."
        actions={
          <>
            {manage ? (
              <Button asChild variant="outline">
                <Link href="/rooms/types">
                  <Tags /> Room types
                </Link>
              </Button>
            ) : null}
            {manage ? (
              <RoomFormDialog
                roomTypes={roomTypes.filter((t) => t.active)}
                trigger={
                  <Button>
                    <Plus /> Add room
                  </Button>
                }
              />
            ) : null}
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="bg-muted inline-flex rounded-lg p-[3px]" role="tablist" aria-label="View">
          {(["list", "board"] as const).map((v) => (
            <Link
              key={v}
              role="tab"
              aria-selected={view === v}
              href={hrefWith("/rooms", params, { view: v === "list" ? undefined : v })}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm",
                view === v ? "bg-background font-medium shadow-sm" : "text-muted-foreground",
              )}
            >
              {v === "list" ? <List className="size-4" /> : <LayoutGrid className="size-4" />}
              {v === "list" ? "List" : "Board"}
            </Link>
          ))}
        </div>
        <RoomStateLegend />
      </div>
      <Card className="gap-0 py-0">
        <form method="get" className="grid gap-3 border-b p-3 sm:grid-cols-3 lg:grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_auto]">
          {view === "board" ? <input type="hidden" name="view" value="board" /> : null}
          <div className="grid gap-1">
            <Label htmlFor="q" className="text-xs">
              Room number
            </Label>
            <Input id="q" name="q" defaultValue={params.q ?? ""} placeholder="e.g. 204" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="floor" className="text-xs">
              Floor
            </Label>
            <NativeSelect id="floor" name="floor" defaultValue={params.floor ?? ""}>
              <option value="">All floors</option>
              {floors.map((f) => (
                <option key={f} value={f}>
                  Floor {f}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="roomTypeId" className="text-xs">
              Type
            </Label>
            <NativeSelect id="roomTypeId" name="roomTypeId" defaultValue={params.roomTypeId ?? ""}>
              <option value="">All types</option>
              {roomTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="occupancy" className="text-xs">
              Occupancy
            </Label>
            <NativeSelect id="occupancy" name="occupancy" defaultValue={params.occupancy ?? ""}>
              <option value="">Any</option>
              <option value="occupied">Occupied</option>
              <option value="vacant">Vacant</option>
            </NativeSelect>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="operationalStatus" className="text-xs">
              Room status
            </Label>
            <NativeSelect id="operationalStatus" name="operationalStatus" defaultValue={params.operationalStatus ?? ""}>
              <option value="">Any</option>
              {Object.entries(OPERATIONAL_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="housekeepingStatus" className="text-xs">
              Cleaning
            </Label>
            <NativeSelect id="housekeepingStatus" name="housekeepingStatus" defaultValue={params.housekeepingStatus ?? ""}>
              <option value="">Any</option>
              {Object.entries(HOUSEKEEPING_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex items-end gap-2">
            <Button type="submit" variant="secondary">
              Filter
            </Button>
            <Button asChild variant="ghost">
              <Link href={view === "board" ? "/rooms?view=board" : "/rooms"}>Reset</Link>
            </Button>
          </div>
        </form>
        {rooms.length === 0 ? (
          <EmptyState title="No rooms match" description={allRooms.length === 0 ? "Add room types and rooms to get started." : "Adjust the filters."} />
        ) : view === "board" ? (
          <div className="p-4">
            <RoomBoard rooms={rooms} />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Room</TableHead>
                <TableHead>Floor</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Base rate</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Cleaning</TableHead>
                <TableHead className="hidden xl:table-cell">Guest</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rooms.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/rooms/${r.id}`} className="text-primary font-semibold tabular-nums hover:underline">
                      {r.roomNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums">{r.floor}</TableCell>
                  <TableCell>
                    {r.roomTypeName}
                    <span className="text-muted-foreground block text-xs">up to {r.capacity} guests</span>
                  </TableCell>
                  <TableCell className="text-right">{r.basePrice ? <Money value={r.basePrice} currency={hotel.currency} /> : "—"}</TableCell>
                  <TableCell>
                    <RoomStateBadge state={roomState(r)} />
                  </TableCell>
                  <TableCell>
                    <HousekeepingBadge status={r.housekeepingStatus} />
                  </TableCell>
                  <TableCell className="hidden xl:table-cell">{r.occupantName ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {setStatus ? (
                        <RoomStatusDialog
                          room={r}
                          trigger={
                            <Button size="sm" variant="ghost">
                              Status
                            </Button>
                          }
                        />
                      ) : null}
                      {manage ? (
                        <RoomFormDialog
                          room={r}
                          roomTypes={roomTypes.filter((t) => t.active || t.id === r.roomTypeId)}
                          trigger={
                            <Button size="sm" variant="ghost">
                              Edit
                            </Button>
                          }
                        />
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
