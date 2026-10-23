import { apiRoute } from "@/server/api";
import { createRoomType } from "@/server/services/rooms";

export const POST = apiRoute(async ({ actor, body }) => ({ roomType: await createRoomType(actor, await body()) }), {
  permission: "roomTypes:manage",
});
