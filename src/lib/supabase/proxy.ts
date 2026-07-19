import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { clientEnv } from "@/lib/env/client";

export type ProxySessionResult = {
  response: NextResponse;
  userId: string | null;
};

/**
 * Refreshes Supabase auth cookies for the current request/response pair and
 * returns a cheaply-verified user id (via `getClaims()`, not a raw cookie
 * read). Called from src/proxy.ts on every non-static request.
 *
 * This is a fast pre-check for redirecting anonymous visitors away from
 * `/app`/`/admin` — it deliberately does not query `public.profiles` (no
 * role, no `is_active`). The authoritative check happens again in
 * src/app/app/layout.tsx and src/app/admin/layout.tsx via
 * requireEmployee()/requireAdmin(), which do read the profile.
 *
 * Uses only the public URL/anon key (never the service role) — proxy code
 * runs ahead of every request and must not be able to bypass RLS.
 */
export async function updateSession(request: NextRequest): Promise<ProxySessionResult> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          response = NextResponse.next({ request });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data, error } = await supabase.auth.getClaims();

  if (error) {
    return { response, userId: null };
  }

  const sub = data?.claims?.sub;
  return { response, userId: typeof sub === "string" && sub.length > 0 ? sub : null };
}
