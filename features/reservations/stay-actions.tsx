"use client";

import { Ban, LogIn, LogOut, Wallet } from "lucide-react";
import { ConfirmAction } from "@/components/app/confirm-action";
import { Button } from "@/components/ui/button";
import { formatMoney, toCents } from "@/lib/utils/money";
import { CheckOutDialog } from "./check-out-dialog";
import { RecordPaymentDialog } from "./record-payment-dialog";

export type StayActionRow = {
  id: string;
  reservationNumber: string;
  status: string;
  guestName: string;
  roomNumber: string;
  balance: string;
  checkInDate: string;
  housekeepingStatus: string;
};

/** Front-desk actions available for a stay in its current state. */
export function StayActions({
  stay,
  today,
  currency,
  methods,
  show = ["checkin", "checkout", "pay", "noshow"],
}: {
  stay: StayActionRow;
  today: string;
  currency: string;
  methods: string[];
  show?: ("checkin" | "checkout" | "pay" | "noshow")[];
}) {
  const arriving = stay.status === "pending" || stay.status === "confirmed";
  const roomReady = stay.housekeepingStatus === "clean" || stay.housekeepingStatus === "inspected";
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {show.includes("pay") && toCents(stay.balance) > 0 && stay.status !== "cancelled" ? (
        <RecordPaymentDialog
          trigger={
            <Button size="sm" variant="outline">
              <Wallet /> Pay
            </Button>
          }
          reservation={{ id: stay.id, reservationNumber: stay.reservationNumber, balance: stay.balance, guestName: stay.guestName }}
          currency={currency}
          methods={methods}
        />
      ) : null}
      {show.includes("checkin") && arriving && stay.checkInDate <= today ? (
        <ConfirmAction
          trigger={
            <Button size="sm" title={roomReady ? undefined : `Room is ${stay.housekeepingStatus}`}>
              <LogIn /> Check in
            </Button>
          }
          title={`Check in ${stay.guestName}?`}
          description={
            <div className="space-y-1">
              <p>
                Room {stay.roomNumber} · {stay.reservationNumber}
              </p>
              {!roomReady ? (
                <p className="text-amber-700">Room is currently {stay.housekeepingStatus}; check-in will be refused until it is clean.</p>
              ) : null}
              {toCents(stay.balance) > 0 ? (
                <p>Outstanding balance: {formatMoney(stay.balance, currency)} (can be collected later).</p>
              ) : null}
            </div>
          }
          confirmLabel="Check in"
          url={`/api/reservations/${stay.id}/check-in`}
          successMessage={`${stay.guestName} checked in to room ${stay.roomNumber}.`}
        />
      ) : null}
      {show.includes("noshow") && arriving && stay.checkInDate <= today ? (
        <ConfirmAction
          trigger={
            <Button size="sm" variant="ghost" title="Mark as no-show">
              <Ban /> No-show
            </Button>
          }
          title="Mark as no-show?"
          description={`${stay.reservationNumber} for ${stay.guestName} will be closed and room ${stay.roomNumber} released. This cannot be undone.`}
          confirmLabel="Mark no-show"
          destructive
          url={`/api/reservations/${stay.id}/no-show`}
          successMessage="Reservation marked as no-show."
        />
      ) : null}
      {show.includes("checkout") && stay.status === "checked_in" ? (
        <CheckOutDialog
          reservationId={stay.id}
          guestName={stay.guestName}
          roomNumber={stay.roomNumber}
          currency={currency}
          methods={methods}
          trigger={
            <Button size="sm" variant="secondary">
              <LogOut /> Check out
            </Button>
          }
        />
      ) : null}
    </div>
  );
}
