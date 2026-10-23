import { apiRoute } from "@/server/api";
import { recordPayment } from "@/server/services/payments";

export const POST = apiRoute(async ({ actor, body }) => await recordPayment(actor, await body()), {
  permission: "payments:record",
  rateLimit: { bucket: "payments", limit: 30, windowSeconds: 60 },
});
