import { apiRoute } from "@/server/api";
import { voidCharge } from "@/server/services/charges";

export const POST = apiRoute(async ({ actor, params, body }) => ({ charge: await voidCharge(actor, params.id, await body()) }), {
  permission: "charges:void",
});
