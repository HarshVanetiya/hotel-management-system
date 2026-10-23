"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Field } from "@/components/app/field";
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
import { Textarea } from "@/components/ui/textarea";
import { useApiAction } from "@/hooks/use-api-action";
import type { ApiError } from "@/lib/api-client";
import { PAYMENT_METHOD_LABELS } from "@/lib/format";
import { formatMoney } from "@/lib/utils/money";

const money = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, "Enter an amount with up to 2 decimals")
  .refine((v) => Number(v) > 0, "Must be greater than zero");

function applyFieldErrors<T extends Record<string, unknown>>(
  err: ApiError,
  setError: (k: keyof T & string, e: { message: string }) => void,
  keys: string[],
) {
  let applied = false;
  for (const [k, msg] of Object.entries(err.fieldErrors)) {
    if (keys.includes(k)) {
      setError(k as keyof T & string, { message: msg });
      applied = true;
    }
  }
  return applied;
}

// ---------------------------------------------------------------------------
const chargeSchema = z.object({
  description: z.string().trim().min(1, "Describe the charge").max(200),
  quantity: z.number({ message: "Required" }).int().min(1).max(1000),
  unitPrice: money,
});
type ChargeValues = z.infer<typeof chargeSchema>;

export function AddChargeDialog({ reservationId, currency, trigger }: { reservationId: string; currency: string; trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { run, pending } = useApiAction();
  const form = useForm<ChargeValues>({
    resolver: zodResolver(chargeSchema),
    defaultValues: { description: "", quantity: 1, unitPrice: "" },
  });
  useEffect(() => {
    if (open) form.reset({ description: "", quantity: 1, unitPrice: "" });
  }, [open, form]);
  const presets = ["Restaurant", "Room service", "Laundry", "Minibar", "Airport transfer", "Late check-out"];
  const onSubmit = form.handleSubmit(async (values) => {
    const res = await run(`/api/reservations/${reservationId}/charges`, values, {
      successMessage: "Charge posted.",
      onError: (err) => {
        if (!applyFieldErrors<ChargeValues>(err, form.setError, Object.keys(values))) form.setError("root", { message: err.message });
      },
    });
    if (res) setOpen(false);
  });
  const q = form.watch("quantity");
  const p = form.watch("unitPrice");
  const preview = Number.isInteger(q) && /^\d+(\.\d{1,2})?$/.test(p ?? "") ? formatMoney((Number(p) * q).toFixed(2), currency) : null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Post additional charge</DialogTitle>
          <DialogDescription>Charges are added to the guest folio. The total is calculated on the server.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((pr) => (
              <Button key={pr} type="button" size="sm" variant="outline" onClick={() => form.setValue("description", pr)}>
                {pr}
              </Button>
            ))}
          </div>
          <Field label="Description" htmlFor="ch-desc" error={form.formState.errors.description?.message}>
            <Input id="ch-desc" {...form.register("description")} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Quantity" htmlFor="ch-qty" error={form.formState.errors.quantity?.message}>
              <Input id="ch-qty" type="number" min={1} {...form.register("quantity", { valueAsNumber: true })} />
            </Field>
            <Field label={`Unit price (${currency})`} htmlFor="ch-price" error={form.formState.errors.unitPrice?.message}>
              <Input id="ch-price" inputMode="decimal" {...form.register("unitPrice")} />
            </Field>
          </div>
          {preview ? <p className="text-muted-foreground text-sm">Total: {preview}</p> : null}
          {form.formState.errors.root ? <p className="text-destructive text-sm">{form.formState.errors.root.message}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Post charge
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
const refundSchema = z.object({
  amount: money,
  method: z.string().min(1),
  reason: z.string().trim().min(1, "A reason is required").max(500),
  transactionReference: z.string().trim().max(120).optional(),
});
type RefundValues = z.infer<typeof refundSchema>;

export function RefundDialog({
  paymentId,
  maxAmount,
  defaultMethod,
  methods,
  currency,
  trigger,
}: {
  paymentId: string;
  maxAmount: string;
  defaultMethod: string;
  methods: string[];
  currency: string;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const { run, pending } = useApiAction();
  const form = useForm<RefundValues>({
    resolver: zodResolver(refundSchema),
    defaultValues: { amount: maxAmount, method: defaultMethod, reason: "", transactionReference: "" },
  });
  useEffect(() => {
    if (open) {
      setKey(crypto.randomUUID());
      form.reset({ amount: maxAmount, method: defaultMethod, reason: "", transactionReference: "" });
    }
  }, [open, form, maxAmount, defaultMethod]);
  const allMethods = Array.from(new Set([defaultMethod, ...methods]));
  const onSubmit = form.handleSubmit(async (values) => {
    const res = await run(
      `/api/payments/${paymentId}/refund`,
      { ...values, idempotencyKey: key },
      {
        successMessage: "Refund recorded.",
        onError: (err) => {
          if (!applyFieldErrors<RefundValues>(err, form.setError, Object.keys(values))) form.setError("root", { message: err.message });
        },
      },
    );
    if (res) setOpen(false);
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Refund payment</DialogTitle>
          <DialogDescription>
            Up to {formatMoney(maxAmount, currency)} can be refunded. The refund is recorded as a separate ledger entry; the
            original payment is never changed.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <div className="grid grid-cols-2 gap-4">
            <Field label={`Amount (${currency})`} htmlFor="rf-amount" error={form.formState.errors.amount?.message}>
              <Input id="rf-amount" inputMode="decimal" {...form.register("amount")} />
            </Field>
            <Field label="Refund method" htmlFor="rf-method">
              <NativeSelect id="rf-method" {...form.register("method")}>
                {allMethods.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Reason" htmlFor="rf-reason" error={form.formState.errors.reason?.message}>
            <Textarea id="rf-reason" rows={2} {...form.register("reason")} />
          </Field>
          <Field label="Reference (optional)" htmlFor="rf-ref">
            <Input id="rf-ref" autoComplete="off" {...form.register("transactionReference")} />
          </Field>
          {form.formState.errors.root ? <p className="text-destructive text-sm">{form.formState.errors.root.message}</p> : null}
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Record refund
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
const reasonSchema = z.object({ reason: z.string().trim().min(1, "A reason is required").max(500) });
type ReasonValues = z.infer<typeof reasonSchema>;

/** Generic "requires a reason" destructive action (void payment/charge, cancel reservation). */
export function ReasonDialog({
  trigger,
  title,
  description,
  url,
  confirmLabel,
  successMessage,
  reasonLabel = "Reason",
}: {
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  url: string;
  confirmLabel: string;
  successMessage: string;
  reasonLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const { run, pending } = useApiAction();
  const form = useForm<ReasonValues>({ resolver: zodResolver(reasonSchema), defaultValues: { reason: "" } });
  useEffect(() => {
    if (open) form.reset({ reason: "" });
  }, [open, form]);
  const onSubmit = form.handleSubmit(async (values) => {
    const res = await run(url, values, {
      successMessage,
      onError: (err) => form.setError("root", { message: err.message }),
    });
    if (res) setOpen(false);
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div>{description}</div>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <Field label={reasonLabel} htmlFor="reason" error={form.formState.errors.reason?.message}>
            <Textarea id="reason" rows={3} {...form.register("reason")} />
          </Field>
          {form.formState.errors.root ? <p className="text-destructive text-sm">{form.formState.errors.root.message}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Back
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
