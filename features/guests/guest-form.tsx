"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/components/app/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest } from "@/lib/api-client";
import { ID_TYPE_LABELS } from "@/lib/format";

const schema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  email: z
    .string()
    .trim()
    .max(254)
    .refine((v) => v === "" || z.email().safeParse(v).success, "Enter a valid email"),
  phone: z
    .string()
    .trim()
    .max(40)
    .refine((v) => v === "" || /^[+()\-\s\d]{6,40}$/.test(v), "Enter a valid phone number"),
  address: z.string().max(500),
  identificationType: z.string(),
  identificationReference: z.string().trim().max(80),
  notes: z.string().max(2000),
});
type Values = z.infer<typeof schema>;

export type GuestFormInitial = Partial<Record<keyof Values, string | null>> & { id?: string };

export function GuestForm({ initial, onDone }: { initial?: GuestFormInitial; onDone?: () => void }) {
  const router = useRouter();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: initial?.firstName ?? "",
      lastName: initial?.lastName ?? "",
      email: initial?.email ?? "",
      phone: initial?.phone ?? "",
      address: initial?.address ?? "",
      identificationType: initial?.identificationType ?? "",
      identificationReference: initial?.identificationReference ?? "",
      notes: initial?.notes ?? "",
    },
  });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit(async (v) => {
    const body = {
      ...v,
      email: v.email || null,
      phone: v.phone || null,
      address: v.address || null,
      identificationType: v.identificationType || null,
      identificationReference: v.identificationReference || null,
      notes: v.notes || null,
    };
    try {
      if (initial?.id) {
        await apiRequest(`/api/guests/${initial.id}`, { method: "PATCH", body });
        toast.success("Guest updated.");
        onDone?.();
        router.refresh();
      } else {
        const res = await apiRequest<{ guest: { id: string } }>("/api/guests", { method: "POST", body });
        toast.success("Guest registered.");
        router.push(`/guests/${res.guest.id}`);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        for (const [k, msg] of Object.entries(err.fieldErrors)) if (k in v) form.setError(k as keyof Values, { message: msg });
        toast.error(err.message);
      }
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
      <Field label="First name" htmlFor="g-first" error={e.firstName?.message}>
        <Input id="g-first" {...form.register("firstName")} />
      </Field>
      <Field label="Last name" htmlFor="g-last" error={e.lastName?.message}>
        <Input id="g-last" {...form.register("lastName")} />
      </Field>
      <Field label="Phone" htmlFor="g-phone" error={e.phone?.message}>
        <Input id="g-phone" type="tel" {...form.register("phone")} />
      </Field>
      <Field label="Email" htmlFor="g-email" error={e.email?.message}>
        <Input id="g-email" type="email" {...form.register("email")} />
      </Field>
      <Field label="Address" htmlFor="g-address" className="sm:col-span-2">
        <Textarea id="g-address" rows={2} {...form.register("address")} />
      </Field>
      <Field label="ID type" htmlFor="g-idtype">
        <NativeSelect id="g-idtype" {...form.register("identificationType")}>
          <option value="">Not recorded</option>
          {Object.entries(ID_TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field
        label="ID reference"
        htmlFor="g-idref"
        hint="Only where legally required. Document images are never stored."
        error={e.identificationReference?.message}
      >
        <Input id="g-idref" autoComplete="off" {...form.register("identificationReference")} />
      </Field>
      <Field label="Notes & preferences" htmlFor="g-notes" className="sm:col-span-2">
        <Textarea id="g-notes" rows={3} placeholder="e.g. prefers high floor, allergic to feathers" {...form.register("notes")} />
      </Field>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : null}
          {initial?.id ? "Save guest" : "Register guest"}
        </Button>
      </div>
    </form>
  );
}
