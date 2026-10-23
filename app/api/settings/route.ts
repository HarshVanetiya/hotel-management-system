import { apiRoute } from "@/server/api";
import { updateHotelSettings } from "@/server/services/settings";

export const PATCH = apiRoute(async ({ actor, body }) => ({ hotel: await updateHotelSettings(actor, await body()) }), {
  permission: "settings:manage",
});
