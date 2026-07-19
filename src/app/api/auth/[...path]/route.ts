import { auth } from "@/lib/auth/server";

/**
 * Proxies auth requests (sign-in, sign-out, session refresh, password
 * reset, JWT issuance, ...) to Neon Auth. Replaces the Supabase
 * `/auth/callback` PKCE-exchange Route Handler — Neon Auth's own handler
 * owns the entire `/api/auth/*` surface instead of this app implementing
 * one callback route by hand.
 */
export const { GET, POST, PUT, DELETE, PATCH } = auth.handler();
