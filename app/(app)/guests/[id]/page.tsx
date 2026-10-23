import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { DetailItem } from "@/components/app/field";
import { Money, MoneyCents } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { ReservationStatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EditGuestDialog } from "@/features/guests/edit-guest-dialog";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { ID_TYPE_LABELS } from "@/lib/format";
import { can } from "@/lib/permissions";
import { formatDisplayDate } from "@/lib/utils/dates";
import { getGuestProfile } from "@/server/services/guests";
import { getHotelSettings } from "@/server/services/settings";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Guest profile" };

export default async function GuestProfilePage({ params }: PageProps<"/guests/[id]">) {
  const actor = await requirePageActor("guests:view");
  const { id } = await params;
  const [profile, hotel] = await Promise.all([
    getGuestProfile(actor, id).catch((e) => {
      if (e instanceof NotFoundError || e instanceof ValidationError) notFound();
      throw e;
    }),
    getHotelSettings(actor),
  ]);
  const { guest: g, history, totalStays, outstandingCents } = profile;
  const name = `${g.firstName} ${g.lastName}`;
  const manage = can(actor.role, "guests:manage");

  return (
    <>
      <PageHeader
        title={name}
        description={`Guest since ${formatDisplayDate(g.createdAt.toISOString().slice(0, 10))}`}
        actions={
          <>
            {manage ? <EditGuestDialog guest={{ ...g }} /> : null}
            {can(actor.role, "reservations:manage") ? (
              <Button asChild>
                <Link href={`/reservations/new?guestId=${g.id}&guestName=${encodeURIComponent(name)}`}>
                  <CalendarPlus /> New reservation
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Contact &amp; identification</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <DetailItem label="Phone">{g.phone}</DetailItem>
              <DetailItem label="Email">{g.email}</DetailItem>
              <DetailItem label="Address">{g.address}</DetailItem>
              <DetailItem label="Identification">
                {g.identificationType ? `${ID_TYPE_LABELS[g.identificationType] ?? g.identificationType} · ` : ""}
                {g.identificationReference ?? (g.identificationType ? "—" : null)}
              </DetailItem>
            </dl>
            {g.notes ? (
              <div className="mt-4">
                <p className="text-muted-foreground text-xs">Notes &amp; preferences</p>
                <p className="mt-0.5 text-sm whitespace-pre-wrap">{g.notes}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <DetailItem label="Completed / current stays">{totalStays}</DetailItem>
            <DetailItem label="Reservations">{history.length}</DetailItem>
            <DetailItem label="Outstanding balance">
              <MoneyCents
                cents={outstandingCents}
                currency={hotel.currency}
                className={outstandingCents > 0 ? "font-semibold text-rose-700" : undefined}
              />
            </DetailItem>
          </CardContent>
        </Card>
      </div>
      <Card className="mt-4 gap-2 pb-0">
        <CardHeader>
          <CardTitle className="text-base">Reservation history</CardTitle>
        </CardHeader>
        {history.length === 0 ? (
          <p className="text-muted-foreground px-5 pb-5 text-sm">No reservations yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reservation</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/reservations/${r.id}`} className="text-primary font-medium hover:underline">
                      {r.reservationNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{r.roomNumber}</TableCell>
                  <TableCell>
                    {formatDisplayDate(r.checkInDate)} → {formatDisplayDate(r.checkOutDate)}
                  </TableCell>
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
      </Card>
    </>
  );
}
