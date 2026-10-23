import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { ReservationForm } from "@/features/reservations/reservation-form";
import { can } from "@/lib/permissions";
import { flatParams } from "@/lib/search-params";
import { isISODate } from "@/lib/utils/dates";
import { hotelToday } from "@/server/services/common";
import { listRoomTypes } from "@/server/services/rooms";
import { getHotelSettings } from "@/server/services/settings";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "New reservation" };

export default async function NewReservationPage({ searchParams }: PageProps<"/reservations/new">) {
  const actor = await requirePageActor("reservations:manage");
  const sp = flatParams(await searchParams);
  const [hotel, roomTypes] = await Promise.all([getHotelSettings(actor), listRoomTypes(actor)]);
  const uuid = /^[0-9a-f-]{36}$/i;
  return (
    <>
      <PageHeader title="New reservation" description="Availability and pricing are verified on the server when you save." />
      <ReservationForm
        mode="create"
        currency={hotel.currency}
        today={hotelToday(hotel)}
        roomTypes={roomTypes}
        methods={hotel.enabledPaymentMethods}
        canTakePayment={can(actor.role, "payments:record")}
        prefill={{
          roomId: sp.roomId && uuid.test(sp.roomId) ? sp.roomId : undefined,
          checkInDate: sp.checkIn && isISODate(sp.checkIn) ? sp.checkIn : undefined,
          checkOutDate: sp.checkOut && isISODate(sp.checkOut) ? sp.checkOut : undefined,
          guestId: sp.guestId && uuid.test(sp.guestId) ? sp.guestId : undefined,
          guestName: sp.guestName?.slice(0, 100),
        }}
      />
    </>
  );
}
