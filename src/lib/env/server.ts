import "server-only";
import { z } from "zod";

import { clientEnv } from "@/lib/env/client";

/**
 * Server-only variables. `SUPABASE_SERVICE_ROLE_KEY` is intentionally optional
 * here so that a production build does not require a real service-role key
 * unless the admin client is actually invoked at runtime (see lib/supabase/admin.ts).
 */
const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
});

function loadServerEnv() {
  const parsed = serverEnvSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  if (!parsed.success) {
    throw new Error("Invalid server environment variables");
  }

  return parsed.data;
}

const serverOnlyEnv = loadServerEnv();

export const serverEnv = {
  ...clientEnv,
  ...serverOnlyEnv,
};
