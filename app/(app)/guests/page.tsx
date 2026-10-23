import type { Metadata } from "next";
import Link from "next/link";
import { Search, UserPlus, Users } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Pagination } from "@/components/app/pagination";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can } from "@/lib/permissions";
import { flatParams } from "@/lib/search-params";
import { formatDisplayDate } from "@/lib/utils/dates";
import { guestListQuerySchema, listGuests } from "@/server/services/guests";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Guests" };

export default async function GuestsPage({ searchParams }: PageProps<"/guests">) {
  const actor = await requirePageActor("guests:view");
  const params = flatParams(await searchParams);
  const parsed = guestListQuerySchema.safeParse(params);
  const result = await listGuests(actor, parsed.success ? parsed.data : {});
  return (
    <>
      <PageHeader
        title="Guests"
        description="Guest profiles, stay history and balances."
        actions={
          can(actor.role, "guests:manage") ? (
            <Button asChild>
              <Link href="/guests/new">
                <UserPlus /> Register guest
              </Link>
            </Button>
          ) : null
        }
      />
      <Card className="gap-0 py-0">
        <form method="get" className="flex gap-2 border-b p-3">
          <div className="relative max-w-md flex-1">
            <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" aria-hidden />
            <Input name="q" defaultValue={params.q ?? ""} placeholder="Search name, email or phone" className="pl-8" aria-label="Search guests" />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
        {result.rows.length === 0 ? (
          <EmptyState icon={Users} title="No guests found" description={params.q ? "Try a different search." : "Guests appear here once registered."} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="hidden md:table-cell">Email</TableHead>
                <TableHead className="text-right">Stays</TableHead>
                <TableHead className="hidden sm:table-cell">Last stay</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((g) => (
                <TableRow key={g.id}>
                  <TableCell>
                    <Link href={`/guests/${g.id}`} className="text-primary font-medium hover:underline">
                      {g.lastName}, {g.firstName}
                    </Link>
                  </TableCell>
                  <TableCell>{g.phone ?? "—"}</TableCell>
                  <TableCell className="hidden md:table-cell">{g.email ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{g.totalStays}</TableCell>
                  <TableCell className="hidden sm:table-cell">{g.lastStay ? formatDisplayDate(g.lastStay) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pagination pathname="/guests" params={params} {...result} />
      </Card>
    </>
  );
}
