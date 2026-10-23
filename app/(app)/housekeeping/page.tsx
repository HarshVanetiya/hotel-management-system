import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { PriorityBadge, RoomStateBadge, TaskStatusBadge, roomState } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreateTaskDialog, TaskActions } from "@/features/housekeeping/task-controls";
import { HousekeepingStatusControl } from "@/features/rooms/room-dialogs";
import { HOUSEKEEPING_LABELS, TASK_STATUS_LABELS, TASK_TYPE_LABELS } from "@/lib/format";
import { can } from "@/lib/permissions";
import { flatParams } from "@/lib/search-params";
import { formatDateTime } from "@/lib/utils/dates";
import { listHousekeepingStaff, listTasks, taskListQuerySchema } from "@/server/services/housekeeping";
import { listRooms } from "@/server/services/rooms";
import { getHotelSettings } from "@/server/services/settings";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Housekeeping" };

export default async function HousekeepingPage({ searchParams }: PageProps<"/housekeeping">) {
  const actor = await requirePageActor("housekeeping:view");
  const params = flatParams(await searchParams);
  const manage = can(actor.role, "housekeeping:manage");
  const parsedTasks = taskListQuerySchema.safeParse(params);
  const floor = params.floor && /^-?\d+$/.test(params.floor) ? Number(params.floor) : undefined;
  const hkFilter = params.hk && params.hk in HOUSEKEEPING_LABELS ? params.hk : undefined;

  const [tasks, rooms, staff, hotel] = await Promise.all([
    listTasks(actor, parsedTasks.success ? parsedTasks.data : {}),
    listRooms(actor, { floor, housekeepingStatus: hkFilter }),
    manage ? listHousekeepingStaff(actor) : Promise.resolve([]),
    getHotelSettings(actor),
  ]);
  const allFloors = Array.from(new Set((await listRooms(actor, {})).map((r) => r.floor))).sort((a, b) => a - b);
  const counts = rooms.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.housekeepingStatus]: (acc[r.housekeepingStatus] ?? 0) + 1 }), {});
  const allowInspect = can(actor.role, "housekeeping:inspect");

  return (
    <>
      <PageHeader
        title="Housekeeping"
        description={
          manage
            ? "Cleaning status and tasks for every room. Changing cleaning status never changes whether a room can be sold."
            : "Your assigned tasks and unassigned tasks you can pick up."
        }
        actions={
          manage ? (
            <CreateTaskDialog
              rooms={rooms.map((r) => ({ id: r.id, roomNumber: r.roomNumber }))}
              staff={staff}
              trigger={
                <Button>
                  <Plus /> New task
                </Button>
              }
            />
          ) : null
        }
      />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label htmlFor="floor" className="text-xs">
            Floor
          </Label>
          <NativeSelect id="floor" name="floor" defaultValue={params.floor ?? ""} className="w-32">
            <option value="">All floors</option>
            {allFloors.map((f) => (
              <option key={f} value={f}>
                Floor {f}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="hk" className="text-xs">
            Cleaning status
          </Label>
          <NativeSelect id="hk" name="hk" defaultValue={params.hk ?? ""} className="w-36">
            <option value="">Any</option>
            {Object.entries(HOUSEKEEPING_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="status" className="text-xs">
            Task status
          </Label>
          <NativeSelect id="status" name="status" defaultValue={params.status ?? "open"} className="w-36">
            <option value="open">Open</option>
            {Object.entries(TASK_STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="assignedTo" className="text-xs">
            Assigned
          </Label>
          <NativeSelect id="assignedTo" name="assignedTo" defaultValue={params.assignedTo ?? ""} className="w-40">
            <option value="">Anyone</option>
            <option value="me">Me</option>
            <option value="unassigned">Unassigned</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        <Button asChild variant="ghost">
          <Link href="/housekeeping">Reset</Link>
        </Button>
      </form>

      <Card className="mb-4 gap-2 pb-0">
        <CardHeader>
          <CardTitle className="text-base">Tasks</CardTitle>
          <CardDescription>Ordered by priority. Completing a cleaning task marks the room clean.</CardDescription>
        </CardHeader>
        {tasks.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No tasks" description="Nothing matches the current filters." />
        ) : (
          <>
          {/* Phone layout: one card per task so actions stay reachable without scrolling sideways. */}
          <ul className="divide-y md:hidden">
            {tasks.map((t) => (
              <li key={t.id} className="grid gap-2 px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold tabular-nums">
                      Room {t.roomNumber} <span className="text-muted-foreground text-xs font-normal">· Floor {t.floor}</span>
                    </p>
                    <p className="text-sm">{TASK_TYPE_LABELS[t.type]}</p>
                    {t.notes ? <p className="text-muted-foreground text-xs">{t.notes}</p> : null}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <PriorityBadge priority={t.priority} />
                    <TaskStatusBadge status={t.status} />
                  </div>
                </div>
                <p className="text-muted-foreground text-xs">{t.assigneeName ?? "Unassigned"}</p>
                {t.status === "pending" || t.status === "in_progress" ? (
                  <TaskActions task={t} canManage={manage} staff={staff} />
                ) : null}
              </li>
            ))}
          </ul>
          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>Room</TableHead>
                <TableHead>Task</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Assigned</TableHead>
                <TableHead className="hidden lg:table-cell">Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-semibold tabular-nums">
                    {t.roomNumber}
                    <span className="text-muted-foreground block text-xs font-normal">Floor {t.floor}</span>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {TASK_TYPE_LABELS[t.type]}
                    {t.notes ? <span className="text-muted-foreground block max-w-xs text-xs">{t.notes}</span> : null}
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={t.priority} />
                  </TableCell>
                  <TableCell>
                    <TaskStatusBadge status={t.status} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{t.assigneeName ?? "Unassigned"}</TableCell>
                  <TableCell className="hidden lg:table-cell">{formatDateTime(t.createdAt, hotel.timezone)}</TableCell>
                  <TableCell>
                    {t.status === "pending" || t.status === "in_progress" ? (
                      <TaskActions task={t} canManage={manage} staff={staff} />
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </>
        )}
      </Card>

      <Card className="gap-2 pb-0">
        <CardHeader>
          <CardTitle className="text-base">Room cleaning board</CardTitle>
          <CardDescription>
            {Object.entries(HOUSEKEEPING_LABELS)
              .map(([v, l]) => `${l}: ${counts[v] ?? 0}`)
              .join(" · ")}
            {allowInspect ? "" : " · Inspection is done by a supervisor."}
          </CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Room</TableHead>
              <TableHead className="hidden sm:table-cell">Type</TableHead>
              <TableHead>Occupancy</TableHead>
              <TableHead className="hidden sm:table-cell">Today</TableHead>
              <TableHead className="text-right">Cleaning</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rooms.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-semibold tabular-nums">
                  {r.roomNumber}
                  <span className="text-muted-foreground block text-xs font-normal">Floor {r.floor}</span>
                </TableCell>
                <TableCell className="hidden sm:table-cell">{r.roomTypeName}</TableCell>
                <TableCell>
                  <RoomStateBadge state={roomState(r)} />
                </TableCell>
                <TableCell className="hidden text-xs sm:table-cell">
                  {[r.departingToday ? "Departure due" : null, r.arrivingToday ? "Arrival expected" : null].filter(Boolean).join(" · ") || "—"}
                </TableCell>
                <TableCell className="flex justify-end">
                  <HousekeepingStatusControl
                    roomId={r.id}
                    roomNumber={r.roomNumber}
                    value={r.housekeepingStatus}
                    allowInspect={allowInspect && !r.occupied && r.operationalStatus === "in_service"}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
