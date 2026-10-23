import { apiRoute } from "@/server/api";
import { createRoom } from "@/server/services/rooms";

export const POST = apiRoute(async ({ actor, body }) => ({ room: await createRoom(actor, await body()) }), {
  permission: "rooms:manage",
});
