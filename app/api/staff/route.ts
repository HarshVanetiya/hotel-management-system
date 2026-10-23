import { apiRoute } from "@/server/api";
import { createStaff } from "@/server/services/staff";

export const POST = apiRoute(async ({ actor, body }) => ({ user: await createStaff(actor, await body()) }), {
  permission: "staff:manage",
  rateLimit: { bucket: "staff-admin", limit: 20, windowSeconds: 60 },
});
