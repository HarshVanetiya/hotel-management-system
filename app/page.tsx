import { redirect } from "next/navigation";
import { homePathForRole } from "@/lib/permissions";
import { getActor } from "@/server/session";

export default async function Home() {
  const actor = await getActor();
  redirect(actor ? homePathForRole(actor.role) : "/login");
}
