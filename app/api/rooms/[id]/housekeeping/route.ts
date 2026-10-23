import { apiRoute } from "@/server/api";
import { setRoomHousekeepingStatus } from "@/server/services/housekeeping";

export const POST = apiRoute(
  async ({ actor, params, body }) => ({ room: await setRoomHousekeepingStatus(actor, params.id, await body()) }),
  { permission: "housekeeping:update" },
);
