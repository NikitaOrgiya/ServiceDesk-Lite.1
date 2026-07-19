import { defineConfig } from "drizzle-kit";

// Uses DATABASE_MIGRATION_URL (a separate, typically unpooled connection
// string) rather than the runtime DATABASE_URL — see .env.example and
// docs/migration/supabase-to-neon.md.
const databaseUrl = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: databaseUrl ? { url: databaseUrl } : undefined,
  strict: true,
  verbose: true,
});
