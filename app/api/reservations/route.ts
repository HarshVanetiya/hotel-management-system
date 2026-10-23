import { apiRoute } from "@/server/api";
import { createReservation } from "@/server/services/reservations";

export const POST = apiRoute(async ({ actor, body }) => ({ reservation: await createReservation(actor, await body()) }), {
  permission: "reservations:manage",
  rateLimit: { bucket: "reservation-write", limit: 60, windowSeconds: 60 },
});
