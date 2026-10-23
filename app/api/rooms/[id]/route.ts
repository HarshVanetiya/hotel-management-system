import { apiRoute } from "@/server/api";
import { updateRoom } from "@/server/services/rooms";

export const PATCH = apiRoute(async ({ actor, params, body }) => ({ room: await updateRoom(actor, params.id, await body()) }), {
  permission: "rooms:manage",
});
