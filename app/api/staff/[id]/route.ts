import { apiRoute } from "@/server/api";
import { updateStaff } from "@/server/services/staff";

export const PATCH = apiRoute(async ({ actor, params, body }) => ({ user: await updateStaff(actor, params.id, await body()) }), {
  permission: "staff:manage",
});
