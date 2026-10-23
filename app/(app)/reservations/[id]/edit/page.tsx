import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { ReservationForm } from "@/features/reservations/reservation-form";
import { NotFoundError } from "@/lib/errors";
import { editableFields } from "@/lib/reservation-rules";
import { hotelToday } from "@/server/services/common";
import { getReservationDetail } from "@/server/services/reservations";
import { listRoomTypes } from "@/server/services/rooms";
import { getHotelSettings } from "@/server/services/settings";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Edit reservation" };

export default async function EditReservationPage({ params }: PageProps<"/reservations/[id]/edit">) {
  const actor = await requirePageActor("reservations:manage");
  const { id } = await params;
  const detail = await getReservationDetail(actor, id).catch((e) => {
    if (e instanceof NotFoundError || (e as Error).name === "ValidationError") notFound();
    throw e;
  });
  const r = detail.reservation;
  if (editableFields(r.status) === "none") redirect(`/reservations/${id}`);
  const [hotel, roomTypes] = await Promise.all([getHotelSettings(actor), listRoomTypes(actor)]);
  return (
    <>
      <PageHeader
        title={`Edit ${r.reservationNumber}`}
        description="Availability, capacity and totals are re-checked on the server when you save."
      />
      <ReservationForm
        mode="edit"
        currency={hotel.currency}
        today={hotelToday(hotel)}
        roomTypes={roomTypes}
        methods={hotel.enabledPaymentMethods}
        canTakePayment={false}
        reservation={{
          id: r.id,
          reservationNumber: r.reservationNumber,
          status: r.status,
          guestName: `${r.guest.firstName} ${r.guest.lastName}`,
          roomId: r.roomId,
          roomNumber: r.room.roomNumber,
          roomTypeName: r.room.roomType.name,
          checkInDate: r.checkInDate,
          checkOutDate: r.checkOutDate,
          adults: r.adults,
          children: r.children,
          nightlyRate: r.nightlyRate,
          discountAmount: r.discountAmount,
          specialRequests: r.specialRequests,
        }}
      />
    </>
  );
}
