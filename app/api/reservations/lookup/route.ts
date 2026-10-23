import { apiRoute } from "@/server/api";
import { findReservationsForPayment } from "@/server/services/reservations";

export const GET = apiRoute(
  async ({ actor, searchParams }) => ({ results: await findReservationsForPayment(actor, searchParams.q ?? "") }),
  { permission: "payments:view" },
);
