import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth/server";
import { sanitizeNextPath } from "@/features/auth/redirect";

const neonAuthMiddleware = auth.middleware({ loginUrl: "/login" });

// Next.js's own signal that a request is a Server Action invocation (either
// a directly-invoked action reference, as used by e.g.
// src/features/tickets/components/new-ticket-form.tsx, or a
// progressively-enhanced native <form action={...}> submission) rather than
// an ordinary page navigation — see
// node_modules/next/dist/client/components/app-router-headers.js's
// `ACTION_HEADER` constant and
// node_modules/next/dist/server/lib/server-action-request-meta.js's
// `getServerActionRequestMetadata()`, which is what Next.js's own
// action-handler uses to route a request to the action runtime. Confirmed
// by inspecting a real request from NewTicketForm in this codebase: it is a
// POST with this exact header present, body-encoded as
// `multipart/form-data` when the argument is a FormData object.
const NEXT_ACTION_HEADER = "next-action";

function isServerActionRequest(request: NextRequest): boolean {
  return request.method === "POST" && request.headers.has(NEXT_ACTION_HEADER);
}

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
 *
 * Confirmed Server Action POST requests (see isServerActionRequest above)
 * skip Neon Auth's own middleware entirely here. This is NOT a general POST
 * bypass and does NOT weaken authorization: it exists because Neon Auth's
 * middleware performs its own upstream session round trip, which was
 * observed (see the Server Action-vs-GET investigation this fix addresses)
 * to intermittently redirect an otherwise-valid, cookie-bearing Server
 * Action POST to /login even though the exact same session succeeds for a
 * GET moments earlier — breaking the Next.js action runtime on the client
 * (surfacing as a generic error overlay) before the action itself ever
 * runs. It is safe only because every business Server Action under
 * /app/** and /admin/** independently calls requireEmployee()/
 * requireAdmin() (see src/features/auth/server/require-employee.ts /
 * require-admin.ts) before reading or mutating any data — this bypass
 * changes only which layer performs that check for this one request shape,
 * never whether it is performed.
 */
export default async function proxy(request: NextRequest) {
  if (isServerActionRequest(request)) {
    return NextResponse.next();
  }

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
