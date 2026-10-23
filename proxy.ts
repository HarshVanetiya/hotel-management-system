import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic redirect for unauthenticated page requests. This only checks
 * that an Auth.js session cookie is present; the authoritative checks
 * (session validity, active user, role permissions) run on the server in
 * every page, Route Handler and service.
 */
const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];
const PUBLIC_PATHS = ["/login"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  const hasSession = SESSION_COOKIES.some((name) =>
    request.cookies.getAll().some((c) => c.name === name || c.name.startsWith(`${name}.`)),
  );
  if (!hasSession) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Skip API routes (they return 401 JSON themselves), Next internals and static assets.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
