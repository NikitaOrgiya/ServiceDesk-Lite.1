import { auth } from "@/lib/auth/server";

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
 * This is a UX shortcut, not the authorization boundary — it does NOT
 * decide employee vs admin (that requires reading `public.profiles`) and
 * does not replace requireEmployee()/requireAdmin(), which re-verify
 * identity and role from the database on every request to those sections
 * (see src/app/app/layout.tsx / src/app/admin/layout.tsx).
 */
export default auth.middleware({ loginUrl: "/login" });

export const config = {
  matcher: ["/app/:path*", "/admin/:path*"],
};
