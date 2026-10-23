import type { DefaultSession } from "next-auth";
import type { Role } from "@/lib/permissions";

declare module "next-auth" {
  interface User {
    role: Role;
    sessionVersion: number;
  }
  interface Session {
    user: {
      id: string;
      role: Role;
      sessionVersion: number;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    uid: string;
    role: Role;
    sv: number;
  }
}
