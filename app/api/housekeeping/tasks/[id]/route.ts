import { apiRoute } from "@/server/api";
import { updateTask } from "@/server/services/housekeeping";

export const PATCH = apiRoute(async ({ actor, params, body }) => ({ task: await updateTask(actor, params.id, await body()) }), {
  permission: "housekeeping:update",
});
