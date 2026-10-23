import type { ISODate } from "@/lib/utils/dates";

export type ReservationStatus =
  | "pending"
  | "confirmed"
  | "checked_in"
  | "checked_out"
  | "cancelled"
  | "no_show";

/**
 * Inventory rules — which reservations hold a room:
 *  - pending     BLOCKS  (tentative hold; must be confirmed or cancelled)
 *  - confirmed   BLOCKS
 *  - checked_in  BLOCKS  (guest is in the room)
 *  - checked_out RELEASES (guest has left; the room needs cleaning but can be sold)
 *  - cancelled   RELEASES
 *  - no_show     RELEASES
 * The same list is enforced by the reservations_no_overlap exclusion constraint.
 */
export const BLOCKING_STATUSES = ["pending", "confirmed", "checked_in"] as const satisfies readonly ReservationStatus[];

export function blocksInventory(status: ReservationStatus): boolean {
  return (BLOCKING_STATUSES as readonly string[]).includes(status);
}

export const STATUS_TRANSITIONS: Record<ReservationStatus, readonly ReservationStatus[]> = {
  pending: ["confirmed", "checked_in", "cancelled", "no_show"],
  confirmed: ["checked_in", "cancelled", "no_show"],
  checked_in: ["checked_out"],
  checked_out: [],
  cancelled: [],
  no_show: [],
};

export function canTransition(from: ReservationStatus, to: ReservationStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

export const STATUS_LABELS: Record<ReservationStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  checked_in: "Checked in",
  checked_out: "Checked out",
  cancelled: "Cancelled",
  no_show: "No show",
};

/** Returns a reason string when check-in is not allowed on `today`, otherwise null. */
export function checkInDateProblem(
  res: { checkInDate: ISODate; checkOutDate: ISODate },
  today: ISODate,
): string | null {
  if (today < res.checkInDate) {
    return `Arrival is scheduled for ${res.checkInDate}. Change the reservation dates to check in early.`;
  }
  if (today >= res.checkOutDate) {
    return "The reservation's stay dates have already passed. Mark it as a no-show or amend the dates.";
  }
  return null;
}

/** A no-show can be recorded on or after the arrival date. */
export function noShowDateProblem(res: { checkInDate: ISODate }, today: ISODate): string | null {
  return today < res.checkInDate ? "A no-show can only be recorded on or after the arrival date." : null;
}

/** Fields a reservation may change in each status. */
export function editableFields(status: ReservationStatus): "all" | "in_house" | "none" {
  if (status === "pending" || status === "confirmed") return "all";
  if (status === "checked_in") return "in_house";
  return "none";
}
