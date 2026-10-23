import { apiRoute } from "@/server/api";
import { findAvailableRooms } from "@/server/services/availability";

export const GET = apiRoute(async ({ actor, searchParams }) => ({ rooms: await findAvailableRooms(actor, searchParams) }), {
  permission: "reservations:view",
});
