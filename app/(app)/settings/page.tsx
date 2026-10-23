import type { Metadata } from "next";
import Link from "next/link";
import { Tags } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsForm } from "@/features/admin/settings-form";
import { getHotelSettings } from "@/server/services/settings";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const actor = await requirePageActor("settings:manage");
  const hotel = await getHotelSettings(actor);
  return (
    <>
      <PageHeader
        title="Hotel settings"
        description="Changes are recorded in the audit log."
        actions={
          <Button asChild variant="outline">
            <Link href="/rooms/types">
              <Tags /> Room types &amp; base rates
            </Link>
          </Button>
        }
      />
      <Card className="max-w-4xl">
        <CardContent>
          <SettingsForm
            timezones={Intl.supportedValuesOf("timeZone")}
            initial={{
              name: hotel.name,
              address: hotel.address ?? "",
              phone: hotel.phone ?? "",
              email: hotel.email ?? "",
              currency: hotel.currency,
              timezone: hotel.timezone,
              checkInTime: hotel.checkInTime.slice(0, 5),
              checkOutTime: hotel.checkOutTime.slice(0, 5),
              taxRate: hotel.taxRate,
              enabledPaymentMethods: hotel.enabledPaymentMethods,
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
