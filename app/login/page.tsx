import type { Metadata } from "next";
import { Hotel } from "lucide-react";
import { redirect } from "next/navigation";
import { homePathForRole } from "@/lib/permissions";
import { getActor } from "@/server/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const actor = await getActor();
  if (actor) redirect(homePathForRole(actor.role));
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-xl">
            <Hotel className="size-6" aria-hidden />
          </span>
          <h1 className="text-lg font-semibold">Hotel Operations</h1>
          <p className="text-muted-foreground text-sm">Sign in with your staff account</p>
        </div>
        <div className="bg-card rounded-xl border p-6 shadow-sm">
          <LoginForm next={next} />
        </div>
        <p className="text-muted-foreground mt-4 text-center text-xs">
          Accounts are created by an administrator. Contact your manager if you cannot sign in.
        </p>
      </div>
    </div>
  );
}
