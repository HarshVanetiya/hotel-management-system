import { STATUS_LABELS, type ReservationStatus } from "@/lib/reservation-rules";

export { STATUS_LABELS as RESERVATION_STATUS_LABELS };
export type { ReservationStatus };

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  upi: "UPI",
  bank_transfer: "Bank transfer",
  other: "Other",
};

export const HOUSEKEEPING_LABELS: Record<string, string> = {
  dirty: "Dirty",
  cleaning: "Cleaning",
  clean: "Clean",
  inspected: "Inspected",
};

export const OPERATIONAL_LABELS: Record<string, string> = {
  in_service: "In service",
  maintenance: "Maintenance",
  out_of_service: "Out of service",
};

export const TASK_TYPE_LABELS: Record<string, string> = {
  checkout_clean: "Check-out clean",
  stayover_clean: "Stay-over clean",
  deep_clean: "Deep clean",
  inspection: "Inspection",
  other: "Other",
};

export const TASK_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const ID_TYPE_LABELS: Record<string, string> = {
  passport: "Passport",
  national_id: "National ID",
  driving_license: "Driving licence",
  other: "Other",
};

export function guestCount(adults: number, children: number): string {
  const a = `${adults} adult${adults === 1 ? "" : "s"}`;
  return children > 0 ? `${a}, ${children} child${children === 1 ? "" : "ren"}` : a;
}
