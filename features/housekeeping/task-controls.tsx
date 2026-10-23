"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, Loader2, Play, X } from "lucide-react";
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
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useApiAction } from "@/hooks/use-api-action";
import { PRIORITY_LABELS, TASK_TYPE_LABELS } from "@/lib/format";

type Staff = { id: string; name: string };

export function TaskActions({
  task,
  canManage,
  staff,
}: {
  task: { id: string; status: string; assignedTo: string | null; priority: string; roomNumber: string };
  canManage: boolean;
  staff: Staff[];
}) {
  const { run, pending } = useApiAction();
  const patch = (body: Record<string, unknown>, msg: string) =>
    run(`/api/housekeeping/tasks/${task.id}`, body, { method: "PATCH", successMessage: msg });
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {canManage ? (
        <>
          <NativeSelect
            aria-label="Assign to"
            className="h-8 w-36 text-xs"
            value={task.assignedTo ?? ""}
            disabled={pending}
            onChange={(e) => void patch({ assignedTo: e.target.value || null }, "Assignment updated.")}
          >
            <option value="">Unassigned</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="Priority"
            className="h-8 w-24 text-xs"
            value={task.priority}
            disabled={pending}
            onChange={(e) => void patch({ priority: e.target.value }, "Priority updated.")}
          >
            {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </>
      ) : null}
      {task.status === "pending" ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => void patch({ status: "in_progress" }, `Started room ${task.roomNumber}.`)}>
          <Play /> Start
        </Button>
      ) : null}
      <Button size="sm" disabled={pending} onClick={() => void patch({ status: "completed" }, `Room ${task.roomNumber} task completed.`)}>
        {pending ? <Loader2 className="animate-spin" /> : <Check />} Done
      </Button>
      {canManage ? (
        <Button
          size="sm"
          variant="ghost"
          aria-label="Cancel task"
          disabled={pending}
          onClick={() => void patch({ status: "cancelled" }, "Task cancelled.")}
        >
          <X />
        </Button>
      ) : null}
    </div>
  );
}

const schema = z.object({
  roomId: z.string().min(1, "Choose a room"),
  type: z.enum(["checkout_clean", "stayover_clean", "deep_clean", "inspection", "other"]),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  assignedTo: z.string(),
  notes: z.string().max(1000),
});
type Values = z.infer<typeof schema>;

export function CreateTaskDialog({
  trigger,
  rooms,
  staff,
}: {
  trigger: ReactNode;
  rooms: { id: string; roomNumber: string }[];
  staff: Staff[];
}) {
  const [open, setOpen] = useState(false);
  const { run, pending } = useApiAction();
  const form = useForm<Values>({ resolver: zodResolver(schema) });
  useEffect(() => {
    if (open) form.reset({ roomId: rooms[0]?.id ?? "", type: "stayover_clean", priority: "normal", assignedTo: "", notes: "" });
  }, [open, rooms, form]);
  const onSubmit = form.handleSubmit(async (v) => {
    const res = await run(
      "/api/housekeeping/tasks",
      { ...v, assignedTo: v.assignedTo || null, notes: v.notes || null },
      { successMessage: "Task created.", onError: (err) => form.setError("root", { message: err.message }) },
    );
    if (res) setOpen(false);
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New housekeeping task</DialogTitle>
          <DialogDescription>Check-out cleaning tasks are created automatically at check-out.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Room" htmlFor="t-room" error={form.formState.errors.roomId?.message}>
              <NativeSelect id="t-room" {...form.register("roomId")}>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.roomNumber}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Type" htmlFor="t-type">
              <NativeSelect id="t-type" {...form.register("type")}>
                {Object.entries(TASK_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Priority" htmlFor="t-priority">
              <NativeSelect id="t-priority" {...form.register("priority")}>
                {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Assign to" htmlFor="t-assign">
              <NativeSelect id="t-assign" {...form.register("assignedTo")}>
                <option value="">Unassigned</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Notes" htmlFor="t-notes">
            <Textarea id="t-notes" rows={2} {...form.register("notes")} />
          </Field>
          {form.formState.errors.root ? <p className="text-destructive text-sm">{form.formState.errors.root.message}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Create task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
