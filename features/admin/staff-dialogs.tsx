"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
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
import { Switch } from "@/components/ui/switch";
import { useApiAction } from "@/hooks/use-api-action";
import { ROLE_LABELS } from "@/lib/permissions";

const password = z
  .string()
  .min(12, "At least 12 characters")
  .refine((v) => new TextEncoder().encode(v).length <= 72, "At most 72 bytes")
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Include a letter and a number");

const ROLE_HELP: Record<string, string> = {
  admin: "Full access including staff, settings, reports and audit log.",
  receptionist: "Reservations, guests, front desk, payments and charges.",
  housekeeping: "Housekeeping tasks and room cleaning status only.",
};

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.email("Enter a valid email"),
  role: z.enum(["admin", "receptionist", "housekeeping"]),
  password,
});
type CreateValues = z.infer<typeof createSchema>;

export function CreateStaffDialog({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { run, pending } = useApiAction();
  const form = useForm<CreateValues>({ resolver: zodResolver(createSchema) });
  useEffect(() => {
    if (open) form.reset({ name: "", email: "", role: "receptionist", password: "" });
  }, [open, form]);
  const role = useWatch({ control: form.control, name: "role" });
  const onSubmit = form.handleSubmit(async (v) => {
    const res = await run("/api/staff", v, {
      successMessage: `Account created for ${v.name}. Share the temporary password securely.`,
      onError: (err) => {
        for (const [k, m] of Object.entries(err.fieldErrors)) if (k in v) form.setError(k as keyof CreateValues, { message: m });
        form.setError("root", { message: err.message });
      },
    });
    if (res) setOpen(false);
  });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add staff account</DialogTitle>
          <DialogDescription>Set a temporary password and share it with the staff member in person.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <Field label="Full name" htmlFor="s-name" error={e.name?.message}>
            <Input id="s-name" {...form.register("name")} />
          </Field>
          <Field label="Email" htmlFor="s-email" error={e.email?.message}>
            <Input id="s-email" type="email" autoComplete="off" {...form.register("email")} />
          </Field>
          <Field label="Role" htmlFor="s-role" hint={ROLE_HELP[role]}>
            <NativeSelect id="s-role" {...form.register("role")}>
              {Object.entries(ROLE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Temporary password" htmlFor="s-pass" error={e.password?.message} hint="12+ characters with letters and numbers.">
            <Input id="s-pass" type="password" autoComplete="new-password" {...form.register("password")} />
          </Field>
          {e.root ? <p className="text-destructive text-sm">{e.root.message}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Create account
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function StaffRoleControl({ user, isSelf }: { user: { id: string; role: string; active: boolean }; isSelf: boolean }) {
  const { run, pending } = useApiAction();
  return (
    <div className="flex items-center justify-end gap-3">
      <NativeSelect
        aria-label="Role"
        className="h-8 w-36 text-xs"
        value={user.role}
        disabled={pending || isSelf}
        onChange={(e) => void run(`/api/staff/${user.id}`, { role: e.target.value }, { method: "PATCH", successMessage: "Role updated. Their sessions were signed out." })}
      >
        {Object.entries(ROLE_LABELS).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </NativeSelect>
      <label className="flex items-center gap-2 text-xs">
        <Switch
          checked={user.active}
          disabled={pending || isSelf}
          onCheckedChange={(active) =>
            void run(`/api/staff/${user.id}`, { active }, { method: "PATCH", successMessage: active ? "Account activated." : "Account deactivated and signed out." })
          }
          aria-label="Active"
        />
        Active
      </label>
    </div>
  );
}

const resetSchema = z.object({ password });
export function ResetPasswordDialog({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const { run, pending } = useApiAction();
  const form = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema), defaultValues: { password: "" } });
  useEffect(() => {
    if (open) form.reset({ password: "" });
  }, [open, form]);
  const onSubmit = form.handleSubmit(async (v) => {
    const res = await run(`/api/staff/${userId}/password`, v, {
      successMessage: `Password reset for ${name}. Existing sessions were signed out.`,
      onError: (err) => form.setError("password", { message: err.fieldErrors.password ?? err.message }),
    });
    if (res) setOpen(false);
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          Reset password
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password for {name}</DialogTitle>
          <DialogDescription>All of their active sessions will be signed out.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <Field label="New temporary password" htmlFor="rp-pass" error={form.formState.errors.password?.message}>
            <Input id="rp-pass" type="password" autoComplete="new-password" {...form.register("password")} />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Reset password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
