import { NotFoundError } from "@/lib/errors";
import { apiRoute } from "@/server/api";
import {
  cancelReservation,
  checkIn,
  checkOut,
  confirmReservation,
  markNoShow,
} from "@/server/services/reservations";

/** Lifecycle transitions: confirm, cancel, check-in, check-out, no-show. */
export const POST = apiRoute(async ({ actor, params, req }) => {
  const payload = req.headers.get("content-type")?.includes("application/json") ? await req.json().catch(() => ({})) : {};
  switch (params.action) {
    case "confirm":
      return { reservation: await confirmReservation(actor, params.id) };
    case "cancel":
      return await cancelReservation(actor, params.id, payload);
    case "check-in":
      return { reservation: await checkIn(actor, params.id) };
    case "check-out":
      return await checkOut(actor, params.id, payload);
    case "no-show":
      return { reservation: await markNoShow(actor, params.id) };
    default:
      throw new NotFoundError("Action");
  }
});
