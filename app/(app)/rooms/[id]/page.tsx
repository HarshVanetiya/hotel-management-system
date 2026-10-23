import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, CalendarPlus } from "lucide-react";
import { ConfirmAction } from "@/components/app/confirm-action";
import { DetailItem } from "@/components/app/field";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { HousekeepingBadge, OperationalBadge, ReservationStatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HousekeepingStatusControl, RoomFormDialog, RoomStatusDialog } from "@/features/rooms/room-dialogs";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { formatDisplayDate } from "@/lib/utils/dates";
import { getRoomDetail, listRoomTypes } from "@/server/services/rooms";
import { getHotelSettings } from "@/server/services/settings";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Room" };

export default async function RoomDetailPage({ params }: PageProps<"/rooms/[id]">) {
  const actor = await requirePageActor("rooms:view");
  const { id } = await params;
  const [detail, hotel, roomTypes] = await Promise.all([
    getRoomDetail(actor, id).catch((e) => {
      if (e instanceof NotFoundError || e instanceof ValidationError) notFound();
      throw e;
    }),
    getHotelSettings(actor),
    listRoomTypes(actor, { includeInactive: true }),
  ]);
  const { room, upcoming } = detail;
  const occupied = upcoming.some((u) => u.status === "checked_in");
  return (
    <>
      <PageHeader
        title={`Room ${room.roomNumber}`}
        description={`${room.roomType.name} · Floor ${room.floor}${room.archivedAt ? " · Archived" : ""}`}
        actions={
          <>
            {can(actor.role, "rooms:setStatus") ? (
              <RoomStatusDialog room={{ ...room, occupied }} trigger={<Button variant="outline">Change status</Button>} />
            ) : null}
            {can(actor.role, "rooms:manage") ? (
              <RoomFormDialog room={room} roomTypes={roomTypes} trigger={<Button variant="outline">Edit</Button>} />
            ) : null}
            {can(actor.role, "rooms:manage") && !room.archivedAt ? (
              <ConfirmAction
                trigger={
                  <Button variant="ghost" className="text-destructive">
                    <Archive /> Archive
                  </Button>
                }
                title={`Archive room ${room.roomNumber}?`}
                description="The room is removed from inventory but its history is kept. Rooms with active or upcoming reservations cannot be archived."
                url={`/api/rooms/${room.id}/archive`}
                confirmLabel="Archive room"
                destructive
                successMessage="Room archived."
              />
            ) : null}
            {can(actor.role, "reservations:manage") && room.operationalStatus === "in_service" ? (
              <Button asChild>
                <Link href={`/reservations/new?roomId=${room.id}`}>
                  <CalendarPlus /> Book this room
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <DetailItem label="Operational status">
                <OperationalBadge status={room.operationalStatus} />
              </DetailItem>
              <DetailItem label="Occupancy">{occupied ? "Occupied" : "Vacant"}</DetailItem>
              <DetailItem label="Cleaning">
                {can(actor.role, "housekeeping:update") ? (
                  <HousekeepingStatusControl
                    roomId={room.id}
                    roomNumber={room.roomNumber}
                    value={room.housekeepingStatus}
                    allowInspect={can(actor.role, "housekeeping:inspect")}
                  />
                ) : (
                  <HousekeepingBadge status={room.housekeepingStatus} />
                )}
              </DetailItem>
              <DetailItem label="Max guests">{room.roomType.capacity}</DetailItem>
              <DetailItem label="Base rate">
                <Money value={room.roomType.basePrice} currency={hotel.currency} />
              </DetailItem>
              <DetailItem label="Amenities">{room.roomType.amenities.join(", ") || "—"}</DetailItem>
            </dl>
            {room.notes ? <p className="bg-muted/50 mt-4 rounded-md border px-3 py-2 text-sm">{room.notes}</p> : null}
          </CardContent>
        </Card>
        <Card className="gap-2 pb-0 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Current and upcoming reservations</CardTitle>
          </CardHeader>
          {upcoming.length === 0 ? (
            <p className="text-muted-foreground px-5 pb-5 text-sm">No upcoming reservations.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reservation</TableHead>
                  <TableHead>Guest</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcoming.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <Link href={`/reservations/${u.id}`} className="text-primary font-medium hover:underline">
                        {u.reservationNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{u.guestName}</TableCell>
                    <TableCell>
                      {formatDisplayDate(u.checkInDate)} → {formatDisplayDate(u.checkOutDate)}
                    </TableCell>
                    <TableCell>
                      <ReservationStatusBadge status={u.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
