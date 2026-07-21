import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth/server";
import { sanitizeNextPath } from "@/features/auth/redirect";

const neonAuthMiddleware = auth.middleware({ loginUrl: "/login" });

/**
 * Runs ahead of every request under /app/** and /admin/** (see `matcher`
 * below). Neon Auth's own middleware refreshes/validates the session
 * cookie and redirects an anonymous visitor to `/login` — this replaces
 * the Supabase-era manual cookie-refresh logic in
 * src/lib/supabase/proxy.ts, which Neon Auth handles internally.
 *
 * The matcher is deliberately narrow (only the two protected sections)
 * rather than a broad catch-all: unlike the Supabase-era proxy, which
 * inspected every request and only *redirected* the protected prefixes,
 * Neon Auth's middleware treats every path it is invoked on as requiring a
 * session — so public routes (`/`, `/login`, `/forgot-password`, ...) must
 * never be matched here at all.
 *
 * Unlike the Supabase-era proxy, Neon Auth's own `auth.middleware()` does
 * not append a `?next=` to its redirect (confirmed by actually running
 * e2e/smoke.spec.ts against a real dev server in this migration — see
 * docs/migration/supabase-to-neon.md). This wrapper restores that behavior
 * by rewriting the redirect's Location when it points at `/login`, so a
 * signed-in user still lands back where they were trying to go (see
 * redirectByRole()/resolveRedirectTarget() in src/features/auth/redirect.ts).
 *
 * This is a UX shortcut, not the authorization boundary — it does NOT
 * decide employee vs admin (that requires reading `public.profiles`) and
 * does not replace requireEmployee()/requireAdmin(), which re-verify
 * identity and role from the database on every request to those sections
 * (see src/app/app/layout.tsx / src/app/admin/layout.tsx).
 */
export default async function proxy(request: NextRequest) {
  const response = await neonAuthMiddleware(request);

  const location = response.headers.get("location");
  if (!location) {
    return response;
  }

  const redirectUrl = new URL(location, request.url);
  if (redirectUrl.pathname !== "/login") {
    return response;
  }

  const next = sanitizeNextPath(request.nextUrl.pathname);
  if (next) {
    redirectUrl.searchParams.set("next", next);
  }

  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: ["/app/:path*", "/admin/:path*"],
};
