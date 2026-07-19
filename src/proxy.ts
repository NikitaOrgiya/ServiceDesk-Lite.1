import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";
import { sanitizeNextPath } from "@/features/auth/redirect";

const PROTECTED_PREFIXES = ["/app", "/admin"];

/**
 * Runs ahead of every non-static request (see `matcher` below).
 *
 * Responsibilities, and ONLY these:
 *   1. Refresh Supabase auth cookies so a still-valid session doesn't
 *      silently expire between requests.
 *   2. Cheaply redirect a visitor with no session away from `/app`/`/admin`
 *      to `/login` — a fast, JWT-only check (see updateSession), no
 *      `public.profiles` query.
 *
 * It deliberately does NOT decide role-based access (employee vs admin) —
 * that requires reading `public.profiles` and is re-checked in
 * src/app/app/layout.tsx and src/app/admin/layout.tsx via
 * requireEmployee()/requireAdmin() on every request to those sections.
 * Proxy redirects are a UX shortcut, not the authorization boundary.
 */
export async function proxy(request: NextRequest) {
  const { response, userId } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (isProtected && !userId) {
    const loginUrl = new URL("/login", request.url);
    const next = sanitizeNextPath(pathname);
    if (next) {
      loginUrl.searchParams.set("next", next);
    }
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)",
  ],
};
