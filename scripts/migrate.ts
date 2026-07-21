import "../envConfig";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import ws from "ws";
import { Client, neonConfig } from "@neondatabase/serverless";

neonConfig.webSocketConstructor = ws;

/**
 * Applies drizzle/*.sql migrations in filename order against
 * DATABASE_MIGRATION_URL (falling back to DATABASE_URL). Uses
 * @neondatabase/serverless's pg-compatible `Client` (WebSocket-based, not
 * the HTTP `neon()` tag function) so each file's raw multi-statement SQL
 * can be sent as-is via Postgres's simple query protocol — the same
 * mechanism `psql -f` uses, which is how these migrations were actually
 * verified (see docs/migration/supabase-to-neon.md: no live Neon project
 * was available in this migration, so this script itself has only been
 * type-checked, not run against real Neon).
 *
 * Tracks applied filenames in a bookkeeping table so repeat runs are
 * idempotent, without depending on drizzle-kit's own internal migration
 * journal format (which expects `--> statement-breakpoint` markers this
 * project's hand-written custom migrations do not use).
 *
 * Never run against a production branch without review — this script
 * applies every not-yet-applied migration unconditionally.
 */
async function main() {
  const databaseUrl = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Set DATABASE_MIGRATION_URL (or DATABASE_URL) before running db:migrate.");
  }

  const migrationsDir = path.join(process.cwd(), "drizzle");
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const client = new Client(databaseUrl);
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public._app_migrations_applied (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    for (const file of files) {
      const { rows } = await client.query(
        "SELECT 1 FROM public._app_migrations_applied WHERE filename = $1",
        [file]
      );

      if (rows.length > 0) {
        console.log(`skip  ${file} (already applied)`);
        continue;
      }

      const sql = await readFile(path.join(migrationsDir, file), "utf8");
      console.log(`apply ${file}`);

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO public._app_migrations_applied (filename) VALUES ($1)",
          [file]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    console.log("All migrations applied.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
