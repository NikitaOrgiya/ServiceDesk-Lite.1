import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { userRoleEnum } from "@/db/schema/enums";

/**
 * `id` is the Neon Auth user id (JWT `sub` claim) — plain TEXT, not a
 * foreign key into Neon Auth's internal schema. Neon Auth's internal user
 * table shape is not a documented, stable contract for this application to
 * depend on via FK; see docs/migration/supabase-to-neon.md.
 */
export const profiles = pgTable(
  "profiles",
  {
    id: text("id").primaryKey(),
    fullName: text("full_name").notNull(),
    role: userRoleEnum("role").notNull().default("employee"),
    department: text("department"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("profiles_full_name_not_blank", sql`length(trim(${table.fullName})) > 0`)]
);
