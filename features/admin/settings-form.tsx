"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Field } from "@/components/app/field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useApiAction } from "@/hooks/use-api-action";
import { PAYMENT_METHOD_LABELS } from "@/lib/format";

const schema = z.object({
  name: z.string().trim().min(1, "Required").max(160),
  address: z.string().max(500),
  phone: z.string().max(40),
  email: z.string().refine((v) => v === "" || z.email().safeParse(v).success, "Enter a valid email"),
  currency: z.string().regex(/^[A-Za-z]{3}$/, "3-letter ISO code"),
  timezone: z.string().min(1, "Required"),
  checkInTime: z.string().regex(/^\d{2}:\d{2}$/, "HH:MM"),
  checkOutTime: z.string().regex(/^\d{2}:\d{2}$/, "HH:MM"),
  taxRate: z.string().regex(/^\d{1,3}(\.\d{1,2})?$/, "Percentage with up to 2 decimals"),
  enabledPaymentMethods: z.array(z.string()).min(1, "Enable at least one method"),
});
type Values = z.infer<typeof schema>;

export function SettingsForm({ initial, timezones }: { initial: Values; timezones: string[] }) {
  const { run, pending } = useApiAction();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial });
  const e = form.formState.errors;
  const methods = useWatch({ control: form.control, name: "enabledPaymentMethods" });
  const onSubmit = form.handleSubmit(async (v) => {
    await run("/api/settings", { ...v, address: v.address || null, phone: v.phone || null, email: v.email || null }, {
      method: "PATCH",
      successMessage: "Settings saved.",
      onError: (err) => {
        for (const [k, m] of Object.entries(err.fieldErrors)) if (k in v) form.setError(k as keyof Values, { message: m });
        form.setError("root", { message: err.message });
      },
    });
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6">
      <section className="grid gap-4 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Hotel information</h2>
        <Field label="Hotel name" htmlFor="h-name" error={e.name?.message} className="sm:col-span-2">
          <Input id="h-name" {...form.register("name")} />
        </Field>
        <Field label="Address" htmlFor="h-address" className="sm:col-span-2">
          <Textarea id="h-address" rows={2} {...form.register("address")} />
        </Field>
        <Field label="Phone" htmlFor="h-phone">
          <Input id="h-phone" {...form.register("phone")} />
        </Field>
        <Field label="Email" htmlFor="h-email" error={e.email?.message}>
          <Input id="h-email" type="email" {...form.register("email")} />
        </Field>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <h2 className="font-semibold sm:col-span-2 lg:col-span-4">Operations &amp; pricing</h2>
        <Field label="Currency" htmlFor="h-cur" error={e.currency?.message} hint="ISO 4217, e.g. INR, USD">
          <Input id="h-cur" maxLength={3} className="uppercase" {...form.register("currency")} />
        </Field>
        <Field label="Timezone" htmlFor="h-tz" error={e.timezone?.message} hint="Defines the hotel business date">
          <Input id="h-tz" list="tz-list" {...form.register("timezone")} />
          <datalist id="tz-list">
            {timezones.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        <Field label="Standard check-in" htmlFor="h-in" error={e.checkInTime?.message}>
          <Input id="h-in" type="time" {...form.register("checkInTime")} />
        </Field>
        <Field label="Standard check-out" htmlFor="h-out" error={e.checkOutTime?.message}>
          <Input id="h-out" type="time" {...form.register("checkOutTime")} />
        </Field>
        <Field label="Room tax rate (%)" htmlFor="h-tax" error={e.taxRate?.message} hint="Applies to new and re-priced reservations">
          <Input id="h-tax" inputMode="decimal" {...form.register("taxRate")} />
        </Field>
      </section>
      <section className="grid gap-3">
        <h2 className="font-semibold">Accepted payment methods</h2>
        <div className="flex flex-wrap gap-5">
          {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => (
            <div key={v} className="flex items-center gap-2">
              <Checkbox
                id={`pm-${v}`}
                checked={methods.includes(v)}
                onCheckedChange={(c) =>
                  form.setValue("enabledPaymentMethods", c ? [...methods, v] : methods.filter((m) => m !== v), { shouldValidate: true })
                }
              />
              <Label htmlFor={`pm-${v}`} className="font-normal">
                {l}
              </Label>
            </div>
          ))}
        </div>
        {e.enabledPaymentMethods ? <p className="text-destructive text-xs">{e.enabledPaymentMethods.message}</p> : null}
      </section>
      {e.root ? <p className="text-destructive text-sm">{e.root.message}</p> : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Save settings
        </Button>
      </div>
    </form>
  );
}
