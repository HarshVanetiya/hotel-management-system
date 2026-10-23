"use client";

import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Field } from "@/components/app/field";
import { useApiAction } from "@/hooks/use-api-action";
import { useKeyedFetch } from "@/hooks/use-keyed-fetch";
import { apiRequest } from "@/lib/api-client";
import { PAYMENT_METHOD_LABELS } from "@/lib/format";
import { formatMoney, toCents } from "@/lib/utils/money";
import { cn } from "@/lib/utils";

const schema = z.object({
  amount: z
    .string()
    .trim()
    .regex(/^\d{1,10}(\.\d{1,2})?$/, "Enter an amount with up to 2 decimals")
    .refine((v) => Number(v) > 0, "Amount must be greater than zero"),
  method: z.string().min(1, "Choose a method"),
  transactionReference: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
});
type Values = z.infer<typeof schema>;

type LookupResult = {
  id: string;
  reservationNumber: string;
  guestName: string;
  roomNumber: string;
  status: string;
  balance: string;
};

export function RecordPaymentDialog({
  trigger,
  reservation,
  currency,
  methods,
}: {
  trigger: ReactNode;
  /** Omit to show a reservation lookup first. */
  reservation?: { id: string; reservationNumber: string; balance: string; guestName?: string };
  currency: string;
  methods: string[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(reservation ?? null);
  // A fresh idempotency key per dialog opening: double-clicks and retries reuse it.
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const { run, pending } = useApiAction();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { amount: "", method: methods[0] ?? "cash", transactionReference: "", notes: "" },
  });

  function handleOpenChange(next: boolean) {
    if (next) {
      setIdempotencyKey(crypto.randomUUID());
      setSelected(reservation ?? null);
      const due = reservation ? toCents(reservation.balance) : 0;
      form.reset({
        amount: due > 0 ? (due / 100).toFixed(2) : "",
        method: methods[0] ?? "cash",
        transactionReference: "",
        notes: "",
      });
    }
    setOpen(next);
  }

  const onSubmit = form.handleSubmit(async (values) => {
    if (!selected) return;
    const result = await run<{ duplicate: boolean }>(
      "/api/payments",
      { reservationId: selected.id, ...values, idempotencyKey },
      {
        successMessage: (r) => (r.duplicate ? "This payment was already recorded." : "Payment recorded."),
        onError: (err) => {
          for (const [k, msg] of Object.entries(err.fieldErrors)) {
            if (k in values) form.setError(k as keyof Values, { message: msg });
          }
          if (!Object.keys(err.fieldErrors).length) form.setError("root", { message: err.message });
        },
      },
    );
    if (result) setOpen(false);
  });

  const balanceCents = selected ? toCents(selected.balance) : 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            Record money received at the desk. Card numbers and other payment credentials must never be entered.
          </DialogDescription>
        </DialogHeader>
        {!selected ? (
          <ReservationLookup onSelect={(r) => {
            setSelected(r);
            const due = toCents(r.balance);
            form.setValue("amount", due > 0 ? (due / 100).toFixed(2) : "");
          }} currency={currency} />
        ) : (
          <form onSubmit={onSubmit} className="grid gap-4" noValidate>
            <div className="bg-muted/50 flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{selected.reservationNumber}</p>
                {selected.guestName ? <p className="text-muted-foreground text-xs">{selected.guestName}</p> : null}
              </div>
              <div className="text-right">
                <p className="text-muted-foreground text-xs">Outstanding</p>
                <p className={cn("font-semibold tabular-nums", balanceCents > 0 ? "text-rose-700" : "text-emerald-700")}>
                  {formatMoney(selected.balance, currency)}
                </p>
              </div>
            </div>
            {balanceCents <= 0 ? (
              <p className="text-sm text-emerald-700">Nothing is owed on this reservation.</p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={`Amount (${currency})`} htmlFor="pay-amount" error={form.formState.errors.amount?.message}>
                <Input id="pay-amount" inputMode="decimal" autoComplete="off" {...form.register("amount")} />
              </Field>
              <Field label="Method" htmlFor="pay-method" error={form.formState.errors.method?.message}>
                <NativeSelect id="pay-method" {...form.register("method")}>
                  {methods.map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m] ?? m}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <Field
              label="Reference (optional)"
              htmlFor="pay-ref"
              hint="Terminal slip, UPI transaction ID or receipt number — never a card number."
              error={form.formState.errors.transactionReference?.message}
            >
              <Input id="pay-ref" autoComplete="off" {...form.register("transactionReference")} />
            </Field>
            <Field label="Notes (optional)" htmlFor="pay-notes">
              <Input id="pay-notes" {...form.register("notes")} />
            </Field>
            {form.formState.errors.root ? (
              <p role="alert" className="text-destructive text-sm">
                {form.formState.errors.root.message}
              </p>
            ) : null}
            <DialogFooter>
              {!reservation ? (
                <Button type="button" variant="ghost" onClick={() => setSelected(null)}>
                  Change reservation
                </Button>
              ) : null}
              <Button type="submit" disabled={pending || balanceCents <= 0}>
                {pending ? <Loader2 className="animate-spin" /> : null}
                Record payment
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReservationLookup({
  onSelect,
  currency,
}: {
  onSelect: (r: { id: string; reservationNumber: string; balance: string; guestName: string }) => void;
  currency: string;
}) {
  const [q, setQ] = useState("");
  const term = q.trim();
  const lookup = useKeyedFetch(term.length >= 2 ? term : null, (signal) =>
    apiRequest<{ results: LookupResult[] }>(`/api/reservations/lookup?q=${encodeURIComponent(term)}`, { signal }).then(
      (d) => d.results,
    ),
  250);
  const results = lookup.data ?? [];
  const loading = lookup.loading;

  return (
    <div className="grid gap-3">
      <div className="relative">
        <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" aria-hidden />
        <Input
          autoFocus
          className="pl-8"
          placeholder="Reservation number, guest name or phone"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Find reservation"
        />
      </div>
      <ul className="max-h-64 divide-y overflow-y-auto rounded-md border" aria-live="polite">
        {loading ? <li className="text-muted-foreground px-3 py-2 text-sm">Searching…</li> : null}
        {!loading && q.trim().length >= 2 && results.length === 0 ? (
          <li className="text-muted-foreground px-3 py-2 text-sm">No reservations found.</li>
        ) : null}
        {results.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onSelect(r)}
              className="hover:bg-muted/60 flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm"
            >
              <span>
                <span className="font-medium">{r.reservationNumber}</span> · {r.guestName}
                <span className="text-muted-foreground block text-xs">Room {r.roomNumber}</span>
              </span>
              <span className="tabular-nums">{formatMoney(r.balance, currency)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
