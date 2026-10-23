import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, Printer, Wallet } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { Pagination } from "@/components/app/pagination";
import { PaymentStatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RecordPaymentDialog } from "@/features/reservations/record-payment-dialog";
import { PAYMENT_METHOD_LABELS } from "@/lib/format";
import { can } from "@/lib/permissions";
import { flatParams } from "@/lib/search-params";
import { formatDateTime } from "@/lib/utils/dates";
import { paymentListQuerySchema } from "@/lib/validations/payment";
import { listPayments } from "@/server/services/payments";
import { runOutstanding } from "@/server/services/payments-outstanding";
import { getHotelSettings } from "@/server/services/settings";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage({ searchParams }: PageProps<"/payments">) {
  const actor = await requirePageActor("payments:view");
  const params = flatParams(await searchParams);
  const parsed = paymentListQuerySchema.safeParse(params);
  const [result, hotel, outstanding] = await Promise.all([
    listPayments(actor, parsed.success ? parsed.data : {}),
    getHotelSettings(actor),
    runOutstanding(actor),
  ]);
  const currency = hotel.currency;

  return (
    <>
      <PageHeader
        title="Payments"
        description={`Payment and refund ledger. Dates are hotel-local (${hotel.timezone}).`}
        actions={
          can(actor.role, "payments:record") ? (
            <RecordPaymentDialog
              trigger={
                <Button>
                  <Wallet /> Record payment
                </Button>
              }
              currency={currency}
              methods={hotel.enabledPaymentMethods}
            />
          ) : null
        }
      />

      <Card className="mb-4 gap-2 pb-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-5">
          <h2 className="font-semibold">Outstanding balances</h2>
          <p className="text-muted-foreground text-sm">
            {outstanding.length} reservation(s) owe{" "}
            <Money value={outstanding.reduce((s, r) => s + Number(r.balance), 0).toFixed(2)} currency={currency} className="text-foreground font-medium" />
          </p>
        </div>
        {outstanding.length === 0 ? (
          <p className="text-muted-foreground px-5 pb-5 text-sm">No open reservation owes money.</p>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reservation</TableHead>
                  <TableHead>Guest</TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {outstanding.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/reservations/${r.id}`} className="text-primary font-medium hover:underline">
                        {r.reservationNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{r.guestName}</TableCell>
                    <TableCell>{r.roomNumber}</TableCell>
                    <TableCell className="text-xs capitalize">{r.status.replace("_", " ")}</TableCell>
                    <TableCell className="text-right">
                      <Money value={r.balance} currency={currency} emphasizeBalance />
                    </TableCell>
                    <TableCell className="text-right">
                      {can(actor.role, "payments:record") ? (
                        <RecordPaymentDialog
                          trigger={
                            <Button size="sm" variant="outline">
                              Collect
                            </Button>
                          }
                          reservation={{ id: r.id, reservationNumber: r.reservationNumber, balance: r.balance, guestName: r.guestName }}
                          currency={currency}
                          methods={hotel.enabledPaymentMethods}
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Card className="gap-0 py-0">
        <form method="get" className="grid gap-3 border-b p-3 sm:grid-cols-3 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto]">
          <div className="grid gap-1">
            <Label htmlFor="q" className="text-xs">
              Search
            </Label>
            <Input id="q" name="q" defaultValue={params.q ?? ""} placeholder="Reservation, guest or reference" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="from" className="text-xs">
              From
            </Label>
            <Input id="from" name="from" type="date" defaultValue={params.from ?? ""} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="to" className="text-xs">
              To
            </Label>
            <Input id="to" name="to" type="date" defaultValue={params.to ?? ""} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="method" className="text-xs">
              Method
            </Label>
            <NativeSelect id="method" name="method" defaultValue={params.method ?? ""}>
              <option value="">Any</option>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="kind" className="text-xs">
              Type
            </Label>
            <NativeSelect id="kind" name="kind" defaultValue={params.kind ?? ""}>
              <option value="">Payments &amp; refunds</option>
              <option value="payment">Payments</option>
              <option value="refund">Refunds</option>
            </NativeSelect>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="status" className="text-xs">
              Status
            </Label>
            <NativeSelect id="status" name="status" defaultValue={params.status ?? ""}>
              <option value="">Any</option>
              <option value="completed">Completed</option>
              <option value="voided">Voided</option>
            </NativeSelect>
          </div>
          <div className="flex items-end gap-2">
            <Button type="submit" variant="secondary">
              Apply
            </Button>
            <Button asChild variant="ghost">
              <Link href="/payments">Reset</Link>
            </Button>
          </div>
        </form>
        <div className="text-muted-foreground border-b px-3 py-2 text-sm">
          Net collected for this filter (completed payments − refunds):{" "}
          <Money value={result.netCollected} currency={currency} className="text-foreground font-semibold" />
        </div>
        {result.rows.length === 0 ? (
          <EmptyState icon={CreditCard} title="No payments match" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Reservation</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="hidden lg:table-cell">Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="hidden md:table-cell">Received by</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((p) => (
                <TableRow key={p.id} className={p.status === "voided" ? "text-muted-foreground" : undefined}>
                  <TableCell>{formatDateTime(p.paidAt, hotel.timezone)}</TableCell>
                  <TableCell>
                    <Link href={`/reservations/${p.reservationId}`} className="text-primary hover:underline">
                      {p.reservationNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{p.guestName}</TableCell>
                  <TableCell>
                    <PaymentStatusBadge status={p.status} kind={p.kind} />
                  </TableCell>
                  <TableCell>{PAYMENT_METHOD_LABELS[p.method]}</TableCell>
                  <TableCell className="hidden max-w-40 truncate lg:table-cell">{p.transactionReference ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    {p.kind === "refund" ? "− " : ""}
                    <Money value={p.amount} currency={currency} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{p.receivedByName}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/payments/${p.id}/receipt`} target="_blank" aria-label="Printable receipt">
                        <Printer />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pagination pathname="/payments" params={params} {...result} />
      </Card>
    </>
  );
}
