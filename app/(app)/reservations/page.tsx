import type { Metadata } from "next";
import Link from "next/link";
import { CalendarPlus, Search } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { Pagination } from "@/components/app/pagination";
import { SortableHeader } from "@/components/app/sortable-header";
import { ReservationStatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RESERVATION_STATUS_LABELS } from "@/lib/format";
import { can } from "@/lib/permissions";
import { flatParams } from "@/lib/search-params";
import { formatDisplayDate } from "@/lib/utils/dates";
import { reservationListQuerySchema } from "@/lib/validations/reservation";
import { listReservations } from "@/server/services/reservations";
import { listRoomTypes } from "@/server/services/rooms";
import { getHotelSettings } from "@/server/services/settings";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Reservations" };

export default async function ReservationsPage({ searchParams }: PageProps<"/reservations">) {
  const actor = await requirePageActor("reservations:view");
  const params = flatParams(await searchParams);
  const parsed = reservationListQuerySchema.safeParse(params);
  const query = parsed.success ? parsed.data : reservationListQuerySchema.parse({});
  const [result, roomTypes, hotel] = await Promise.all([
    listReservations(actor, query),
    listRoomTypes(actor, { includeInactive: true }),
    getHotelSettings(actor),
  ]);
  const sortProps = { pathname: "/reservations", params, sort: query.sort, dir: query.dir };

  return (
    <>
      <PageHeader
        title="Reservations"
        description="Search, filter and manage bookings. Date filters match stays that overlap the range."
        actions={
          can(actor.role, "reservations:manage") ? (
            <Button asChild>
              <Link href="/reservations/new">
                <CalendarPlus /> New reservation
              </Link>
            </Button>
          ) : null
        }
      />
      <Card className="gap-0 py-0">
        <form className="grid gap-3 border-b p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]" method="get">
          <div className="grid gap-1">
            <Label htmlFor="q" className="text-xs">
              Search
            </Label>
            <div className="relative">
              <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" aria-hidden />
              <Input id="q" name="q" defaultValue={query.q ?? ""} placeholder="Number, guest, phone, email" className="pl-8" />
            </div>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="status" className="text-xs">
              Status
            </Label>
            <NativeSelect id="status" name="status" defaultValue={query.status ?? ""}>
              <option value="">Any status</option>
              {Object.entries(RESERVATION_STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="roomTypeId" className="text-xs">
              Room type
            </Label>
            <NativeSelect id="roomTypeId" name="roomTypeId" defaultValue={query.roomTypeId ?? ""}>
              <option value="">Any type</option>
              {roomTypes.map((rt) => (
                <option key={rt.id} value={rt.id}>
                  {rt.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="from" className="text-xs">
              From
            </Label>
            <Input id="from" name="from" type="date" defaultValue={query.from ?? ""} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="to" className="text-xs">
              To
            </Label>
            <Input id="to" name="to" type="date" defaultValue={query.to ?? ""} />
          </div>
          <div className="flex items-end gap-2">
            <input type="hidden" name="sort" value={query.sort} />
            <input type="hidden" name="dir" value={query.dir} />
            <Button type="submit" variant="secondary">
              Apply
            </Button>
            <Button asChild variant="ghost">
              <Link href="/reservations">Reset</Link>
            </Button>
          </div>
        </form>
        {!parsed.success ? (
          <p className="text-destructive px-3 pt-2 text-sm">Some filters were invalid and have been ignored.</p>
        ) : null}
        {result.rows.length === 0 ? (
          <EmptyState title="No reservations match" description="Adjust the filters or create a new reservation." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHeader label="Reservation" field="reservationNumber" {...sortProps} />
                <SortableHeader label="Guest" field="guestName" {...sortProps} />
                <TableHead>Room</TableHead>
                <SortableHeader label="Check-in" field="checkInDate" {...sortProps} />
                <SortableHeader label="Check-out" field="checkOutDate" {...sortProps} />
                <TableHead>Status</TableHead>
                <SortableHeader label="Total" field="totalAmount" className="text-right" {...sortProps} />
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/reservations/${r.id}`} className="text-primary font-medium hover:underline">
                      {r.reservationNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{r.guestName}</span>
                    {r.guestPhone ? <span className="text-muted-foreground block text-xs">{r.guestPhone}</span> : null}
                  </TableCell>
                  <TableCell>
                    {r.roomNumber}
                    <span className="text-muted-foreground block text-xs">{r.roomTypeName}</span>
                  </TableCell>
                  <TableCell className="tabular-nums">{formatDisplayDate(r.checkInDate)}</TableCell>
                  <TableCell className="tabular-nums">{formatDisplayDate(r.checkOutDate)}</TableCell>
                  <TableCell>
                    <ReservationStatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Money value={r.totalAmount} currency={hotel.currency} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Money value={r.balance} currency={hotel.currency} emphasizeBalance />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pagination pathname="/reservations" params={params} {...result} />
      </Card>
    </>
  );
}
