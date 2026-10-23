"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BedDouble, Loader2, Search, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/components/app/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useKeyedFetch } from "@/hooks/use-keyed-fetch";
import { ApiError, apiRequest } from "@/lib/api-client";
import { ID_TYPE_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isISODate, nightsBetween } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";

const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
const optionalMoney = z.string().trim().refine((v) => v === "" || MONEY.test(v), "Up to 2 decimal places");

const schema = z
  .object({
    guestMode: z.enum(["existing", "new"]),
    guestId: z.string().optional(),
    firstName: z.string().trim().max(80).optional(),
    lastName: z.string().trim().max(80).optional(),
    email: z.string().trim().max(254).optional(),
    phone: z.string().trim().max(40).optional(),
    identificationType: z.string().optional(),
    identificationReference: z.string().trim().max(80).optional(),
    checkInDate: z.string().refine(isISODate, "Choose a check-in date"),
    checkOutDate: z.string().refine(isISODate, "Choose a check-out date"),
    adults: z.number({ message: "Required" }).int().min(1, "At least 1 adult").max(20),
    children: z.number({ message: "Required" }).int().min(0).max(20),
    roomTypeId: z.string().optional(),
    roomId: z.string().min(1, "Select an available room"),
    nightlyRate: optionalMoney,
    discountAmount: optionalMoney,
    status: z.enum(["pending", "confirmed"]),
    specialRequests: z.string().max(2000).optional(),
    takePayment: z.boolean(),
    paymentAmount: optionalMoney,
    paymentMethod: z.string().optional(),
    paymentReference: z.string().trim().max(120).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.checkInDate && v.checkOutDate && v.checkOutDate <= v.checkInDate) {
      ctx.addIssue({ code: "custom", path: ["checkOutDate"], message: "Check-out must be after check-in" });
    }
    if (v.guestMode === "existing" && !v.guestId) {
      ctx.addIssue({ code: "custom", path: ["guestId"], message: "Search for and select a guest" });
    }
    if (v.guestMode === "new") {
      if (!v.firstName) ctx.addIssue({ code: "custom", path: ["firstName"], message: "First name is required" });
      if (!v.lastName) ctx.addIssue({ code: "custom", path: ["lastName"], message: "Last name is required" });
      if (v.email && !z.email().safeParse(v.email).success) {
        ctx.addIssue({ code: "custom", path: ["email"], message: "Enter a valid email" });
      }
    }
    if (v.takePayment && (!v.paymentAmount || Number(v.paymentAmount) <= 0)) {
      ctx.addIssue({ code: "custom", path: ["paymentAmount"], message: "Enter the amount received" });
    }
  });

type Values = z.infer<typeof schema>;

type AvailableRoom = {
  id: string;
  roomNumber: string;
  floor: number;
  roomTypeId: string;
  roomTypeName: string;
  capacity: number;
  basePrice: string;
  housekeepingStatus: string;
};

type Quote = {
  nights: number;
  nightlyRate: string;
  subtotal: string;
  discountAmount: string;
  taxRate: string;
  taxAmount: string;
  totalAmount: string;
};

type GuestHit = { id: string; firstName: string; lastName: string; email: string | null; phone: string | null };

export type ReservationFormProps = {
  mode: "create" | "edit";
  currency: string;
  today: string;
  roomTypes: { id: string; name: string; capacity: number; basePrice: string }[];
  methods: string[];
  canTakePayment: boolean;
  /** Edit mode: the reservation being changed. */
  reservation?: {
    id: string;
    reservationNumber: string;
    status: string;
    guestName: string;
    roomId: string;
    roomNumber: string;
    roomTypeName: string;
    checkInDate: string;
    checkOutDate: string;
    adults: number;
    children: number;
    nightlyRate: string;
    discountAmount: string;
    specialRequests: string | null;
  };
  /** Create mode prefill (e.g. from the calendar). */
  prefill?: { roomId?: string; checkInDate?: string; checkOutDate?: string; guestId?: string; guestName?: string };
};

