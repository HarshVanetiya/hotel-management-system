import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { AppError, ForbiddenError, UnauthenticatedError, ValidationError } from "@/lib/errors";
import { can, type Permission } from "@/lib/permissions";
import type { Actor } from "./actor";
import { consumeRateLimit } from "./rate-limit";
import { getActor } from "./session";

type RouteContext = { params: Promise<Record<string, string | string[] | undefined>> };

type Handler = (args: {
  req: NextRequest;
  actor: Actor;
  params: Record<string, string>;
  body: () => Promise<unknown>;
  searchParams: Record<string, string>;
}) => Promise<unknown>;

type Options = {
  /** Coarse gate; services perform their own fine-grained checks too. */
  permission?: Permission;
  /** Per-user fixed-window limit for sensitive endpoints. */
  rateLimit?: { bucket: string; limit: number; windowSeconds: number };
};

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Rejects cross-site browser requests to mutating endpoints (defence in depth on top of SameSite cookies). */
function assertSameOrigin(req: NextRequest) {
  if (!MUTATING.has(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost: string | null = null;
  try {
    originHost = new URL(origin).host;
  } catch {
    originHost = null;
  }
  if (!host || originHost !== host) throw new ForbiddenError("Cross-origin request rejected.");
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json(
      { error: { message: err.message, code: err.code, details: err.details ?? null } },
      { status: err.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  const reference = crypto.randomUUID();
  // Full error stays in server logs; the client only gets a reference id.
  console.error(`[api] unhandled error ref=${reference}`, err);
  return NextResponse.json(
    { error: { message: "Something went wrong. Please try again.", code: "internal_error", reference } },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}

/** Wraps a Route Handler with authentication, authorisation, origin checks and error mapping. */
export function apiRoute(handler: Handler, options: Options = {}) {
  return async (req: NextRequest, ctx: RouteContext): Promise<Response> => {
    try {
      assertSameOrigin(req);
      const actor = await getActor();
      if (!actor) throw new UnauthenticatedError();
      if (options.permission && !can(actor.role, options.permission)) throw new ForbiddenError();
      if (options.rateLimit) {
        const { bucket, limit, windowSeconds } = options.rateLimit;
        await consumeRateLimit(`${bucket}:${actor.id}`, limit, windowSeconds);
      }
      const rawParams = (await ctx.params) ?? {};
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(rawParams)) if (typeof v === "string") params[k] = v;

      const result = await handler({
        req,
        actor,
        params,
        searchParams: Object.fromEntries(req.nextUrl.searchParams.entries()),
        body: async () => {
          const type = req.headers.get("content-type") ?? "";
          if (!type.includes("application/json")) throw new ValidationError("Expected a JSON request body.");
          try {
            return await req.json();
          } catch {
            throw new ValidationError("Malformed JSON body.");
          }
        },
      });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
      return errorResponse(err);
    }
  };
}
