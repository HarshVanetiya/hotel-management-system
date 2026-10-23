import { apiRoute } from "@/server/api";
import { addCharge } from "@/server/services/charges";

export const POST = apiRoute(
  async ({ actor, params, body }) => ({ charge: await addCharge(actor, params.id, await body()) }),
  { permission: "charges:manage", rateLimit: { bucket: "charges", limit: 60, windowSeconds: 60 } },
);
