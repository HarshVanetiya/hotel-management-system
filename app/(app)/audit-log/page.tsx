import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Pagination } from "@/components/app/pagination";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { flatParams } from "@/lib/search-params";
import { formatDateTime } from "@/lib/utils/dates";
import { auditQuerySchema, getHotelSettings, listAuditLogs } from "@/server/services/settings";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Audit log" };

const ENTITY_TYPES = ["reservation", "payment", "charge", "guest", "room", "room_type", "housekeeping_task", "user", "hotel", "report"];

function summarize(metadata: Record<string, unknown>): string {
  return Object.entries(metadata)
    .map(([k, v]) => `${k}: ${typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

export default async function AuditLogPage({ searchParams }: PageProps<"/audit-log">) {
  const actor = await requirePageActor("audit:view");
  const params = flatParams(await searchParams);
  const parsed = auditQuerySchema.safeParse(params);
  const [result, hotel] = await Promise.all([listAuditLogs(actor, parsed.success ? parsed.data : {}), getHotelSettings(actor)]);
  return (
    <>
      <PageHeader title="Audit log" description="Immutable record of important actions. Passwords, tokens and payment credentials are never logged." />
      <Card className="gap-0 py-0">
        <form method="get" className="grid gap-3 border-b p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]">
          <div className="grid gap-1">
            <Label htmlFor="action" className="text-xs">
              Action starts with
            </Label>
            <Input id="action" name="action" defaultValue={params.action ?? ""} placeholder="e.g. payment." />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="entityType" className="text-xs">
              Entity
            </Label>
            <NativeSelect id="entityType" name="entityType" defaultValue={params.entityType ?? ""}>
              <option value="">Any</option>
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace("_", " ")}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="from" className="text-xs">
              From
            </Label>
            <Input id="from" name="from" type="date" defaultValue={params.from ?? ""} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="to" className="text-xs">
              To
            </Label>
            <Input id="to" name="to" type="date" defaultValue={params.to ?? ""} />
          </div>
          <div className="flex items-end gap-2">
            <Button type="submit" variant="secondary">
              Filter
            </Button>
            <Button asChild variant="ghost">
              <Link href="/audit-log">Reset</Link>
            </Button>
          </div>
        </form>
        {result.rows.length === 0 ? (
          <EmptyState icon={ScrollText} title="No entries" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{formatDateTime(row.createdAt, hotel.timezone)}</TableCell>
                  <TableCell>{row.userName ?? "System"}</TableCell>
                  <TableCell className="font-mono text-xs">{row.action}</TableCell>
                  <TableCell className="text-xs">
                    {row.entityType === "reservation" && row.entityId ? (
                      <Link className="text-primary hover:underline" href={`/reservations/${row.entityId}`}>
                        reservation
                      </Link>
                    ) : (
                      row.entityType
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-xl truncate text-xs" title={summarize(row.metadata)}>
                    {summarize(row.metadata) || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pagination pathname="/audit-log" params={params} {...result} />
      </Card>
    </>
  );
}
