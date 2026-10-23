import "server-only";
import { eq, sql } from "drizzle-orm";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { users } from "@/db/schema";
import { db } from "@/lib/db";
import { RateLimitError } from "@/lib/errors";
import { DUMMY_PASSWORD_HASH, verifyPassword } from "@/lib/password";
import type { Role } from "@/lib/permissions";
import { loginSchema } from "@/lib/validations/staff";
import { writeAudit } from "@/server/audit";
import { consumeRateLimit, resetRateLimit } from "@/server/rate-limit";

class InvalidCredentials extends CredentialsSignin {
  code = "invalid_credentials";
}
class TooManyAttempts extends CredentialsSignin {
  code = "rate_limited";
}

const LOGIN_WINDOW_SECONDS = 15 * 60;

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return (forwarded?.split(",")[0] ?? request.headers.get("x-real-ip") ?? "unknown").trim().slice(0, 64);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Credentials sign-in requires JWT sessions. The JWT only carries the user id
  // and a session version; role and active status are re-read from the
  // database on every request (see server/session.ts).
  session: { strategy: "jwt", maxAge: 12 * 60 * 60, updateAge: 15 * 60 },
  pages: { signIn: "/login" },
  trustHost: process.env.AUTH_TRUST_HOST === "true" || process.env.VERCEL === "1",
  providers: [
    Credentials({
      credentials: { email: { type: "email" }, password: { type: "password" } },
      async authorize(raw, request) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) throw new InvalidCredentials();
        const { email, password } = parsed.data;

        try {
          await consumeRateLimit(`login:ip:${clientIp(request)}`, 30, LOGIN_WINDOW_SECONDS);
          await consumeRateLimit(`login:email:${email}`, 5, LOGIN_WINDOW_SECONDS);
        } catch (err) {
          if (err instanceof RateLimitError) throw new TooManyAttempts();
          throw err;
        }

        const user = await db.query.users.findFirst({ where: eq(sql`lower(${users.email})`, email) });
        // Always run bcrypt so response time does not reveal whether the email exists.
        const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
        if (!user || !valid || !user.active) {
          if (user) {
            await writeAudit(db, { id: user.id, hotelId: user.hotelId }, {
              action: "auth.login_failed",
              entityType: "user",
              entityId: user.id,
              metadata: { reason: user.active ? "bad_password" : "inactive" },
            });
          }
          throw new InvalidCredentials();
        }

        await resetRateLimit(`login:email:${email}`);
        await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
        await writeAudit(db, { id: user.id, hotelId: user.hotelId }, {
          action: "auth.login",
          entityType: "user",
          entityId: user.id,
        });
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id!;
        token.role = user.role;
        token.sv = user.sessionVersion;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.uid;
      session.user.role = token.role;
      session.user.sessionVersion = token.sv;
      return session;
    },
  },
});

export type SessionUserRole = Role;
