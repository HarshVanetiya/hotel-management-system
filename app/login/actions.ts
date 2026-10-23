"use server";

import { AuthError, CredentialsSignin } from "next-auth";
import { signIn } from "@/lib/auth";

export type LoginState = { error?: string };

/** Only allow same-site relative redirects after login. */
function safeNext(next: FormDataEntryValue | null): string {
  const value = typeof next === "string" ? next : "";
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirectTo: safeNext(formData.get("next")),
    });
    return {};
  } catch (err) {
    if (err instanceof CredentialsSignin) {
      return {
        error:
          err.code === "rate_limited"
            ? "Too many sign-in attempts. Please wait 15 minutes and try again."
            : "Invalid email or password.",
      };
    }
    if (err instanceof AuthError) return { error: "Unable to sign in right now. Please try again." };
    throw err; // redirect() on success
  }
}
