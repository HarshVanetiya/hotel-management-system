"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useApiAction } from "@/hooks/use-api-action";
import { apiRequest } from "@/lib/api-client";
import { formatCents, formatMoney } from "@/lib/utils/money";
import { RecordPaymentDialog } from "./record-payment-dialog";

type Folio = {
  reservationNumber: string;
  balance: { roomTotal: number; charges: number; paid: number; refunded: number; netPaid: number; balance: number };
  charges: { id: string; description: string; totalAmount: string }[];
};

export function CheckOutDialog({
  reservationId,
  guestName,
  roomNumber,
  currency,
  methods,
  trigger,
}: {
  reservationId: string;
  guestName: string;
  roomNumber: string;
  currency: string;
  methods: string[];
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [folio, setFolio] = useState<Folio | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const { run, pending } = useApiAction();

  async function load() {
    setLoadError(null);
    try {
      setFolio(await apiRequest<Folio>(`/api/reservations/${reservationId}`));
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }

  useEffect(() => {
    if (open) {
      setFolio(null);
      setAck(false);
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const b = folio?.balance;
  const owing = b ? b.balance > 0 : false;
  const fmt = (c: number) => formatCents(c, currency);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Check out room {roomNumber}</DialogTitle>
          <DialogDescription>
            {guestName}
            {folio ? ` · ${folio.reservationNumber}` : ""}
          </DialogDescription>
        </DialogHeader>
        {loadError ? <p className="text-destructive text-sm">{loadError}</p> : null}
        {!b ? (
          !loadError && (
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" /> Calculating final balance…
            </div>
          )
        ) : (
          <div className="grid gap-3">
            <dl className="divide-y rounded-md border text-sm">
              <Row label="Room total (incl. tax)" value={fmt(b.roomTotal)} />
              <Row label="Additional charges" value={fmt(b.charges)} />
              {folio!.charges.map((c) => (
                <Row key={c.id} label={`· ${c.description}`} value={formatMoney(c.totalAmount, currency)} muted />
              ))}
              <Row label="Payments received" value={`− ${fmt(b.paid)}`} />
              {b.refunded > 0 ? <Row label="Refunds issued" value={`+ ${fmt(b.refunded)}`} /> : null}
              <div className="flex items-center justify-between px-3 py-2.5">
                <dt className="font-semibold">{b.balance < 0 ? "Credit due to guest" : "Balance due"}</dt>
                <dd className={`text-base font-semibold tabular-nums ${owing ? "text-rose-700" : "text-emerald-700"}`}>
                  {fmt(Math.abs(b.balance))}
                </dd>
              </div>
            </dl>
            {owing ? (
              <div className="grid gap-3 rounded-md border border-rose-200 bg-rose-50 p-3">
                <p className="text-sm text-rose-800">
                  This guest has an unpaid balance. Record the payment before checking out, or confirm that the guest is
                  leaving with an outstanding balance (this is recorded in the audit log).
                </p>
                <RecordPaymentDialog
                  trigger={
                    <Button size="sm" variant="outline" className="w-fit bg-white">
                      Record payment
                    </Button>
                  }
                  reservation={{
                    id: reservationId,
                    reservationNumber: folio!.reservationNumber,
                    balance: (b.balance / 100).toFixed(2),
                    guestName,
                  }}
                  currency={currency}
                  methods={methods}
                />
                <div className="flex items-start gap-2">
                  <Checkbox id={`ack-${reservationId}`} checked={ack} onCheckedChange={(v) => setAck(v === true)} />
                  <Label htmlFor={`ack-${reservationId}`} className="text-sm leading-snug font-normal">
                    Check out with {fmt(b.balance)} unpaid
                  </Label>
                </div>
              </div>
            ) : null}
            {b.balance < 0 ? (
              <p className="text-sm text-violet-800">
                The guest has a credit. Issue a refund from the reservation&apos;s payment history after check-out.
              </p>
            ) : null}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => void load()} disabled={pending}>
            Refresh balance
          </Button>
          <Button
            disabled={!b || pending || (owing && !ack)}
            onClick={async () => {
              const res = await run(
                `/api/reservations/${reservationId}/check-out`,
                { acknowledgeOutstandingBalance: ack },
                { successMessage: `Room ${roomNumber} checked out. Housekeeping task created.` },
              );
              if (res) setOpen(false);
            }}
          >
            {pending ? <Loader2 className="animate-spin" /> : <LogOut />}
            Complete check-out
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 ${muted ? "text-muted-foreground text-xs" : ""}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
