import { apiRoute } from "@/server/api";
import { refundPayment } from "@/server/services/payments";

export const POST = apiRoute(async ({ actor, params, body }) => await refundPayment(actor, params.id, await body()), {
  permission: "payments:refund",
  rateLimit: { bucket: "refunds", limit: 20, windowSeconds: 60 },
});
