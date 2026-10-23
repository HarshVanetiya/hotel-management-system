import "server-only";
import { and, asc, count, desc, eq, gt, inArray, isNull, lt, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { guests, housekeepingTasks, reservations, roomTypes, rooms } from "@/db/schema";
import { db } from "@/lib/db";
import { addDaysISO, isISODate } from "@/lib/utils/dates";
import { toCents } from "@/lib/utils/money";
import { assertCan, type Actor } from "../actor";
import { getHotelOrThrow, hotelToday, parseInput } from "./common";
import { balanceSql } from "./finance-sql";
import { qc } from "./sql-helpers";

const guestNameSql = sql<string>`${guests.firstName} || ' ' || ${guests.lastName}`;

/** Statuses counted as "on the books" for occupancy (sold room-nights). */
const SOLD_STATUSES = ["pending", "confirmed", "checked_in", "checked_out"] as const;

/** Shared row shape for operational stay lists. */
async function stayList(actor: Actor, where: SQL | undefined, orderBy: SQL[] = [asc(rooms.roomNumber)]) {
  return db
    .select({
      id: reservations.id,
      reservationNumber: reservations.reservationNumber,
      status: reservations.status,
      checkInDate: reservations.checkInDate,
      checkOutDate: reservations.checkOutDate,
      adults: reservations.adults,
      children: reservations.children,
      totalAmount: reservations.totalAmount,
      specialRequests: reservations.specialRequests,
      checkedInAt: reservations.checkedInAt,
      checkedOutAt: reservations.checkedOutAt,
      guestId: guests.id,
      guestName: guestNameSql,
      guestPhone: guests.phone,
      roomId: rooms.id,
      roomNumber: rooms.roomNumber,
      roomTypeName: roomTypes.name,
      housekeepingStatus: rooms.housekeepingStatus,
      operationalStatus: rooms.operationalStatus,
      balance: balanceSql,
      createdAt: reservations.createdAt,
    })
    .from(reservations)
    .innerJoin(guests, eq(guests.id, reservations.guestId))
    .innerJoin(rooms, eq(rooms.id, reservations.roomId))
    .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
    .where(and(eq(reservations.hotelId, actor.hotelId), where))
    .orderBy(...orderBy);
}

export type StayRow = Awaited<ReturnType<typeof stayList>>[number];

// ---------------------------------------------------------------------------
// Front desk
// ---------------------------------------------------------------------------

export async function getFrontDesk(actor: Actor) {
  assertCan(actor, "frontdesk:operate");
  const hotel = await getHotelOrThrow(db, actor.hotelId);
  const today = hotelToday(hotel);
  const [arrivals, departures, inHouse, overdueArrivals] = await Promise.all([
    // Expected and completed arrivals for today.
    stayList(
      actor,
      and(eq(reservations.checkInDate, today), inArray(reservations.status, ["pending", "confirmed", "checked_in"])),
    ),
    // Guests due out today, overdue departures, and today's completed check-outs.
    stayList(
      actor,
      or(
        and(eq(reservations.status, "checked_in"), lte(reservations.checkOutDate, today)),
        and(
          eq(reservations.status, "checked_out"),
          sql`(${reservations.checkedOutAt} AT TIME ZONE ${hotel.timezone})::date = ${today}::date`,
        ),
      ),
    ),
    stayList(actor, eq(reservations.status, "checked_in")),
    // Earlier arrivals that never showed up: candidates for no-show.
    stayList(
      actor,
      and(
        lt(reservations.checkInDate, today),
        inArray(reservations.status, ["pending", "confirmed"]),
      ),
      [asc(reservations.checkInDate)],
    ),
  ]);
  const pendingBalances = inHouse.filter((r) => toCents(r.balance) > 0);
  return { today, hotel, arrivals, departures, inHouse, overdueArrivals, pendingBalances };
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export async function getDashboard(actor: Actor) {
  assertCan(actor, "dashboard:view");
  const hotel = await getHotelOrThrow(db, actor.hotelId);
  const today = hotelToday(hotel);
  const tz = hotel.timezone;
  const trendFrom = addDaysISO(today, -13);
  const trendTo = addDaysISO(today, 7);

  const roomStatsQuery = db
    .select({
      total: count(),
      inService: sql<number>`count(*) filter (where ${rooms.operationalStatus} = 'in_service')::int`,
      maintenance: sql<number>`count(*) filter (where ${rooms.operationalStatus} <> 'in_service')::int`,
      occupied: sql<number>`count(*) filter (where exists (
        select 1 from ${reservations} where ${qc(reservations.roomId)} = ${qc(rooms.id)} and ${qc(reservations.status)} = 'checked_in'))::int`,
      soldTonight: sql<number>`count(*) filter (where exists (
        select 1 from ${reservations} where ${qc(reservations.roomId)} = ${qc(rooms.id)}
        and ((${qc(reservations.status)} in ('pending', 'confirmed', 'checked_in')
              and ${qc(reservations.checkInDate)} <= ${today} and ${qc(reservations.checkOutDate)} > ${today})
             or ${qc(reservations.status)} = 'checked_in')))::int`,
      availableTonight: sql<number>`count(*) filter (where ${qc(rooms.operationalStatus)} = 'in_service' and not exists (
        select 1 from ${reservations} where ${qc(reservations.roomId)} = ${qc(rooms.id)}
        and ((${qc(reservations.status)} in ('pending', 'confirmed', 'checked_in')
              and ${qc(reservations.checkInDate)} <= ${today} and ${qc(reservations.checkOutDate)} > ${today})
             or ${qc(reservations.status)} = 'checked_in')))::int`,
    })
    .from(rooms)
    .where(and(eq(rooms.hotelId, actor.hotelId), isNull(rooms.archivedAt)));

  const reservationStatsQuery = db
    .select({
      arrivals: sql<number>`count(*) filter (where ${reservations.checkInDate} = ${today} and ${reservations.status} in ('pending', 'confirmed', 'checked_in'))::int`,
      arrivalsPending: sql<number>`count(*) filter (where ${reservations.checkInDate} = ${today} and ${reservations.status} in ('pending', 'confirmed'))::int`,
      departures: sql<number>`count(*) filter (where ${reservations.checkOutDate} = ${today} and ${reservations.status} in ('checked_in', 'checked_out'))::int`,
      departuresPending: sql<number>`count(*) filter (where ${reservations.checkOutDate} <= ${today} and ${reservations.status} = 'checked_in')::int`,
      inHouseReservations: sql<number>`count(*) filter (where ${reservations.status} = 'checked_in')::int`,
      inHouseGuests: sql<number>`coalesce(sum(${reservations.adults} + ${reservations.children}) filter (where ${reservations.status} = 'checked_in'), 0)::int`,
    })
    .from(reservations)
    .where(eq(reservations.hotelId, actor.hotelId));

  // "Due now" = stays that have started (in house or checked out). Unpaid future
  // bookings are reported separately because they are not yet payable.
  const outstandingQuery = db
    .select({
      amount: sql<string>`coalesce(sum(greatest(${balanceSql}, 0)) filter (where ${reservations.status} in ('checked_in', 'checked_out')), 0)`,
      reservations: sql<number>`count(*) filter (where ${reservations.status} in ('checked_in', 'checked_out') and ${balanceSql} > 0)::int`,
      upcomingAmount: sql<string>`coalesce(sum(greatest(${balanceSql}, 0)) filter (where ${reservations.status} in ('pending', 'confirmed')), 0)`,
    })
    .from(reservations)
    .where(and(eq(reservations.hotelId, actor.hotelId), inArray(reservations.status, [...SOLD_STATUSES])));

  const housekeepingQuery = db
    .select({ pending: count() })
    .from(housekeepingTasks)
    .innerJoin(rooms, eq(rooms.id, housekeepingTasks.roomId))
    .where(and(eq(rooms.hotelId, actor.hotelId), inArray(housekeepingTasks.status, ["pending", "in_progress"])));

  // Net cash collected per hotel-local day (payments minus refunds, excluding voided entries).
  const revenueTrendQuery = db.execute<{ date: string; collected: string }>(sql`
    with days as (
      select d::date as day from generate_series(${trendFrom}::date, ${today}::date, interval '1 day') d
    ),
    collected as (
      select (p.paid_at at time zone ${tz})::date as day,
             sum(case when p.kind = 'payment' then p.amount else -p.amount end) as amount
      from payments p join reservations r on r.id = p.reservation_id
      where r.hotel_id = ${actor.hotelId} and p.status = 'completed'
        and p.paid_at >= (${trendFrom}::date)::timestamp at time zone ${tz}
        and p.paid_at < (${addDaysISO(today, 1)}::date)::timestamp at time zone ${tz}
      group by 1
    )
    select days.day::text as date, coalesce(collected.amount, 0)::text as collected
    from days left join collected on collected.day = days.day
    order by days.day
  `);

  // Room-nights on the books per night (includes the next 7 nights as forecast).
  const occupancyTrendQuery = db.execute<{ date: string; occupied: number }>(sql`
    select d::date::text as date,
      (select count(*) from reservations r
        where r.hotel_id = ${actor.hotelId}
          and r.status in ('pending', 'confirmed', 'checked_in', 'checked_out')
          and r.check_in_date <= d::date and r.check_out_date > d::date)::int as occupied
    from generate_series(${trendFrom}::date, ${trendTo}::date, interval '1 day') d
    order by d
  `);

  const [[roomStats], [resStats], [outstanding], [hk], revenueTrend, occupancyTrend, arrivals, departures, recent] =
    await Promise.all([
      roomStatsQuery,
      reservationStatsQuery,
      outstandingQuery,
      housekeepingQuery,
      revenueTrendQuery,
      occupancyTrendQuery,
      stayList(
        actor,
        and(eq(reservations.checkInDate, today), inArray(reservations.status, ["pending", "confirmed", "checked_in"])),
      ),
      stayList(
        actor,
        or(
          and(eq(reservations.status, "checked_in"), lte(reservations.checkOutDate, today)),
          and(eq(reservations.checkOutDate, today), eq(reservations.status, "checked_out")),
        ),
      ),
      stayList(actor, ne(reservations.status, "cancelled"), [desc(reservations.createdAt)]).then((r) => r.slice(0, 8)),
    ]);

  const sellable = roomStats.inService;
  const revenueToday = revenueTrend.rows.at(-1)?.collected ?? "0";
  return {
    today,
    hotel,
    rooms: roomStats,
    reservations: resStats,
    outstanding,
    pendingHousekeeping: hk.pending,
    revenueToday,
    occupancyRate: sellable > 0 ? roomStats.soldTonight / sellable : 0,
    revenueTrend: revenueTrend.rows.map((r) => ({ date: r.date, collected: Number(r.collected) })),
    occupancyTrend: occupancyTrend.rows.map((r) => ({
      date: r.date,
      occupied: Number(r.occupied),
      rate: sellable > 0 ? Math.round((Number(r.occupied) / sellable) * 1000) / 10 : 0,
      forecast: r.date > today,
    })),
    arrivals,
    departures,
    recent,
  };
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export const calendarQuerySchema = z.object({
  start: z.string().refine(isISODate).optional(),
  days: z.coerce.number().int().min(7).max(31).default(14),
  roomTypeId: z.uuid().optional(),
});

export async function getCalendar(actor: Actor, input: unknown) {
  assertCan(actor, "calendar:view");
  const q = parseInput(calendarQuerySchema, input);
  const hotel = await getHotelOrThrow(db, actor.hotelId);
  const today = hotelToday(hotel);
  const start = q.start ?? addDaysISO(today, -2);
  const end = addDaysISO(start, q.days); // exclusive

  const [roomRows, stays] = await Promise.all([
    db
      .select({
        id: rooms.id,
        roomNumber: rooms.roomNumber,
        floor: rooms.floor,
        operationalStatus: rooms.operationalStatus,
        housekeepingStatus: rooms.housekeepingStatus,
        roomTypeId: roomTypes.id,
        roomTypeName: roomTypes.name,
        capacity: roomTypes.capacity,
      })
      .from(rooms)
      .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
      .where(
        and(
          eq(rooms.hotelId, actor.hotelId),
          isNull(rooms.archivedAt),
          q.roomTypeId ? eq(rooms.roomTypeId, q.roomTypeId) : undefined,
        ),
      )
      .orderBy(asc(roomTypes.basePrice), asc(rooms.roomNumber)),
    db
      .select({
        id: reservations.id,
        reservationNumber: reservations.reservationNumber,
        roomId: reservations.roomId,
        checkInDate: reservations.checkInDate,
        checkOutDate: reservations.checkOutDate,
        status: reservations.status,
        adults: reservations.adults,
        children: reservations.children,
        guestName: guestNameSql,
      })
      .from(reservations)
      .innerJoin(guests, eq(guests.id, reservations.guestId))
      .where(
        and(
          eq(reservations.hotelId, actor.hotelId),
          inArray(reservations.status, [...SOLD_STATUSES]),
          lt(reservations.checkInDate, end),
          gt(reservations.checkOutDate, start),
        ),
      ),
  ]);
  return { start, days: q.days, today, rooms: roomRows, reservations: stays };
}
