import { apiRoute } from "@/server/api";
import { archiveRoom } from "@/server/services/rooms";

export const POST = apiRoute(async ({ actor, params }) => ({ room: await archiveRoom(actor, params.id) }), {
  permission: "rooms:manage",
});
