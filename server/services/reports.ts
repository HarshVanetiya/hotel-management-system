import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { ValidationError } from "@/lib/errors";
import { addDaysISO, isISODate, nightsBetween } from "@/lib/utils/dates";
import { assertCan, type Actor } from "../actor";
import { writeAudit } from "../audit";
import { getHotelOrThrow, hotelToday, parseInput } from "./common";

export const REPORT_TYPES = [
  "occupancy",
  "revenue",
  "reservations",
  "cancellations",
  "outstanding",
  "utilization",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const reportQuerySchema = z.object({
  from: z.string().refine(isISODate, "Invalid start date").optional(),
  to: z.string().refine(isISODate, "Invalid end date").optional(),
});

const MAX_RANGE_DAYS = 366;

async function resolveRange(actor: Actor, input: unknown) {
  const q = parseInput(reportQuerySchema, input);
  const hotel = await getHotelOrThrow(db, actor.hotelId);
  const today = hotelToday(hotel);
  const from = q.from ?? addDaysISO(today, -29);
  const to = q.to ?? today;
  if (to < from) throw new ValidationError("The end date must be on or after the start date.");
  if (nightsBetween(from, to) > MAX_RANGE_DAYS) throw new ValidationError("Reports are limited to one year.");
  return { hotel, from, to, toExclusive: addDaysISO(to, 1), tz: hotel.timezone };
}

type Column = { key: string; label: string; kind?: "money" | "percent" | "number" | "date" | "text" };
export type ReportResult = {
  type: ReportType;
  title: string;
  description: string;
  from: string;
  to: string;
  currency: string;
  columns: Column[];
  rows: Record<string, string | number | null>[];
  summary: { label: string; value: string | number; kind?: Column["kind"] }[];
};

/** Occupancy per night: sold room-nights ÷ rooms in service (current inventory). */
async function occupancyReport(actor: Actor, input: unknown): Promise<ReportResult> {
  const r = await resolveRange(actor, input);
  const result = await db.execute<{ date: string; sellable: number; occupied: number; revenue: string }>(sql`
    with sellable as (
      select count(*)::int as n from rooms
      where hotel_id = ${actor.hotelId} and archived_at is null and operational_status = 'in_service'
    )
    select d::date::text as date, (select n from sellable) as sellable,
      count(res.id)::int as occupied,
      coalesce(sum((res.subtotal - res.discount_amount) / (res.check_out_date - res.check_in_date)), 0)::numeric(12,2)::text as revenue
    from generate_series(${r.from}::date, ${r.to}::date, interval '1 day') d
    left join reservations res on res.hotel_id = ${actor.hotelId}
      and res.status in ('pending', 'confirmed', 'checked_in', 'checked_out')
      and res.check_in_date <= d::date and res.check_out_date > d::date
    group by d order by d
  `);
  const rows = result.rows.map((x) => {
    const rate = x.sellable > 0 ? x.occupied / x.sellable : 0;
    return {
      date: x.date,
      sellable: x.sellable,
      occupied: x.occupied,
      occupancy: Math.round(rate * 1000) / 10,
      adr: x.occupied > 0 ? (Number(x.revenue) / x.occupied).toFixed(2) : "0.00",
      revpar: x.sellable > 0 ? (Number(x.revenue) / x.sellable).toFixed(2) : "0.00",
      revenue: x.revenue,
    };
  });
  const sold = rows.reduce((s, x) => s + x.occupied, 0);
  const available = rows.reduce((s, x) => s + x.sellable, 0);
  const revenue = rows.reduce((s, x) => s + Number(x.revenue), 0);
  return {
    type: "occupancy",
    title: "Occupancy report",
    description:
      "Room-nights sold per night (pending, confirmed, in-house and checked-out stays; cancellations and no-shows excluded) divided by rooms currently in service. Room revenue is net of discounts and before tax, spread evenly across each stay's nights.",
    from: r.from,
    to: r.to,
    currency: r.hotel.currency,
    columns: [
      { key: "date", label: "Night", kind: "date" },
      { key: "sellable", label: "Rooms in service", kind: "number" },
      { key: "occupied", label: "Rooms sold", kind: "number" },
      { key: "occupancy", label: "Occupancy %", kind: "percent" },
      { key: "adr", label: "ADR", kind: "money" },
      { key: "revpar", label: "RevPAR", kind: "money" },
      { key: "revenue", label: "Room revenue", kind: "money" },
    ],
    rows,
    summary: [
      { label: "Room-nights sold", value: sold, kind: "number" },
      { label: "Average occupancy", value: available > 0 ? Math.round((sold / available) * 1000) / 10 : 0, kind: "percent" },
      { label: "ADR", value: sold > 0 ? (revenue / sold).toFixed(2) : "0.00", kind: "money" },
      { label: "Room revenue earned", value: revenue.toFixed(2), kind: "money" },
    ],
  };
}

/** Cash collected (payments − refunds) vs revenue earned (room nights + charges posted). */
async function revenueReport(actor: Actor, input: unknown): Promise<ReportResult> {
  const r = await resolveRange(actor, input);
  const result = await db.execute<{
    date: string;
    cash: string;
    card: string;
    upi: string;
    bank_transfer: string;
    other: string;
    refunds: string;
    net_collected: string;
    room_earned: string;
    charges_earned: string;
  }>(sql`
    with days as (select d::date as day from generate_series(${r.from}::date, ${r.to}::date, interval '1 day') d),
    pay as (
      select (p.paid_at at time zone ${r.tz})::date as day, p.kind, p.method, sum(p.amount) as amount
      from payments p join reservations res on res.id = p.reservation_id
      where res.hotel_id = ${actor.hotelId} and p.status = 'completed'
        and p.paid_at >= (${r.from}::date)::timestamp at time zone ${r.tz}
        and p.paid_at < (${r.toExclusive}::date)::timestamp at time zone ${r.tz}
      group by 1, 2, 3
    ),
    room as (
      select days.day, sum((res.subtotal - res.discount_amount) / (res.check_out_date - res.check_in_date)) as amount
      from days join reservations res on res.hotel_id = ${actor.hotelId}
        and res.status in ('checked_in', 'checked_out')
        and res.check_in_date <= days.day and res.check_out_date > days.day
      group by 1
    ),
    chg as (
      select (c.created_at at time zone ${r.tz})::date as day, sum(c.total_amount) as amount
      from additional_charges c join reservations res on res.id = c.reservation_id
      where res.hotel_id = ${actor.hotelId} and c.status = 'active'
        and c.created_at >= (${r.from}::date)::timestamp at time zone ${r.tz}
        and c.created_at < (${r.toExclusive}::date)::timestamp at time zone ${r.tz}
      group by 1
    )
    select days.day::text as date,
      coalesce(sum(pay.amount) filter (where pay.kind = 'payment' and pay.method = 'cash'), 0)::text as cash,
      coalesce(sum(pay.amount) filter (where pay.kind = 'payment' and pay.method = 'card'), 0)::text as card,
      coalesce(sum(pay.amount) filter (where pay.kind = 'payment' and pay.method = 'upi'), 0)::text as upi,
      coalesce(sum(pay.amount) filter (where pay.kind = 'payment' and pay.method = 'bank_transfer'), 0)::text as bank_transfer,
      coalesce(sum(pay.amount) filter (where pay.kind = 'payment' and pay.method = 'other'), 0)::text as other,
      coalesce(sum(pay.amount) filter (where pay.kind = 'refund'), 0)::text as refunds,
      coalesce(sum(case when pay.kind = 'payment' then pay.amount else -pay.amount end), 0)::text as net_collected,
      coalesce(max(room.amount), 0)::numeric(12,2)::text as room_earned,
      coalesce(max(chg.amount), 0)::text as charges_earned
    from days
    left join pay on pay.day = days.day
    left join room on room.day = days.day
    left join chg on chg.day = days.day
    group by days.day order by days.day
  `);
  const sum = (k: keyof (typeof result.rows)[number]) =>
    result.rows.reduce((s, x) => s + Number(x[k]), 0).toFixed(2);
  return {
    type: "revenue",
    title: "Revenue report",
    description:
      "Cash collected = completed payments received on each hotel-local day minus refunds issued that day (voided entries excluded). Revenue earned = room revenue for nights actually stayed (checked-in/out stays, net of discount, before tax) plus additional charges posted that day. The two differ because deposits are collected before nights are earned and balances may be collected later.",
    from: r.from,
    to: r.to,
    currency: r.hotel.currency,
    columns: [
      { key: "date", label: "Date", kind: "date" },
      { key: "cash", label: "Cash", kind: "money" },
      { key: "card", label: "Card", kind: "money" },
      { key: "upi", label: "UPI", kind: "money" },
      { key: "bank_transfer", label: "Bank transfer", kind: "money" },
      { key: "other", label: "Other", kind: "money" },
      { key: "refunds", label: "Refunds", kind: "money" },
      { key: "net_collected", label: "Net collected", kind: "money" },
      { key: "room_earned", label: "Room revenue earned", kind: "money" },
      { key: "charges_earned", label: "Charges earned", kind: "money" },
    ],
    rows: result.rows,
    summary: [
      { label: "Net cash collected", value: sum("net_collected"), kind: "money" },
      { label: "Refunds issued", value: sum("refunds"), kind: "money" },
      { label: "Room revenue earned", value: sum("room_earned"), kind: "money" },
      { label: "Charges earned", value: sum("charges_earned"), kind: "money" },
    ],
  };
}

/** Reservations booked (created) in the range — booked revenue by creation date. */
async function reservationsReport(actor: Actor, input: unknown): Promise<ReportResult> {
  const r = await resolveRange(actor, input);
  const result = await db.execute<Record<string, string | number>>(sql`
    select res.reservation_number, (res.created_at at time zone ${r.tz})::date::text as booked_on,
      g.first_name || ' ' || g.last_name as guest, rm.room_number, rt.name as room_type,
      res.check_in_date::text as check_in, res.check_out_date::text as check_out,
      (res.check_out_date - res.check_in_date) as nights, res.status::text as status,
      res.total_amount::text as total
    from reservations res
    join guests g on g.id = res.guest_id
    join rooms rm on rm.id = res.room_id
    join room_types rt on rt.id = rm.room_type_id
    where res.hotel_id = ${actor.hotelId}
      and res.created_at >= (${r.from}::date)::timestamp at time zone ${r.tz}
      and res.created_at < (${r.toExclusive}::date)::timestamp at time zone ${r.tz}
    order by res.created_at
  `);
  const active = result.rows.filter((x) => x.status !== "cancelled");
  return {
    type: "reservations",
    title: "Reservation report",
    description:
      "Reservations created in the period (by hotel-local booking date). Booked value is the room total including tax for reservations that are not cancelled; it is revenue booked, not cash collected.",
    from: r.from,
    to: r.to,
    currency: r.hotel.currency,
    columns: [
      { key: "reservation_number", label: "Reservation" },
      { key: "booked_on", label: "Booked on", kind: "date" },
      { key: "guest", label: "Guest" },
      { key: "room_number", label: "Room" },
      { key: "room_type", label: "Room type" },
      { key: "check_in", label: "Check-in", kind: "date" },
      { key: "check_out", label: "Check-out", kind: "date" },
      { key: "nights", label: "Nights", kind: "number" },
      { key: "status", label: "Status" },
      { key: "total", label: "Room total", kind: "money" },
    ],
    rows: result.rows,
    summary: [
      { label: "Reservations created", value: result.rows.length, kind: "number" },
      { label: "Not cancelled", value: active.length, kind: "number" },
      { label: "Booked value", value: active.reduce((s, x) => s + Number(x.total), 0).toFixed(2), kind: "money" },
    ],
  };
}

async function cancellationsReport(actor: Actor, input: unknown): Promise<ReportResult> {
  const r = await resolveRange(actor, input);
  const result = await db.execute<Record<string, string | number>>(sql`
    select res.reservation_number, res.status::text as status,
      g.first_name || ' ' || g.last_name as guest, rm.room_number,
      res.check_in_date::text as check_in, res.check_out_date::text as check_out,
      case when res.status = 'cancelled' then (res.cancelled_at at time zone ${r.tz})::date::text
           else res.check_in_date::text end as event_date,
      coalesce(res.cancellation_reason, '') as reason,
      res.total_amount::text as lost_value
    from reservations res
    join guests g on g.id = res.guest_id
    join rooms rm on rm.id = res.room_id
    where res.hotel_id = ${actor.hotelId} and (
      (res.status = 'cancelled'
        and res.cancelled_at >= (${r.from}::date)::timestamp at time zone ${r.tz}
        and res.cancelled_at < (${r.toExclusive}::date)::timestamp at time zone ${r.tz})
      or (res.status = 'no_show' and res.check_in_date between ${r.from}::date and ${r.to}::date)
    )
    order by event_date
  `);
  const cancelled = result.rows.filter((x) => x.status === "cancelled");
  const noShows = result.rows.filter((x) => x.status === "no_show");
  return {
    type: "cancellations",
    title: "Cancellations & no-shows",
    description:
      "Cancellations by the hotel-local date they were cancelled, and no-shows by their scheduled arrival date. Lost value is the room total that was not realised.",
    from: r.from,
    to: r.to,
    currency: r.hotel.currency,
    columns: [
      { key: "reservation_number", label: "Reservation" },
      { key: "status", label: "Type" },
      { key: "event_date", label: "Date", kind: "date" },
      { key: "guest", label: "Guest" },
      { key: "room_number", label: "Room" },
      { key: "check_in", label: "Check-in", kind: "date" },
      { key: "check_out", label: "Check-out", kind: "date" },
      { key: "reason", label: "Reason" },
      { key: "lost_value", label: "Lost value", kind: "money" },
    ],
    rows: result.rows,
    summary: [
      { label: "Cancellations", value: cancelled.length, kind: "number" },
      { label: "No-shows", value: noShows.length, kind: "number" },
      { label: "Lost value", value: result.rows.reduce((s, x) => s + Number(x.lost_value), 0).toFixed(2), kind: "money" },
    ],
  };
}

/** Point-in-time list (not date-filtered by default): every reservation that still owes money. */
async function outstandingReport(actor: Actor, input: unknown): Promise<ReportResult> {
  const r = await resolveRange(actor, input);
  const result = await db.execute<Record<string, string | number>>(sql`
    with fin as (
      select res.id,
        (case when res.status in ('cancelled', 'no_show') then 0 else res.total_amount end) as room_total,
        coalesce((select sum(c.total_amount) from additional_charges c where c.reservation_id = res.id and c.status = 'active'), 0) as charges,
        coalesce((select sum(case when p.kind = 'payment' then p.amount else -p.amount end)
                  from payments p where p.reservation_id = res.id and p.status = 'completed'), 0) as net_paid
      from reservations res where res.hotel_id = ${actor.hotelId}
    )
    select res.reservation_number, res.status::text as status,
      g.first_name || ' ' || g.last_name as guest, coalesce(g.phone, '') as phone, rm.room_number,
      res.check_in_date::text as check_in, res.check_out_date::text as check_out,
      fin.room_total::text as room_total, fin.charges::text as charges, fin.net_paid::text as paid,
      (fin.room_total + fin.charges - fin.net_paid)::text as balance
    from reservations res
    join fin on fin.id = res.id
    join guests g on g.id = res.guest_id
    join rooms rm on rm.id = res.room_id
    where fin.room_total + fin.charges - fin.net_paid > 0
      and res.check_in_date <= ${r.to}::date
    order by res.check_in_date
  `);
  return {
    type: "outstanding",
    title: "Outstanding balances",
    description:
      "Reservations with an unpaid balance as of now, for stays arriving on or before the end date. Balance = room total (waived for cancellations and no-shows) + active charges − payments + refunds.",
    from: r.from,
    to: r.to,
    currency: r.hotel.currency,
    columns: [
      { key: "reservation_number", label: "Reservation" },
      { key: "status", label: "Status" },
      { key: "guest", label: "Guest" },
      { key: "phone", label: "Phone" },
      { key: "room_number", label: "Room" },
      { key: "check_in", label: "Check-in", kind: "date" },
      { key: "check_out", label: "Check-out", kind: "date" },
      { key: "room_total", label: "Room total", kind: "money" },
      { key: "charges", label: "Charges", kind: "money" },
      { key: "paid", label: "Paid", kind: "money" },
      { key: "balance", label: "Balance", kind: "money" },
    ],
    rows: result.rows,
    summary: [
      { label: "Reservations owing", value: result.rows.length, kind: "number" },
      { label: "Total outstanding", value: result.rows.reduce((s, x) => s + Number(x.balance), 0).toFixed(2), kind: "money" },
    ],
  };
}

async function utilizationReport(actor: Actor, input: unknown): Promise<ReportResult> {
  const r = await resolveRange(actor, input);
  const totalNights = nightsBetween(r.from, r.toExclusive);
  const result = await db.execute<{ room_number: string; room_type: string; floor: number; status: string; nights: number; revenue: string }>(sql`
    select rm.room_number, rt.name as room_type, rm.floor, rm.operational_status::text as status,
      coalesce(sum(greatest(0, least(res.check_out_date, ${r.toExclusive}::date) - greatest(res.check_in_date, ${r.from}::date))), 0)::int as nights,
      coalesce(sum(
        (res.subtotal - res.discount_amount) / (res.check_out_date - res.check_in_date)
        * greatest(0, least(res.check_out_date, ${r.toExclusive}::date) - greatest(res.check_in_date, ${r.from}::date))
      ), 0)::numeric(12,2)::text as revenue
    from rooms rm
    join room_types rt on rt.id = rm.room_type_id
    left join reservations res on res.room_id = rm.id
      and res.status in ('pending', 'confirmed', 'checked_in', 'checked_out')
      and res.check_in_date < ${r.toExclusive}::date and res.check_out_date > ${r.from}::date
    where rm.hotel_id = ${actor.hotelId} and rm.archived_at is null
    group by rm.id, rt.name
    order by rm.room_number
  `);
  const rows = result.rows.map((x) => ({
    ...x,
    utilization: totalNights > 0 ? Math.round((x.nights / totalNights) * 1000) / 10 : 0,
  }));
  return {
    type: "utilization",
    title: "Room utilization",
    description: `Nights sold per room within the period (${totalNights} nights), with room revenue (net of discount, before tax) allocated to those nights.`,
    from: r.from,
    to: r.to,
    currency: r.hotel.currency,
    columns: [
      { key: "room_number", label: "Room" },
      { key: "room_type", label: "Type" },
      { key: "floor", label: "Floor", kind: "number" },
      { key: "status", label: "Current status" },
      { key: "nights", label: "Nights sold", kind: "number" },
      { key: "utilization", label: "Utilization %", kind: "percent" },
      { key: "revenue", label: "Room revenue", kind: "money" },
    ],
    rows,
    summary: [
      { label: "Rooms", value: rows.length, kind: "number" },
      {
        label: "Average utilization",
        value: rows.length ? Math.round((rows.reduce((s, x) => s + x.utilization, 0) / rows.length) * 10) / 10 : 0,
        kind: "percent",
      },
    ],
  };
}

const RUNNERS: Record<ReportType, (actor: Actor, input: unknown) => Promise<ReportResult>> = {
  occupancy: occupancyReport,
  revenue: revenueReport,
  reservations: reservationsReport,
  cancellations: cancellationsReport,
  outstanding: outstandingReport,
  utilization: utilizationReport,
};

export async function runReport(actor: Actor, type: ReportType, input: unknown): Promise<ReportResult> {
  assertCan(actor, "reports:view");
  return RUNNERS[type](actor, input);
}

/** Prevents spreadsheet formula injection and escapes CSV special characters. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(report: ReportResult): string {
  const header = report.columns.map((c) => csvCell(c.label)).join(",");
  const lines = report.rows.map((row) => report.columns.map((c) => csvCell(row[c.key])).join(","));
  return [header, ...lines].join("\r\n") + "\r\n";
}

export async function exportReportCsv(actor: Actor, type: ReportType, input: unknown) {
  assertCan(actor, "reports:export");
  const report = await runReport(actor, type, input);
  await writeAudit(db, actor, {
    action: "report.exported",
    entityType: "report",
    entityId: type,
    metadata: { from: report.from, to: report.to, rows: report.rows.length },
  });
  return { filename: `${type}-${report.from}-to-${report.to}.csv`, csv: toCsv(report) };
}
