"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/components/app/field";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useApiAction } from "@/hooks/use-api-action";
import { HOUSEKEEPING_LABELS, OPERATIONAL_LABELS } from "@/lib/format";

// ---------------------------------------------------------------------------
const roomSchema = z.object({
  roomNumber: z.string().trim().min(1, "Room number is required").max(20).regex(/^[A-Za-z0-9-]+$/, "Letters, digits or dashes"),
  roomTypeId: z.string().min(1, "Choose a room type"),
  floor: z.number({ message: "Required" }).int().min(-5).max(200),
  notes: z.string().max(1000),
});
type RoomValues = z.infer<typeof roomSchema>;

export function RoomFormDialog({
  trigger,
  roomTypes,
  room,
}: {
  trigger: ReactNode;
  roomTypes: { id: string; name: string }[];
  room?: { id: string; roomNumber: string; roomTypeId: string; floor: number; notes: string | null };
}) {
  const [open, setOpen] = useState(false);
  const { run, pending } = useApiAction();
  const form = useForm<RoomValues>({ resolver: zodResolver(roomSchema) });
  useEffect(() => {
    if (open)
      form.reset({
        roomNumber: room?.roomNumber ?? "",
        roomTypeId: room?.roomTypeId ?? roomTypes[0]?.id ?? "",
        floor: room?.floor ?? 1,
        notes: room?.notes ?? "",
      });
  }, [open, room, roomTypes, form]);
  const onSubmit = form.handleSubmit(async (v) => {
    const res = await run(room ? `/api/rooms/${room.id}` : "/api/rooms", { ...v, notes: v.notes || null }, {
      method: room ? "PATCH" : "POST",
      successMessage: room ? "Room updated." : `Room ${v.roomNumber} created.`,
      onError: (err) => {
        for (const [k, m] of Object.entries(err.fieldErrors)) if (k in v) form.setError(k as keyof RoomValues, { message: m });
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
          <DialogTitle>{room ? `Edit room ${room.roomNumber}` : "Add room"}</DialogTitle>
          <DialogDescription>Room numbers are unique within the hotel.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Room number" htmlFor="r-num" error={e.roomNumber?.message}>
              <Input id="r-num" {...form.register("roomNumber")} />
            </Field>
            <Field label="Floor" htmlFor="r-floor" error={e.floor?.message}>
              <Input id="r-floor" type="number" {...form.register("floor", { valueAsNumber: true })} />
            </Field>
          </div>
          <Field label="Room type" htmlFor="r-type" error={e.roomTypeId?.message}>
            <NativeSelect id="r-type" {...form.register("roomTypeId")}>
              {roomTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Notes" htmlFor="r-notes">
            <Textarea id="r-notes" rows={2} {...form.register("notes")} />
          </Field>
          {e.root ? <p className="text-destructive text-sm">{e.root.message}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {room ? "Save" : "Add room"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
const statusSchema = z.object({
  operationalStatus: z.enum(["in_service", "maintenance", "out_of_service"]),
  notes: z.string().max(1000),
});
type StatusValues = z.infer<typeof statusSchema>;

export function RoomStatusDialog({
  trigger,
  room,
}: {
  trigger: ReactNode;
  room: { id: string; roomNumber: string; operationalStatus: string; notes: string | null; occupied: boolean };
}) {
  const [open, setOpen] = useState(false);
  const { run, pending } = useApiAction();
  const form = useForm<StatusValues>({ resolver: zodResolver(statusSchema) });
  useEffect(() => {
    if (open) form.reset({ operationalStatus: room.operationalStatus as StatusValues["operationalStatus"], notes: room.notes ?? "" });
  }, [open, room, form]);
  const onSubmit = form.handleSubmit(async (v) => {
    const res = await run<{ affectedReservations: { reservationNumber: string; checkInDate: string }[] }>(
      `/api/rooms/${room.id}/status`,
      { operationalStatus: v.operationalStatus, notes: v.notes || null },
      {
        successMessage: `Room ${room.roomNumber} set to ${OPERATIONAL_LABELS[v.operationalStatus].toLowerCase()}.`,
        onError: (err) => form.setError("root", { message: err.message }),
      },
    );
    if (res) {
      if (res.affectedReservations.length > 0) {
        toast.warning(
          `${res.affectedReservations.length} upcoming reservation(s) are assigned to this room: ${res.affectedReservations
            .map((a) => a.reservationNumber)
            .join(", ")}. Move them to another room.`,
          { duration: 10000 },
        );
      }
      setOpen(false);
    }
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Room {room.roomNumber} status</DialogTitle>
          <DialogDescription>
            Rooms under maintenance or out of service cannot be booked or checked into. Cleaning status is managed separately
            by housekeeping.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          {room.occupied ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              A guest is checked in. The room cannot be taken out of service until they check out or move.
            </p>
          ) : null}
          <Field label="Operational status" htmlFor="op-status">
            <NativeSelect id="op-status" {...form.register("operationalStatus")}>
              {Object.entries(OPERATIONAL_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Notes (e.g. reason, expected return)" htmlFor="op-notes">
            <Textarea id="op-notes" rows={2} {...form.register("notes")} />
          </Field>
          {form.formState.errors.root ? <p className="text-destructive text-sm">{form.formState.errors.root.message}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Update status
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
const typeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  description: z.string().max(1000),
  capacity: z.number({ message: "Required" }).int().min(1).max(20),
  basePrice: z.string().trim().regex(/^\d{1,10}(\.\d{1,2})?$/, "Enter a price with up to 2 decimals"),
  amenities: z.string().max(1000),
  active: z.boolean(),
});
type TypeValues = z.infer<typeof typeSchema>;

export function RoomTypeDialog({
  trigger,
  currency,
  roomType,
}: {
  trigger: ReactNode;
  currency: string;
  roomType?: { id: string; name: string; description: string | null; capacity: number; basePrice: string; amenities: string[]; active: boolean };
}) {
  const [open, setOpen] = useState(false);
  const { run, pending } = useApiAction();
  const form = useForm<TypeValues>({ resolver: zodResolver(typeSchema) });
  useEffect(() => {
    if (open)
      form.reset({
        name: roomType?.name ?? "",
        description: roomType?.description ?? "",
        capacity: roomType?.capacity ?? 2,
        basePrice: roomType?.basePrice ?? "",
        amenities: roomType?.amenities.join(", ") ?? "",
        active: roomType?.active ?? true,
      });
  }, [open, roomType, form]);
  const activeValue = useWatch({ control: form.control, name: "active" });
  const onSubmit = form.handleSubmit(async (v) => {
    const body = {
      ...v,
      description: v.description || null,
      amenities: v.amenities
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean),
    };
    const res = await run(roomType ? `/api/room-types/${roomType.id}` : "/api/room-types", body, {
      method: roomType ? "PATCH" : "POST",
      successMessage: roomType ? "Room type updated." : "Room type created.",
      onError: (err) => form.setError("root", { message: err.message }),
    });
    if (res) setOpen(false);
  });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{roomType ? `Edit ${roomType.name}` : "Add room type"}</DialogTitle>
          <DialogDescription>
            Base rate changes apply to new reservations only; existing bookings keep their agreed rate.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <Field label="Name" htmlFor="t-name" error={e.name?.message}>
            <Input id="t-name" {...form.register("name")} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Max guests" htmlFor="t-cap" error={e.capacity?.message}>
              <Input id="t-cap" type="number" min={1} {...form.register("capacity", { valueAsNumber: true })} />
            </Field>
            <Field label={`Base rate / night (${currency})`} htmlFor="t-price" error={e.basePrice?.message}>
              <Input id="t-price" inputMode="decimal" {...form.register("basePrice")} />
            </Field>
          </div>
          <Field label="Description" htmlFor="t-desc">
            <Textarea id="t-desc" rows={2} {...form.register("description")} />
          </Field>
          <Field label="Amenities (comma separated)" htmlFor="t-amen">
            <Input id="t-amen" placeholder="Wi-Fi, Air conditioning, Balcony" {...form.register("amenities")} />
          </Field>
          <div className="flex items-center gap-2">
            <Checkbox id="t-active" checked={activeValue} onCheckedChange={(c) => form.setValue("active", c === true)} />
            <Label htmlFor="t-active" className="font-normal">
              Active (available for new rooms and bookings)
            </Label>
          </div>
          {e.root ? <p className="text-destructive text-sm">{e.root.message}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
/** Inline housekeeping status selector (used on housekeeping and room pages). */
export function HousekeepingStatusControl({
  roomId,
  roomNumber,
  value,
  allowInspect,
}: {
  roomId: string;
  roomNumber: string;
  value: string;
  allowInspect: boolean;
}) {
  const { run, pending } = useApiAction();
  const options = ["dirty", "cleaning", "clean", ...(allowInspect || value === "inspected" ? ["inspected"] : [])];
  return (
    <NativeSelect
      aria-label={`Cleaning status for room ${roomNumber}`}
      className="h-8 w-32 text-xs"
      value={value}
      disabled={pending}
      onChange={(e) =>
        void run(`/api/rooms/${roomId}/housekeeping`, { housekeepingStatus: e.target.value }, {
          successMessage: `Room ${roomNumber} marked ${HOUSEKEEPING_LABELS[e.target.value].toLowerCase()}.`,
        })
      }
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {HOUSEKEEPING_LABELS[o]}
        </option>
      ))}
    </NativeSelect>
  );
}
