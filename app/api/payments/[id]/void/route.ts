import { apiRoute } from "@/server/api";
import { voidPayment } from "@/server/services/payments";

export const POST = apiRoute(async ({ actor, params, body }) => ({ payment: await voidPayment(actor, params.id, await body()) }), {
  permission: "payments:void",
});
