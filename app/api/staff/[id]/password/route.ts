import { apiRoute } from "@/server/api";
import { resetStaffPassword } from "@/server/services/staff";

export const POST = apiRoute(
  async ({ actor, params, body }) => {
    await resetStaffPassword(actor, params.id, await body());
    return { ok: true };
  },
  { permission: "staff:manage", rateLimit: { bucket: "staff-admin", limit: 20, windowSeconds: 60 } },
);
