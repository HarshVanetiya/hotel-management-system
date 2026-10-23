import { apiRoute } from "@/server/api";
import { createTask } from "@/server/services/housekeeping";

export const POST = apiRoute(async ({ actor, body }) => ({ task: await createTask(actor, await body()) }), {
  permission: "housekeeping:manage",
});
