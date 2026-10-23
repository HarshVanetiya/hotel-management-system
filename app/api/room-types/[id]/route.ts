import { apiRoute } from "@/server/api";
import { updateRoomType } from "@/server/services/rooms";

export const PATCH = apiRoute(
  async ({ actor, params, body }) => ({ roomType: await updateRoomType(actor, params.id, await body()) }),
  { permission: "roomTypes:manage" },
);
