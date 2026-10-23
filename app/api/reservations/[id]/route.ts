import { apiRoute } from "@/server/api";
import { getReservationDetail, updateReservation } from "@/server/services/reservations";

/** Folio summary used by the check-out dialog (balance computed on the server). */
export const GET = apiRoute(
  async ({ actor, params }) => {
    const detail = await getReservationDetail(actor, params.id);
    return {
      reservationNumber: detail.reservation.reservationNumber,
      status: detail.reservation.status,
      totalAmount: detail.reservation.totalAmount,
      balance: detail.balance,
      charges: detail.charges.filter((c) => c.status === "active"),
    };
  },
  { permission: "reservations:view" },
);

export const PATCH = apiRoute(
  async ({ actor, params, body }) => ({ reservation: await updateReservation(actor, params.id, await body()) }),
  { permission: "reservations:manage" },
);
