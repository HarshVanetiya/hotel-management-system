import { apiRoute } from "@/server/api";
import { setRoomOperationalStatus } from "@/server/services/rooms";

export const POST = apiRoute(async ({ actor, params, body }) => await setRoomOperationalStatus(actor, params.id, await body()), {
  permission: "rooms:setStatus",
});
