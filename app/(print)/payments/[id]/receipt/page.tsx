import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MoneyCents, Money } from "@/components/app/money";
import { PrintButton } from "@/features/payments/print-button";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { PAYMENT_METHOD_LABELS } from "@/lib/format";
import { formatDateTime, formatDisplayDate } from "@/lib/utils/dates";
import { getPaymentReceipt } from "@/server/services/payments";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Payment receipt" };

export default async function ReceiptPage({ params }: PageProps<"/payments/[id]/receipt">) {
  const actor = await requirePageActor("payments:view");
  const { id } = await params;
  const r = await getPaymentReceipt(actor, id).catch((e) => {
    if (e instanceof NotFoundError || e instanceof ValidationError) notFound();
    throw e;
  });
  const { payment: p, reservation: res, hotel, guest } = r;
  const isRefund = p.kind === "refund";
  const shortId = p.id.slice(0, 8).toUpperCase();

  return (
    <main className="mx-auto max-w-xl px-6 py-10 print:py-0">
      <div className="no-print mb-6 flex justify-end">
        <PrintButton />
      </div>
      <article className="rounded-lg border bg-white p-8 print:border-0 print:p-0">
        <header className="flex items-start justify-between gap-4 border-b pb-4">
          <div>
            <h1 className="text-lg font-semibold">{hotel.name}</h1>
            {hotel.address ? <p className="text-muted-foreground text-sm whitespace-pre-line">{hotel.address}</p> : null}
            <p className="text-muted-foreground text-sm">{[hotel.phone, hotel.email].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold tracking-wide uppercase">{isRefund ? "Refund receipt" : "Payment receipt"}</p>
            <p className="text-muted-foreground text-xs">No. {shortId}</p>
          </div>
        </header>
        {p.status === "voided" ? (
          <p className="mt-4 rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
            VOIDED — this entry was cancelled on {formatDateTime(p.voidedAt!, hotel.timezone)}: {p.voidReason}
          </p>
        ) : null}
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <dt className="text-muted-foreground">Date</dt>
          <dd>{formatDateTime(p.paidAt, hotel.timezone)}</dd>
          <dt className="text-muted-foreground">Guest</dt>
          <dd>
            {guest.firstName} {guest.lastName}
          </dd>
          <dt className="text-muted-foreground">Reservation</dt>
          <dd>
            {res.reservationNumber} · Room {r.roomNumber}
          </dd>
          <dt className="text-muted-foreground">Stay</dt>
          <dd>
            {formatDisplayDate(res.checkInDate)} → {formatDisplayDate(res.checkOutDate)}
          </dd>
          <dt className="text-muted-foreground">Method</dt>
          <dd>{PAYMENT_METHOD_LABELS[p.method]}</dd>
          {p.transactionReference ? (
            <>
              <dt className="text-muted-foreground">Reference</dt>
              <dd className="break-all">{p.transactionReference}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">{isRefund ? "Refunded by" : "Received by"}</dt>
          <dd>{r.receivedByName}</dd>
        </dl>
        <div className="mt-6 flex items-center justify-between border-y py-4">
          <span className="font-medium">{isRefund ? "Amount refunded" : "Amount received"}</span>
          <Money value={p.amount} currency={hotel.currency} className="text-xl font-semibold" />
        </div>
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {r.balance.balance < 0 ? "Credit due to guest (as of now)" : "Remaining balance (as of now)"}
          </span>
          <MoneyCents cents={Math.abs(r.balance.balance)} currency={hotel.currency} className="font-medium" />
        </div>
        <p className="text-muted-foreground mt-8 text-center text-xs">Thank you for staying with us.</p>
      </article>
    </main>
  );
}
