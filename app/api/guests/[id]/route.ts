import { apiRoute } from "@/server/api";
import { updateGuest } from "@/server/services/guests";

export const PATCH = apiRoute(async ({ actor, params, body }) => ({ guest: await updateGuest(actor, params.id, await body()) }), {
  permission: "guests:manage",
});
