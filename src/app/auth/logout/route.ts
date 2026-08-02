import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth/server";
import { logger } from "@/lib/logger/logger";
import { sanitizeError } from "@/lib/logger/sanitize-error";

// Never statically prerendered: mutates session state on every request.
export const dynamic = "force-dynamic";

/**
 * POST /auth/logout — native `<form method="post" action="/auth/logout">`
 * target for the header's logout button (see
 * src/components/layout/app-header.tsx).
 *
 * A plain Route Handler for the same reason as /auth/login: a real HTTP
 * redirect response is a genuine browser navigation, so it can never
 * target a stale client-router URL the way a client-dispatched Server
 * Action POST can. A Server Action always POSTs to the router's in-memory
 * `state.canonicalUrl`
 * (node_modules/next/dist/client/components/router-reducer/reducers/server-action-reducer.js),
 * which can diverge from `window.location` after an MPA hard-navigation
 * (e.g. the redirect from /auth/complete, a Route Handler with no RSC
 * payload to seed) — when it does, the *next* Server Action POST (here,
 * logout) is sent to the wrong URL and the client throws "An unexpected
 * response was received from the server" instead of completing.
 *
 * Next.js applies an Origin-vs-Host CSRF check to Server Actions
 * automatically; a plain Route Handler that mutates session state has to
 * do the equivalent check itself.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (origin && host) {
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = "";
    }

    if (originHost !== host) {
      logger.warn({
        event: "auth:logout_failed",
        message: "Rejected logout POST with mismatched Origin/Host",
      });
      return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
    }
  }

  const { error } = await auth.signOut();

  if (error) {
    const sanitized = sanitizeError(error);
    logger.warn({
      event: "auth:logout_failed",
      message: sanitized.message,
      code: sanitized.code,
    });
  }

  return NextResponse.redirect(new URL("/login", request.url), 303);
}
