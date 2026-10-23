import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { GuestForm } from "@/features/guests/guest-form";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Register guest" };

export default async function NewGuestPage() {
  await requirePageActor("guests:manage");
  return (
    <>
      <PageHeader title="Register guest" description="Collect only the information needed for the stay." />
      <Card className="max-w-3xl">
        <CardContent>
          <GuestForm />
        </CardContent>
      </Card>
    </>
  );
}
