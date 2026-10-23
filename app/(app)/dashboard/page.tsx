import type { Metadata } from "next";
import Link from "next/link";
import {
  BedDouble,
  CalendarPlus,
  DoorClosed,
  DoorOpen,
  LogIn,
  SprayCan,
  TrendingUp,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Money } from "@/components/app/money";
import { ReservationStatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OccupancyChart, RevenueChart } from "@/features/dashboard/dashboard-charts";
import { StayTable } from "@/features/reservations/stay-table";
import { formatDisplayDate } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";
import { getDashboard } from "@/server/services/operations";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const actor = await requirePageActor("dashboard:view");
  const d = await getDashboard(actor);
  const currency = d.hotel.currency;
  const methods = d.hotel.enabledPaymentMethods;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Live figures for ${formatDisplayDate(d.today, "EEEE, dd MMMM yyyy")} (${d.hotel.timezone}).`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/front-desk">
                <LogIn /> Check in a guest
              </Link>
            </Button>
            <Button asChild>
              <Link href="/reservations/new">
                <CalendarPlus /> New reservation
              </Link>
            </Button>
          </>
        }
      />

      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Occupancy tonight"
          value={`${Math.round(d.occupancyRate * 1000) / 10}%`}
          hint={`${d.rooms.soldTonight} of ${d.rooms.inService} rooms in service sold`}
          icon={TrendingUp}
          tone="info"
        />
        <StatCard
          label="Available tonight"
          value={d.rooms.availableTonight}
          hint={`${d.rooms.total} rooms total`}
          icon={BedDouble}
          tone="good"
        />
        <StatCard label="Occupied now" value={d.rooms.occupied} hint={`${d.reservations.inHouseGuests} guests in house`} icon={Users} tone="info" />
        <StatCard
          label="Maintenance"
          value={d.rooms.maintenance}
          hint="Out of order or out of service"
          icon={Wrench}
          tone={d.rooms.maintenance > 0 ? "bad" : "default"}
        />
        <StatCard
          label="Arrivals today"
          value={d.reservations.arrivals}
          hint={`${d.reservations.arrivalsPending} still expected`}
          icon={DoorOpen}
        />
        <StatCard
          label="Departures today"
          value={d.reservations.departures}
          hint={`${d.reservations.departuresPending} still to check out`}
          icon={DoorClosed}
          tone={d.reservations.departuresPending > 0 ? "warn" : "default"}
        />
        <StatCard
          label="Collected today"
          value={formatMoney(d.revenueToday, currency)}
          hint="Payments minus refunds"
          icon={Wallet}
          tone="good"
        />
        <StatCard
          label="Outstanding balances"
          value={formatMoney(d.outstanding.amount, currency)}
          hint={`${d.outstanding.reservations} open reservations owe money`}
          icon={Wallet}
          tone={Number(d.outstanding.amount) > 0 ? "warn" : "default"}
        />
        <StatCard
          label="Housekeeping"
          value={d.pendingHousekeeping}
          hint="Open tasks"
          icon={SprayCan}
          tone={d.pendingHousekeeping > 0 ? "warn" : "default"}
        />
      </section>

      <section className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Occupancy trend</CardTitle>
            <CardDescription>
              Rooms sold per night ÷ rooms currently in service. Last 14 nights and the next 7 on the books.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OccupancyChart data={d.occupancyTrend} today={d.today} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Cash collected</CardTitle>
            <CardDescription>
              Net payments received per hotel-local day (refunds deducted, voided entries excluded). Last 14 days.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RevenueChart data={d.revenueTrend} currency={currency} />
          </CardContent>
        </Card>
      </section>

      <section className="mt-5 grid gap-4 xl:grid-cols-2">
        <Card className="gap-2 pb-0">
          <CardHeader>
            <CardTitle>Today&apos;s arrivals</CardTitle>
            <CardDescription>Expected and completed check-ins for today.</CardDescription>
          </CardHeader>
          <StayTable
            rows={d.arrivals}
            currency={currency}
            today={d.today}
            methods={methods}
            emptyTitle="No arrivals today"
            emptyIcon={DoorOpen}
            showDates="out"
          />
        </Card>
        <Card className="gap-2 pb-0">
          <CardHeader>
            <CardTitle>Departures</CardTitle>
            <CardDescription>Guests due out today (including overdue) and today&apos;s completed check-outs.</CardDescription>
          </CardHeader>
          <StayTable
            rows={d.departures}
            currency={currency}
            today={d.today}
            methods={methods}
            emptyTitle="No departures today"
            emptyIcon={DoorClosed}
            showDates="out"
          />
        </Card>
      </section>

      <Card className="mt-5 gap-2 pb-2">
        <CardHeader>
          <CardTitle>Recent reservations</CardTitle>
          <CardDescription>Most recently created bookings.</CardDescription>
        </CardHeader>
        <ul className="divide-y">
          {d.recent.length === 0 ? <li className="text-muted-foreground px-5 py-4 text-sm">No reservations yet.</li> : null}
          {d.recent.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
              <div className="min-w-0">
                <Link href={`/reservations/${r.id}`} className="font-medium hover:underline">
                  {r.guestName}
                </Link>
                <span className="text-muted-foreground">
                  {" "}
                  · {r.reservationNumber} · Room {r.roomNumber} · {formatDisplayDate(r.checkInDate, "dd MMM")} →{" "}
                  {formatDisplayDate(r.checkOutDate, "dd MMM")}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Money value={r.totalAmount} currency={currency} />
                <ReservationStatusBadge status={r.status} />
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
