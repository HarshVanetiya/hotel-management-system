import { cn } from "@/lib/utils";
import {
  HOUSEKEEPING_LABELS,
  OPERATIONAL_LABELS,
  PRIORITY_LABELS,
  RESERVATION_STATUS_LABELS,
  TASK_STATUS_LABELS,
  type ReservationStatus,
} from "@/lib/format";

const base = "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap";
const dot = "size-1.5 rounded-full";

const RESERVATION_STYLES: Record<ReservationStatus, { box: string; dot: string }> = {
  pending: { box: "border-amber-200 bg-amber-50 text-amber-800", dot: "bg-amber-500" },
  confirmed: { box: "border-blue-200 bg-blue-50 text-blue-800", dot: "bg-blue-500" },
  checked_in: { box: "border-emerald-200 bg-emerald-50 text-emerald-800", dot: "bg-emerald-500" },
  checked_out: { box: "border-slate-200 bg-slate-50 text-slate-700", dot: "bg-slate-400" },
  cancelled: { box: "border-rose-200 bg-rose-50 text-rose-700", dot: "bg-rose-500" },
  no_show: { box: "border-orange-200 bg-orange-50 text-orange-800", dot: "bg-orange-500" },
};

export function ReservationStatusBadge({ status, className }: { status: ReservationStatus; className?: string }) {
  const s = RESERVATION_STYLES[status];
  return (
    <span className={cn(base, s.box, className)}>
      <span className={cn(dot, s.dot)} aria-hidden />
      {RESERVATION_STATUS_LABELS[status]}
    </span>
  );
}

/** Derived room state shown to staff: maintenance outranks occupancy, which outranks availability. */
export type RoomState = "available" | "occupied" | "maintenance" | "out_of_service";

export function roomState(room: { operationalStatus: string; occupied: boolean }): RoomState {
  if (room.occupied) return "occupied";
  if (room.operationalStatus === "maintenance") return "maintenance";
  if (room.operationalStatus === "out_of_service") return "out_of_service";
  return "available";
}

export const ROOM_STATE_STYLES: Record<RoomState, { label: string; box: string; dot: string; tile: string }> = {
  available: {
    label: "Available",
    box: "border-emerald-200 bg-emerald-50 text-emerald-800",
    dot: "bg-status-available",
    tile: "border-l-status-available",
  },
  occupied: {
    label: "Occupied",
    box: "border-blue-200 bg-blue-50 text-blue-800",
    dot: "bg-status-occupied",
    tile: "border-l-status-occupied",
  },
  maintenance: {
    label: "Maintenance",
    box: "border-rose-200 bg-rose-50 text-rose-700",
    dot: "bg-status-maintenance",
    tile: "border-l-status-maintenance",
  },
  out_of_service: {
    label: "Out of service",
    box: "border-slate-300 bg-slate-100 text-slate-700",
    dot: "bg-status-inactive",
    tile: "border-l-status-inactive",
  },
};

export function RoomStateBadge({ state }: { state: RoomState }) {
  const s = ROOM_STATE_STYLES[state];
  return (
    <span className={cn(base, s.box)}>
      <span className={cn(dot, s.dot)} aria-hidden />
      {s.label}
    </span>
  );
}

export function OperationalBadge({ status }: { status: string }) {
  const state: RoomState = status === "in_service" ? "available" : (status as RoomState);
  const s = ROOM_STATE_STYLES[state];
  return (
    <span className={cn(base, s.box)}>
      <span className={cn(dot, s.dot)} aria-hidden />
      {OPERATIONAL_LABELS[status] ?? status}
    </span>
  );
}

const HK_STYLES: Record<string, { box: string; dot: string }> = {
  dirty: { box: "border-amber-200 bg-amber-50 text-amber-800", dot: "bg-status-dirty" },
  cleaning: { box: "border-sky-200 bg-sky-50 text-sky-800", dot: "bg-sky-500" },
  clean: { box: "border-emerald-200 bg-emerald-50 text-emerald-800", dot: "bg-emerald-500" },
  inspected: { box: "border-teal-200 bg-teal-50 text-teal-800", dot: "bg-teal-600" },
};

export function HousekeepingBadge({ status }: { status: string }) {
  const s = HK_STYLES[status] ?? HK_STYLES.dirty;
  return (
    <span className={cn(base, s.box)}>
      <span className={cn(dot, s.dot)} aria-hidden />
      {HOUSEKEEPING_LABELS[status] ?? status}
    </span>
  );
}

export function TaskStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "border-amber-200 bg-amber-50 text-amber-800",
    in_progress: "border-sky-200 bg-sky-50 text-sky-800",
    completed: "border-emerald-200 bg-emerald-50 text-emerald-800",
    cancelled: "border-slate-200 bg-slate-50 text-slate-600",
  };
  return <span className={cn(base, styles[status])}>{TASK_STATUS_LABELS[status] ?? status}</span>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, string> = {
    low: "border-slate-200 bg-white text-slate-600",
    normal: "border-slate-200 bg-slate-50 text-slate-700",
    high: "border-orange-200 bg-orange-50 text-orange-800",
    urgent: "border-rose-300 bg-rose-50 text-rose-700",
  };
  return <span className={cn(base, styles[priority])}>{PRIORITY_LABELS[priority] ?? priority}</span>;
}

export function PaymentStatusBadge({ status, kind }: { status: string; kind: string }) {
  if (status === "voided") return <span className={cn(base, "border-slate-200 bg-slate-100 text-slate-500 line-through")}>Voided</span>;
  if (kind === "refund") return <span className={cn(base, "border-violet-200 bg-violet-50 text-violet-800")}>Refund</span>;
  return <span className={cn(base, "border-emerald-200 bg-emerald-50 text-emerald-800")}>Payment</span>;
}
