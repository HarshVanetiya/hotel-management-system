import type { Metadata } from "next";
import Link from "next/link";
import { CalendarPlus, DoorClosed, DoorOpen, Hotel, UserX, Wallet } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StayTable } from "@/features/reservations/stay-table";
import { RecordPaymentDialog } from "@/features/reservations/record-payment-dialog";
import { formatDisplayDate } from "@/lib/utils/dates";
import { getFrontDesk } from "@/server/services/operations";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Front desk" };

export default async function FrontDeskPage() {
  const actor = await requirePageActor("frontdesk:operate");
  const fd = await getFrontDesk(actor);
  const currency = fd.hotel.currency;
  const methods = fd.hotel.enabledPaymentMethods;
  const expected = fd.arrivals.filter((a) => a.status !== "checked_in");
  const dueOut = fd.departures.filter((d) => d.status === "checked_in");
  const common = { currency, today: fd.today, methods };

  const tabs = [
    { value: "arrivals", label: "Arrivals", count: expected.length, icon: DoorOpen },
    { value: "departures", label: "Departures", count: dueOut.length, icon: DoorClosed },
    { value: "in-house", label: "In house", count: fd.inHouse.length, icon: Hotel },
    { value: "balances", label: "Pending balances", count: fd.pendingBalances.length, icon: Wallet },
    { value: "overdue", label: "Missed arrivals", count: fd.overdueArrivals.length, icon: UserX },
  ];

  return (
    <>
      <PageHeader
        title="Front desk"
        description={`Arrivals, departures and in-house guests for ${formatDisplayDate(fd.today, "EEEE dd MMM")}. Standard check-in ${fd.hotel.checkInTime.slice(0, 5)}, check-out ${fd.hotel.checkOutTime.slice(0, 5)}.`}
        actions={
          <>
            <RecordPaymentDialog
              trigger={
                <Button variant="outline">
                  <Wallet /> Record payment
                </Button>
              }
              currency={currency}
              methods={methods}
            />
            <Button asChild>
              <Link href="/reservations/new">
                <CalendarPlus /> Walk-in / new booking
              </Link>
            </Button>
          </>
        }
      />
      <Tabs defaultValue="arrivals">
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              <t.icon /> {t.label}
              <span className="bg-muted-foreground/10 rounded px-1.5 text-xs tabular-nums">{t.count}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="arrivals">
          <Card className="py-0">
            <StayTable rows={expected} {...common} emptyTitle="All of today's arrivals have checked in" emptyIcon={DoorOpen} />
          </Card>
          {fd.arrivals.length > expected.length ? (
            <p className="text-muted-foreground mt-2 text-xs">
              {fd.arrivals.length - expected.length} arrival(s) already checked in today.
            </p>
          ) : null}
        </TabsContent>
        <TabsContent value="departures">
          <Card className="py-0">
            <StayTable rows={dueOut} {...common} emptyTitle="No guests left to check out" emptyIcon={DoorClosed} />
          </Card>
        </TabsContent>
        <TabsContent value="in-house">
          <Card className="py-0">
            <StayTable rows={fd.inHouse} {...common} emptyTitle="No guests in house" emptyIcon={Hotel} />
          </Card>
        </TabsContent>
        <TabsContent value="balances">
          <Card className="py-0">
            <StayTable rows={fd.pendingBalances} {...common} emptyTitle="No in-house guest owes money" emptyIcon={Wallet} />
          </Card>
        </TabsContent>
        <TabsContent value="overdue">
          <p className="text-muted-foreground mb-2 text-sm">
            Reservations whose arrival date has passed without check-in. They still hold their rooms until checked in, marked
            as no-show or cancelled.
          </p>
          <Card className="py-0">
            <StayTable rows={fd.overdueArrivals} {...common} emptyTitle="No missed arrivals" emptyIcon={UserX} />
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
