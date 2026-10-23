import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { hrefWith } from "@/components/app/pagination";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ValidationError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { flatParams } from "@/lib/search-params";
import { cn } from "@/lib/utils";
import { formatDisplayDate, isISODate } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";
import { REPORT_TYPES, runReport, type ReportResult, type ReportType } from "@/server/services/reports";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Reports" };

const LABELS: Record<ReportType, string> = {
  occupancy: "Occupancy",
  revenue: "Revenue",
  reservations: "Reservations",
  cancellations: "Cancellations & no-shows",
  outstanding: "Outstanding balances",
  utilization: "Room utilization",
};

function formatCell(value: unknown, kind: string | undefined, currency: string) {
  if (value === null || value === undefined || value === "") return "—";
  if (kind === "money") return formatMoney(String(value), currency);
  if (kind === "percent") return `${value}%`;
  if (kind === "date" && typeof value === "string" && isISODate(value)) return formatDisplayDate(value);
  if (typeof value === "string" && /^(pending|confirmed|checked_in|checked_out|cancelled|no_show|in_service|maintenance|out_of_service)$/.test(value))
    return value.replace(/_/g, " ");
  return String(value);
}

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const actor = await requirePageActor("reports:view");
  const params = flatParams(await searchParams);
  const type: ReportType = REPORT_TYPES.includes(params.type as ReportType) ? (params.type as ReportType) : "occupancy";
  let report: ReportResult | null = null;
  let error: string | null = null;
  try {
    report = await runReport(actor, type, { from: params.from, to: params.to });
  } catch (e) {
    if (e instanceof ValidationError) error = e.message;
    else throw e;
  }
  const exportHref = report ? `/api/reports/${type}/export?from=${report.from}&to=${report.to}` : null;

  return (
    <>
      <PageHeader
        title="Reports"
        description="Operational and financial reports. All dates are hotel-local business dates."
        actions={
          exportHref && can(actor.role, "reports:export") ? (
            <Button asChild variant="outline">
              <a href={exportHref} download>
                <Download /> Export CSV
              </a>
            </Button>
          ) : null
        }
      />
      <nav className="mb-4 flex flex-wrap gap-1" aria-label="Report type">
        {REPORT_TYPES.map((t) => (
          <Link
            key={t}
            href={hrefWith("/reports", params, { type: t })}
            aria-current={t === type ? "page" : undefined}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm",
              t === type ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted",
            )}
          >
            {LABELS[t]}
          </Link>
        ))}
      </nav>
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="type" value={type} />
        <div className="grid gap-1">
          <Label htmlFor="from" className="text-xs">
            From
          </Label>
          <Input id="from" name="from" type="date" defaultValue={report?.from ?? params.from ?? ""} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="to" className="text-xs">
            To
          </Label>
          <Input id="to" name="to" type="date" defaultValue={report?.to ?? params.to ?? ""} />
        </div>
        <Button type="submit" variant="secondary">
          Run report
        </Button>
      </form>
      {error ? <p className="text-destructive mb-4 text-sm">{error}</p> : null}
      {report ? (
        <>
          <Card className="mb-4 gap-3">
            <CardHeader>
              <CardTitle>{report.title}</CardTitle>
              <CardDescription>{report.description}</CardDescription>
            </CardHeader>
            <dl className="grid grid-cols-2 gap-4 px-5 md:grid-cols-4">
              {report.summary.map((s) => (
                <div key={s.label}>
                  <dt className="text-muted-foreground text-xs">{s.label}</dt>
                  <dd className="text-xl font-semibold tabular-nums">{formatCell(s.value, s.kind, report!.currency)}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card className="py-0">
            {report.rows.length === 0 ? (
              <EmptyState title="No data for this period" />
            ) : (
              <div className="max-h-[60vh] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0">
                    <TableRow>
                      {report.columns.map((c) => (
                        <TableHead key={c.key} className={c.kind && c.kind !== "date" && c.kind !== "text" ? "text-right" : undefined}>
                          {c.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.rows.map((row, i) => (
                      <TableRow key={i}>
                        {report!.columns.map((c) => (
                          <TableCell
                            key={c.key}
                            className={cn(c.kind && c.kind !== "date" && c.kind !== "text" && "text-right tabular-nums", "capitalize-first")}
                          >
                            {formatCell(row[c.key], c.kind, report!.currency)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </>
      ) : null}
    </>
  );
}
