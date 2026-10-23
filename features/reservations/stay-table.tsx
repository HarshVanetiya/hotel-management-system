import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { HousekeepingBadge, ReservationStatusBadge } from "@/components/app/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { guestCount } from "@/lib/format";
import { formatDisplayDate } from "@/lib/utils/dates";
import type { StayRow } from "@/server/services/operations";
import { StayActions } from "./stay-actions";

/** Compact operational list of stays used on the dashboard and front desk. */
export function StayTable({
  rows,
  currency,
  today,
  methods,
  emptyTitle,
  emptyIcon,
  showActions = true,
  showDates = "both",
}: {
  rows: StayRow[];
  currency: string;
  today: string;
  methods: string[];
  emptyTitle: string;
  emptyIcon?: LucideIcon;
  showActions?: boolean;
  showDates?: "both" | "in" | "out";
}) {
  if (rows.length === 0) return <EmptyState title={emptyTitle} icon={emptyIcon} />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Room</TableHead>
          <TableHead>Guest</TableHead>
          <TableHead className="hidden md:table-cell">Stay</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="hidden lg:table-cell">Room state</TableHead>
          <TableHead className="text-right">Balance</TableHead>
          {showActions ? <TableHead className="text-right">Actions</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const overdue = r.status === "checked_in" && r.checkOutDate < today;
          return (
            <TableRow key={r.id}>
              <TableCell className="font-medium tabular-nums">{r.roomNumber}</TableCell>
              <TableCell>
                <Link href={`/reservations/${r.id}`} className="font-medium hover:underline">
                  {r.guestName}
                </Link>
                <span className="text-muted-foreground block text-xs">
                  {r.reservationNumber} · {guestCount(r.adults, r.children)}
                </span>
              </TableCell>
              <TableCell className="hidden text-sm md:table-cell">
                {showDates !== "out" ? formatDisplayDate(r.checkInDate, "dd MMM") : null}
                {showDates === "both" ? " → " : null}
                {showDates !== "in" ? (
                  <span className={overdue ? "font-medium text-rose-700" : undefined}>
                    {formatDisplayDate(r.checkOutDate, "dd MMM")}
                    {overdue ? " (overdue)" : ""}
                  </span>
                ) : null}
              </TableCell>
              <TableCell>
                <ReservationStatusBadge status={r.status} />
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                <HousekeepingBadge status={r.housekeepingStatus} />
              </TableCell>
              <TableCell className="text-right">
                <Money value={r.balance} currency={currency} emphasizeBalance />
              </TableCell>
              {showActions ? (
                <TableCell className="text-right">
                  <StayActions stay={r} today={today} currency={currency} methods={methods} />
                </TableCell>
              ) : null}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
