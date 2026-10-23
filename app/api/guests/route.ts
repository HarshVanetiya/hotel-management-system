import { apiRoute } from "@/server/api";
import { createGuest, searchGuests } from "@/server/services/guests";

export const GET = apiRoute(async ({ actor, searchParams }) => ({ guests: await searchGuests(actor, searchParams.q ?? "") }), {
  permission: "guests:view",
});

export const POST = apiRoute(async ({ actor, body }) => ({ guest: await createGuest(actor, await body()) }), {
  permission: "guests:manage",
});
