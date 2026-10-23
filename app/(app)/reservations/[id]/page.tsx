import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Ban, Check, Pencil, Plus, Printer, Undo2, Wallet, XCircle } from "lucide-react";
import { ConfirmAction } from "@/components/app/confirm-action";
import { DetailItem } from "@/components/app/field";
import { Money, MoneyCents } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { PaymentStatusBadge, ReservationStatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AddChargeDialog, ReasonDialog, RefundDialog } from "@/features/reservations/folio-actions";
import { RecordPaymentDialog } from "@/features/reservations/record-payment-dialog";
import { StayActions } from "@/features/reservations/stay-actions";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { guestCount, PAYMENT_METHOD_LABELS, RESERVATION_STATUS_LABELS } from "@/lib/format";
import { can } from "@/lib/permissions";
import { canTransition, editableFields } from "@/lib/reservation-rules";
import { formatDateTime, formatDisplayDate, nightsBetween } from "@/lib/utils/dates";
import { fromCents, toCents } from "@/lib/utils/money";
import { hotelToday } from "@/server/services/common";
import { getReservationDetail } from "@/server/services/reservations";
import { getHotelSettings } from "@/server/services/settings";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Reservation" };

export default async function ReservationDetailPage({ params }: PageProps<"/reservations/[id]">) {
  const actor = await requirePageActor("reservations:view");
  const { id } = await params;
  const [detail, hotel] = await Promise.all([
    getReservationDetail(actor, id).catch((e) => {
      if (e instanceof NotFoundError || e instanceof ValidationError) notFound();
      throw e;
    }),
    getHotelSettings(actor),
  ]);
  const { reservation: r, balance, payments, charges, history } = detail;
  const currency = hotel.currency;
  const today = hotelToday(hotel);
  const tz = hotel.timezone;
  const methods = hotel.enabledPaymentMethods;
  const manage = can(actor.role, "reservations:manage");
  const guestName = `${r.guest.firstName} ${r.guest.lastName}`;
  const nights = nightsBetween(r.checkInDate, r.checkOutDate);

  // Refundable amount per payment = amount − completed refunds linked to it.
  const refundedByPayment = new Map<string, number>();
  for (const p of payments) {
    if (p.kind === "refund" && p.status === "completed" && p.refundOfPaymentId) {
      refundedByPayment.set(p.refundOfPaymentId, (refundedByPayment.get(p.refundOfPaymentId) ?? 0) + toCents(p.amount));
    }
  }

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {r.reservationNumber} <ReservationStatusBadge status={r.status} />
          </span>
        }
        description={`${guestName} · Room ${r.room.roomNumber} (${r.room.roomType.name}) · ${formatDisplayDate(r.checkInDate)} → ${formatDisplayDate(r.checkOutDate)}`}
        actions={
          <>
            {manage && r.status === "pending" ? (
              <ConfirmAction
                trigger={
                  <Button variant="outline">
                    <Check /> Confirm
                  </Button>
                }
                title="Confirm reservation?"
                description="The tentative hold becomes a confirmed booking."
                url={`/api/reservations/${r.id}/confirm`}
                successMessage="Reservation confirmed."
              />
            ) : null}
            {manage && editableFields(r.status) !== "none" ? (
              <Button asChild variant="outline">
                <Link href={`/reservations/${r.id}/edit`}>
                  <Pencil /> {r.status === "checked_in" ? "Extend / amend" : "Edit"}
                </Link>
              </Button>
            ) : null}
            {manage && canTransition(r.status, "cancelled") ? (
              <ReasonDialog
                trigger={
                  <Button variant="outline" className="text-destructive">
                    <XCircle /> Cancel
                  </Button>
                }
                title={`Cancel ${r.reservationNumber}?`}
                description={
                  <p>
                    Room {r.room.roomNumber} will be released. Payments are kept; any amount paid becomes a credit that you can
                    refund. This cannot be undone.
                  </p>
                }
                url={`/api/reservations/${r.id}/cancel`}
                confirmLabel="Cancel reservation"
                reasonLabel="Cancellation reason"
                successMessage="Reservation cancelled."
              />
            ) : null}
            {can(actor.role, "frontdesk:operate") ? (
              <StayActions
                stay={{
                  id: r.id,
                  reservationNumber: r.reservationNumber,
                  status: r.status,
                  guestName,
                  roomNumber: r.room.roomNumber,
                  balance: fromCents(balance.balance),
                  checkInDate: r.checkInDate,
                  housekeepingStatus: r.room.housekeepingStatus,
                }}
                today={today}
                currency={currency}
                methods={methods}
                show={["checkin", "checkout", "noshow"]}
              />
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stay</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <DetailItem label="Check-in">{formatDisplayDate(r.checkInDate, "EEE dd MMM yyyy")}</DetailItem>
              <DetailItem label="Check-out">{formatDisplayDate(r.checkOutDate, "EEE dd MMM yyyy")}</DetailItem>
              <DetailItem label="Nights">{nights}</DetailItem>
              <DetailItem label="Guests">{guestCount(r.adults, r.children)}</DetailItem>
              <DetailItem label="Room">
                <Link href={`/rooms/${r.roomId}`} className="hover:underline">
                  {r.room.roomNumber} · {r.room.roomType.name}
                </Link>
              </DetailItem>
              <DetailItem label="Created by">{r.creator?.name}</DetailItem>
              {r.checkedInAt ? <DetailItem label="Checked in">{formatDateTime(r.checkedInAt, tz)}</DetailItem> : null}
              {r.checkedOutAt ? <DetailItem label="Checked out">{formatDateTime(r.checkedOutAt, tz)}</DetailItem> : null}
              {r.cancelledAt ? <DetailItem label="Cancelled">{formatDateTime(r.cancelledAt, tz)}</DetailItem> : null}
            </dl>
            {r.cancellationReason ? (
              <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                Cancellation reason: {r.cancellationReason}
              </p>
            ) : null}
            {r.specialRequests ? (
              <div className="mt-4">
                <p className="text-muted-foreground text-xs">Special requests</p>
                <p className="mt-0.5 text-sm whitespace-pre-wrap">{r.specialRequests}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Guest</CardTitle>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/guests/${r.guestId}`}>Profile</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4">
              <DetailItem label="Name">{guestName}</DetailItem>
              <DetailItem label="Phone">{r.guest.phone}</DetailItem>
              <DetailItem label="Email">{r.guest.email}</DetailItem>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Folio</CardTitle>
            <CardDescription>Totals calculated on the server.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <Line label={`${nights} × `} value={<Money value={r.nightlyRate} currency={currency} />} />
            <Line label="Room subtotal" value={<Money value={r.subtotal} currency={currency} />} />
            {toCents(r.discountAmount) > 0 ? (
              <Line label="Discount" value={<>− <Money value={r.discountAmount} currency={currency} /></>} />
            ) : null}
            <Line label={`Tax (${Number(r.taxRate)}%)`} value={<Money value={r.taxAmount} currency={currency} />} />
            <Line
              label={r.status === "cancelled" || r.status === "no_show" ? "Room total (waived)" : "Room total"}
              value={<MoneyCents cents={balance.roomTotal} currency={currency} />}
              strong
            />
            <Line label="Additional charges" value={<MoneyCents cents={balance.charges} currency={currency} />} />
            <Line label="Payments" value={<>− <MoneyCents cents={balance.paid} currency={currency} /></>} />
            {balance.refunded > 0 ? (
              <Line label="Refunds" value={<>+ <MoneyCents cents={balance.refunded} currency={currency} /></>} />
            ) : null}
            <div className="mt-1 flex items-center justify-between border-t pt-3">
              <span className="font-semibold">{balance.balance < 0 ? "Credit due to guest" : "Balance due"}</span>
              <MoneyCents
                cents={Math.abs(balance.balance)}
                currency={currency}
                className={`text-lg font-semibold ${balance.balance > 0 ? "text-rose-700" : balance.balance < 0 ? "text-violet-700" : "text-emerald-700"}`}
              />
            </div>
            {can(actor.role, "payments:record") && balance.balance > 0 ? (
              <RecordPaymentDialog
                trigger={
                  <Button className="mt-2">
                    <Wallet /> Record payment
                  </Button>
                }
                reservation={{ id: r.id, reservationNumber: r.reservationNumber, balance: fromCents(balance.balance), guestName }}
                currency={currency}
                methods={methods}
              />
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4 gap-2 pb-0">
        <CardHeader>
          <CardTitle className="text-base">Additional charges</CardTitle>
          {can(actor.role, "charges:manage") && r.status !== "pending" ? (
            <CardAction>
              <AddChargeDialog
                reservationId={r.id}
                currency={currency}
                trigger={
                  <Button size="sm" variant="outline">
                    <Plus /> Add charge
                  </Button>
                }
              />
            </CardAction>
          ) : null}
        </CardHeader>
        {charges.length === 0 ? (
          <p className="text-muted-foreground px-5 pb-5 text-sm">No additional charges.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Posted</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>By</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {charges.map((c) => (
                <TableRow key={c.id} className={c.status === "voided" ? "text-muted-foreground" : undefined}>
                  <TableCell>{formatDateTime(c.createdAt, tz)}</TableCell>
                  <TableCell className={c.status === "voided" ? "line-through" : undefined}>
                    {c.description}
                    {c.status === "voided" ? <span className="block text-xs no-underline">Voided: {c.voidReason}</span> : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c.quantity}</TableCell>
                  <TableCell className="text-right">
                    <Money value={c.unitPrice} currency={currency} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Money value={c.totalAmount} currency={currency} />
                  </TableCell>
                  <TableCell>{c.createdByName}</TableCell>
                  <TableCell className="text-right">
                    {c.status === "active" && can(actor.role, "charges:void") ? (
                      <ReasonDialog
                        trigger={
                          <Button size="sm" variant="ghost">
                            <Ban /> Void
                          </Button>
                        }
                        title="Void charge?"
                        description={`"${c.description}" will be removed from the balance. The record is kept in the folio and audit log.`}
                        url={`/api/charges/${c.id}/void`}
                        confirmLabel="Void charge"
                        successMessage="Charge voided."
                      />
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="mt-4 gap-2 pb-0">
        <CardHeader>
          <CardTitle className="text-base">Payments &amp; refunds</CardTitle>
          <CardDescription>Append-only ledger. Corrections are made with refunds or voids, never edits.</CardDescription>
        </CardHeader>
        {payments.length === 0 ? (
          <p className="text-muted-foreground px-5 pb-5 text-sm">No payments recorded.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Received by</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => {
                const refundable = toCents(p.amount) - (refundedByPayment.get(p.id) ?? 0);
                return (
                  <TableRow key={p.id} className={p.status === "voided" ? "text-muted-foreground" : undefined}>
                    <TableCell>{formatDateTime(p.paidAt, tz)}</TableCell>
                    <TableCell>
                      <PaymentStatusBadge status={p.status} kind={p.kind} />
                      {p.status === "voided" && p.voidReason ? <span className="block text-xs">{p.voidReason}</span> : null}
                      {p.kind === "refund" && p.notes ? <span className="text-muted-foreground block text-xs">{p.notes}</span> : null}
                    </TableCell>
                    <TableCell>{PAYMENT_METHOD_LABELS[p.method]}</TableCell>
                    <TableCell className="max-w-40 truncate">{p.transactionReference ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {p.kind === "refund" ? "− " : ""}
                      <Money value={p.amount} currency={currency} />
                    </TableCell>
                    <TableCell>{p.receivedByName}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/payments/${p.id}/receipt`} target="_blank">
                            <Printer /> Receipt
                          </Link>
                        </Button>
                        {p.kind === "payment" && p.status === "completed" && refundable > 0 && can(actor.role, "payments:refund") ? (
                          <RefundDialog
                            paymentId={p.id}
                            maxAmount={fromCents(refundable)}
                            defaultMethod={p.method}
                            methods={methods}
                            currency={currency}
                            trigger={
                              <Button size="sm" variant="ghost">
                                <Undo2 /> Refund
                              </Button>
                            }
                          />
                        ) : null}
                        {p.status === "completed" && can(actor.role, "payments:void") ? (
                          <ReasonDialog
                            trigger={
                              <Button size="sm" variant="ghost" className="text-destructive">
                                <Ban /> Void
                              </Button>
                            }
                            title={`Void this ${p.kind}?`}
                            description="Use only for entries recorded in error. The entry is kept but no longer counts towards the balance."
                            url={`/api/payments/${p.id}/void`}
                            confirmLabel="Void entry"
                            successMessage="Entry voided."
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Status history</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="relative grid gap-4 border-l pl-5">
            {history.map((h) => (
              <li key={h.id} className="relative">
                <span className="bg-primary absolute top-1.5 -left-[25px] size-2 rounded-full ring-4 ring-white" aria-hidden />
                <p className="text-sm">
                  <span className="font-medium">
                    {h.fromStatus ? `${RESERVATION_STATUS_LABELS[h.fromStatus]} → ` : ""}
                    {RESERVATION_STATUS_LABELS[h.toStatus]}
                  </span>{" "}
                  <span className="text-muted-foreground">by {h.changedByName}</span>
                </p>
                <p className="text-muted-foreground text-xs">{formatDateTime(h.createdAt, tz)}</p>
                {h.note ? <p className="mt-0.5 text-sm">{h.note}</p> : null}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </>
  );
}

function Line({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${strong ? "font-medium" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