export function ReservationForm(props: ReservationFormProps) {
  const { mode, currency, today, roomTypes, methods, reservation, prefill } = props;
  const router = useRouter();
  const inHouse = reservation?.status === "checked_in";
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [selectedGuest, setSelectedGuest] = useState<GuestHit | null>(
    prefill?.guestId ? { id: prefill.guestId, firstName: prefill.guestName ?? "Selected guest", lastName: "", email: null, phone: null } : null,
  );

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      guestMode: mode === "edit" || prefill?.guestId ? "existing" : "new",
      guestId: mode === "edit" ? "existing" : (prefill?.guestId ?? ""),
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      identificationType: "",
      identificationReference: "",
      checkInDate: reservation?.checkInDate ?? prefill?.checkInDate ?? today,
      checkOutDate: reservation?.checkOutDate ?? prefill?.checkOutDate ?? "",
      adults: reservation?.adults ?? 1,
      children: reservation?.children ?? 0,
      roomTypeId: "",
      roomId: reservation?.roomId ?? prefill?.roomId ?? "",
      nightlyRate: reservation?.nightlyRate ?? "",
      discountAmount: reservation?.discountAmount ?? "0",
      status: "confirmed",
      specialRequests: reservation?.specialRequests ?? "",
      takePayment: false,
      paymentAmount: "",
      paymentMethod: methods[0] ?? "cash",
      paymentReference: "",
    },
  });
  const { register, setValue, formState } = form;
  const errors = formState.errors;
  const w = useWatch({ control: form.control });

  // ---- Availability (server) -------------------------------------------------
  const totalGuests = (Number(w.adults) || 0) + (Number(w.children) || 0);
  const datesValid = Boolean(
    w.checkInDate && w.checkOutDate && isISODate(w.checkInDate) && isISODate(w.checkOutDate) && w.checkOutDate > w.checkInDate,
  );
  let availabilityQuery: string | null = null;
  if (datesValid && !inHouse) {
    const params = new URLSearchParams({ checkInDate: w.checkInDate!, checkOutDate: w.checkOutDate! });
    if (w.roomTypeId) params.set("roomTypeId", w.roomTypeId);
    if (totalGuests > 0) params.set("guests", String(totalGuests));
    if (reservation) params.set("excludeReservationId", reservation.id);
    availabilityQuery = params.toString();
  }
  const availability = useKeyedFetch(availabilityQuery, (signal) =>
    apiRequest<{ rooms: AvailableRoom[] }>(`/api/availability?${availabilityQuery}`, { signal }).then((d) => d.rooms),
  );
  const rooms = availability.data;
  const roomsLoading = availability.loading;
  const roomsError = availability.error;

  // Drop a selected room that is no longer available for the chosen dates/guests.
  useEffect(() => {
    if (rooms && w.roomId && !rooms.some((r) => r.id === w.roomId)) setValue("roomId", "");
  }, [rooms, w.roomId, setValue]);

  const selectedRoom = rooms?.find((r) => r.id === w.roomId);

  // ---- Server quote --------------------------------------------------------------
  const effectiveRate = w.nightlyRate || selectedRoom?.basePrice || "";
  const discountInput = w.discountAmount || "0";
  const quoteBody =
    datesValid && effectiveRate && MONEY.test(effectiveRate) && MONEY.test(discountInput)
      ? { checkInDate: w.checkInDate, checkOutDate: w.checkOutDate, nightlyRate: effectiveRate, discountAmount: discountInput }
      : null;
  const quoteFetch = useKeyedFetch(
    quoteBody ? JSON.stringify(quoteBody) : null,
    (signal) => apiRequest<{ pricing: Quote }>("/api/reservations/quote", { method: "POST", body: quoteBody, signal }).then((d) => d.pricing),
    250,
  );
  const quote = quoteFetch.data;
  const quoteError = quoteFetch.error;

  // ---- Submit ----------------------------------------------------------------------
  const onSubmit = form.handleSubmit(async (v) => {
    setSubmitting(true);
    try {
      if (mode === "create") {
        const body = {
          ...(v.guestMode === "existing"
            ? { guestId: v.guestId }
            : {
                newGuest: {
                  firstName: v.firstName,
                  lastName: v.lastName,
                  email: v.email || null,
                  phone: v.phone || null,
                  identificationType: v.identificationType || null,
                  identificationReference: v.identificationReference || null,
                },
              }),
          roomId: v.roomId,
          checkInDate: v.checkInDate,
          checkOutDate: v.checkOutDate,
          adults: v.adults,
          children: v.children,
          ...(v.nightlyRate ? { nightlyRate: v.nightlyRate } : {}),
          discountAmount: v.discountAmount || "0",
          status: v.status,
          specialRequests: v.specialRequests || null,
          ...(v.takePayment && v.paymentAmount
            ? {
                initialPayment: {
                  amount: v.paymentAmount,
                  method: v.paymentMethod,
                  transactionReference: v.paymentReference || null,
                  idempotencyKey,
                },
              }
            : {}),
        };
        const res = await apiRequest<{ reservation: { id: string; reservationNumber: string } }>("/api/reservations", {
          method: "POST",
          body,
        });
        toast.success(`Reservation ${res.reservation.reservationNumber} created.`);
        router.push(`/reservations/${res.reservation.id}`);
        router.refresh();
      } else if (reservation) {
        const body: Record<string, unknown> = {
          checkOutDate: v.checkOutDate,
          adults: v.adults,
          children: v.children,
          discountAmount: v.discountAmount || "0",
          specialRequests: v.specialRequests || null,
        };
        if (!inHouse) {
          body.checkInDate = v.checkInDate;
          body.roomId = v.roomId;
        }
        if (v.nightlyRate) body.nightlyRate = v.nightlyRate;
        await apiRequest(`/api/reservations/${reservation.id}`, { method: "PATCH", body });
        toast.success("Reservation updated. Totals were recalculated.");
        router.push(`/reservations/${reservation.id}`);
        router.refresh();
      }
    } catch (err) {
      if (err instanceof ApiError) {
        const map: Record<string, keyof Values> = {
          "newGuest.firstName": "firstName",
          "newGuest.lastName": "lastName",
          "newGuest.email": "email",
          "newGuest.phone": "phone",
          "initialPayment.amount": "paymentAmount",
        };
        for (const [k, msg] of Object.entries(err.fieldErrors)) {
          const key = (map[k] ?? k) as keyof Values;
          if (key in v) form.setError(key, { message: msg });
        }
        toast.error(err.message);
      } else {
        toast.error("Something went wrong.");
      }
    } finally {
      setSubmitting(false);
    }
  });

  const nights = datesValid ? nightsBetween(w.checkInDate!, w.checkOutDate!) : 0;
  const groupedRooms = useMemo(() => {
    const map = new Map<string, AvailableRoom[]>();
    for (const r of rooms ?? []) map.set(r.roomTypeName, [...(map.get(r.roomTypeName) ?? []), r]);
    return Array.from(map.entries());
  }, [rooms]);

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="grid min-w-0 gap-5">
        {/* Guest ------------------------------------------------------------------ */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4" /> Guest
            </CardTitle>
            {mode === "edit" ? <CardDescription>{reservation?.guestName}</CardDescription> : null}
          </CardHeader>
          {mode === "create" ? (
            <CardContent className="grid gap-4">
              <div className="bg-muted inline-flex w-fit rounded-md p-0.5" role="radiogroup" aria-label="Guest">
                {(["new", "existing"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={w.guestMode === m}
                    onClick={() => setValue("guestMode", m)}
                    className={cn(
                      "rounded px-3 py-1 text-sm",
                      w.guestMode === m ? "bg-background font-medium shadow-xs" : "text-muted-foreground",
                    )}
                  >
                    {m === "new" ? "New guest" : "Existing guest"}
                  </button>
                ))}
              </div>
              {w.guestMode === "existing" ? (
                <GuestPicker
                  selected={selectedGuest}
                  error={errors.guestId?.message}
                  onSelect={(g) => {
                    setSelectedGuest(g);
                    setValue("guestId", g?.id ?? "", { shouldValidate: Boolean(g) });
                  }}
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="First name" htmlFor="firstName" error={errors.firstName?.message}>
                    <Input id="firstName" autoComplete="off" {...register("firstName")} />
                  </Field>
                  <Field label="Last name" htmlFor="lastName" error={errors.lastName?.message}>
                    <Input id="lastName" autoComplete="off" {...register("lastName")} />
                  </Field>
                  <Field label="Phone" htmlFor="phone" error={errors.phone?.message}>
                    <Input id="phone" type="tel" autoComplete="off" {...register("phone")} />
                  </Field>
                  <Field label="Email" htmlFor="email" error={errors.email?.message}>
                    <Input id="email" type="email" autoComplete="off" {...register("email")} />
                  </Field>
                  <Field label="ID type (optional)" htmlFor="idType">
                    <NativeSelect id="idType" {...register("identificationType")}>
                      <option value="">Not recorded</option>
                      {Object.entries(ID_TYPE_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field
                    label="ID reference (optional)"
                    htmlFor="idRef"
                    hint="Record only where legally required. Do not store document images."
                  >
                    <Input id="idRef" autoComplete="off" {...register("identificationReference")} />
                  </Field>
                </div>
              )}
            </CardContent>
          ) : null}
        </Card>

        {/* Stay ------------------------------------------------------------------- */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BedDouble className="size-4" /> Stay &amp; room
            </CardTitle>
            <CardDescription>
              Check-in and check-out are hotel-local dates; the guest occupies the nights from check-in up to (not including)
              check-out.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Field label="Check-in" htmlFor="checkInDate" error={errors.checkInDate?.message}>
                <Input
                  id="checkInDate"
                  type="date"
                  min={mode === "create" ? today : undefined}
                  disabled={inHouse}
                  {...register("checkInDate")}
                />
              </Field>
              <Field label="Check-out" htmlFor="checkOutDate" error={errors.checkOutDate?.message}>
                <Input id="checkOutDate" type="date" min={w.checkInDate || today} {...register("checkOutDate")} />
              </Field>
              <Field label="Adults" htmlFor="adults" error={errors.adults?.message}>
                <Input id="adults" type="number" min={1} max={20} {...register("adults", { valueAsNumber: true })} />
              </Field>
              <Field label="Children" htmlFor="children" error={errors.children?.message}>
                <Input id="children" type="number" min={0} max={20} {...register("children", { valueAsNumber: true })} />
              </Field>
            </div>
            {nights > 0 ? (
              <p className="text-muted-foreground text-sm">
                {nights} night{nights === 1 ? "" : "s"}
              </p>
            ) : null}

            {inHouse ? (
              <p className="bg-muted/50 rounded-md border px-3 py-2 text-sm">
                Guest is in house in room <strong>{reservation?.roomNumber}</strong> ({reservation?.roomTypeName}). The room
                and arrival date cannot be changed; you can extend or shorten the stay.
              </p>
            ) : (
              <>
                <Field label="Room type" htmlFor="roomTypeId" className="max-w-xs">
                  <NativeSelect id="roomTypeId" {...register("roomTypeId")}>
                    <option value="">All room types</option>
                    {roomTypes.map((rt) => (
                      <option key={rt.id} value={rt.id}>
                        {rt.name} (up to {rt.capacity})
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <div>
                  <Label className={cn("mb-2", errors.roomId && "text-destructive")}>Available rooms</Label>
                  {!datesValid ? (
                    <p className="text-muted-foreground text-sm">Choose valid dates to see availability.</p>
                  ) : roomsLoading && !rooms ? (
                    <p className="text-muted-foreground flex items-center gap-2 text-sm">
                      <Loader2 className="size-4 animate-spin" /> Checking availability…
                    </p>
                  ) : roomsError ? (
                    <p className="text-destructive text-sm">{roomsError}</p>
                  ) : rooms && rooms.length === 0 ? (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      No rooms are available for these dates and {totalGuests} guest(s). Try other dates or room types.
                    </p>
                  ) : (
                    <div className={cn("grid gap-3", roomsLoading && "opacity-60")} role="radiogroup" aria-label="Available rooms">
                      {groupedRooms.map(([typeName, list]) => (
                        <div key={typeName}>
                          <p className="text-muted-foreground mb-1.5 text-xs font-medium">
                            {typeName} · up to {list[0].capacity} guests · {formatMoney(list[0].basePrice, currency)}/night
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {list.map((r) => {
                              const active = w.roomId === r.id;
                              return (
                                <button
                                  key={r.id}
                                  type="button"
                                  role="radio"
                                  aria-checked={active}
                                  onClick={() => {
                                    setValue("roomId", r.id, { shouldValidate: true });
                                    if (mode === "create" || r.roomTypeId !== selectedRoom?.roomTypeId) setValue("nightlyRate", "");
                                  }}
                                  className={cn(
                                    "focus-visible:ring-ring/50 min-w-16 rounded-md border bg-card px-3 py-1.5 text-sm tabular-nums outline-none focus-visible:ring-[3px]",
                                    active ? "border-primary bg-primary/5 text-primary font-semibold" : "hover:bg-muted/60",
                                  )}
                                  title={`Floor ${r.floor} · ${r.housekeepingStatus}`}
                                >
                                  {r.roomNumber}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {errors.roomId ? <p className="text-destructive mt-1.5 text-xs">{errors.roomId.message}</p> : null}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Rate & extras -------------------------------------------------------------- */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rate &amp; requests</CardTitle>
            <CardDescription>
              Leave the nightly rate empty to use the room type&apos;s base rate. Totals and tax are always calculated by the
              server.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={`Nightly rate (${currency})`} htmlFor="nightlyRate" error={errors.nightlyRate?.message}>
                <Input
                  id="nightlyRate"
                  inputMode="decimal"
                  placeholder={selectedRoom ? selectedRoom.basePrice : reservation?.nightlyRate ?? "Base rate"}
                  {...register("nightlyRate")}
                />
              </Field>
              <Field label={`Discount (${currency})`} htmlFor="discountAmount" error={errors.discountAmount?.message}>
                <Input id="discountAmount" inputMode="decimal" {...register("discountAmount")} />
              </Field>
              {mode === "create" ? (
                <Field label="Status" htmlFor="status">
                  <NativeSelect id="status" {...register("status")}>
                    <option value="confirmed">Confirmed</option>
                    <option value="pending">Pending (tentative hold)</option>
                  </NativeSelect>
                </Field>
              ) : null}
            </div>
            <Field label="Special requests" htmlFor="specialRequests">
              <Textarea id="specialRequests" rows={3} {...register("specialRequests")} />
            </Field>
          </CardContent>
        </Card>

        {mode === "create" && props.canTakePayment ? (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="takePayment"
                  checked={w.takePayment}
                  onCheckedChange={(c) => setValue("takePayment", c === true)}
                />
                <Label htmlFor="takePayment" className="text-base font-semibold">
                  Record an initial payment / deposit
                </Label>
              </div>
            </CardHeader>
            {w.takePayment ? (
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <Field label={`Amount (${currency})`} htmlFor="paymentAmount" error={errors.paymentAmount?.message}>
                  <Input id="paymentAmount" inputMode="decimal" {...register("paymentAmount")} />
                </Field>
                <Field label="Method" htmlFor="paymentMethod">
                  <NativeSelect id="paymentMethod" {...register("paymentMethod")}>
                    {methods.map((m) => (
                      <option key={m} value={m}>
                        {PAYMENT_METHOD_LABELS[m]}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Reference" htmlFor="paymentReference" hint="Never enter card numbers.">
                  <Input id="paymentReference" autoComplete="off" {...register("paymentReference")} />
                </Field>
              </CardContent>
            ) : null}
          </Card>
        ) : null}
      </div>

      {/* Summary ------------------------------------------------------------------------ */}
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Summary</CardTitle>
            <CardDescription>Calculated by the server from current rates and the hotel tax rate.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <SummaryRow label="Room" value={selectedRoom ? `${selectedRoom.roomNumber} · ${selectedRoom.roomTypeName}` : inHouse ? reservation?.roomNumber : "—"} />
            {quote ? (
              <>
                <SummaryRow label={`${quote.nights} × ${formatMoney(quote.nightlyRate, currency)}`} value={formatMoney(quote.subtotal, currency)} />
                <SummaryRow label="Discount" value={`− ${formatMoney(quote.discountAmount, currency)}`} />
                <SummaryRow label={`Tax (${Number(quote.taxRate)}%)`} value={formatMoney(quote.taxAmount, currency)} />
                <div className="flex items-center justify-between border-t pt-3 text-base font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{formatMoney(quote.totalAmount, currency)}</span>
                </div>
              </>
            ) : quoteError ? (
              <p className="text-destructive">{quoteError}</p>
            ) : quoteFetch.loading ? (
              <p className="text-muted-foreground flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" /> Calculating…
              </p>
            ) : (
              <p className="text-muted-foreground">Select dates and a room to see the price.</p>
            )}
            <Button type="submit" className="mt-2 w-full" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : null}
              {mode === "create" ? "Create reservation" : "Save changes"}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => router.back()}>
              Cancel
            </Button>
          </CardContent>
        </Card>
      </aside>
    </form>
  );
}

function SummaryRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right tabular-nums">{value ?? "—"}</span>
    </div>
  );
}

function GuestPicker({
  selected,
  onSelect,
  error,
}: {
  selected: GuestHit | null;
  onSelect: (g: GuestHit | null) => void;
  error?: string;
}) {
  const [q, setQ] = useState("");
  const term = q.trim();
  const search = useKeyedFetch(term.length >= 2 ? term : null, (signal) =>
    apiRequest<{ guests: GuestHit[] }>(`/api/guests?q=${encodeURIComponent(term)}`, { signal }).then((d) => d.guests),
  250);
  const hits = search.data ?? [];
  const loading = search.loading;

  if (selected) {
    return (
      <div className="bg-muted/40 flex items-center justify-between rounded-md border px-3 py-2">
        <div className="text-sm">
          <p className="font-medium">
            {selected.firstName} {selected.lastName}
          </p>
          <p className="text-muted-foreground text-xs">{[selected.phone, selected.email].filter(Boolean).join(" · ")}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => onSelect(null)}>
          Change
        </Button>
      </div>
    );
  }
  return (
    <div className="grid gap-2">
      <div className="relative">
        <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" aria-hidden />
        <Input
          className="pl-8"
          placeholder="Search by name, phone or email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search guests"
          aria-invalid={Boolean(error)}
        />
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
      {q.trim().length >= 2 ? (
        <ul className="max-h-56 divide-y overflow-y-auto rounded-md border" aria-live="polite">
          {loading ? <li className="text-muted-foreground px-3 py-2 text-sm">Searching…</li> : null}
          {!loading && hits.length === 0 ? (
            <li className="text-muted-foreground flex items-center gap-2 px-3 py-2 text-sm">
              <UserPlus className="size-4" /> No match — switch to “New guest” to register them.
            </li>
          ) : null}
          {hits.map((g) => (
            <li key={g.id}>
              <button type="button" className="hover:bg-muted/60 w-full px-3 py-2 text-left text-sm" onClick={() => onSelect(g)}>
                <span className="font-medium">
                  {g.firstName} {g.lastName}
                </span>
                <span className="text-muted-foreground block text-xs">{[g.phone, g.email].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
