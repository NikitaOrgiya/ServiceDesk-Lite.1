CREATE TYPE "public"."ticket_category" AS ENUM('hardware', 'software', 'network', 'access', 'workplace', 'other');--> statement-breakpoint
CREATE TYPE "public"."ticket_priority" AS ENUM('low', 'normal', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('new', 'accepted', 'in_progress', 'waiting', 'resolved', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('employee', 'admin');--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"role" "user_role" DEFAULT 'employee' NOT NULL,
	"department" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_full_name_not_blank" CHECK (length(trim("profiles"."full_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "ticket_number_counters" (
	"year" integer PRIMARY KEY NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ticket_number_counters_year_reasonable" CHECK ("ticket_number_counters"."year" BETWEEN 2000 AND 2999),
	CONSTRAINT "ticket_number_counters_last_value_non_negative" CHECK ("ticket_number_counters"."last_value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_number" text NOT NULL,
	"author_id" text NOT NULL,
	"assignee_id" text,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" "ticket_category" NOT NULL,
	"priority" "ticket_priority" DEFAULT 'normal' NOT NULL,
	"status" "ticket_status" DEFAULT 'new' NOT NULL,
	"due_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_public_number_unique" UNIQUE("public_number"),
	CONSTRAINT "tickets_title_length" CHECK (char_length(trim("tickets"."title")) BETWEEN 5 AND 160),
	CONSTRAINT "tickets_description_length" CHECK (char_length(trim("tickets"."description")) BETWEEN 10 AND 5000),
	CONSTRAINT "tickets_public_number_format" CHECK ("tickets"."public_number" ~ '^SD-[0-9]{4}-[0-9]{4,}$')
);
--> statement-breakpoint
CREATE TABLE "ticket_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_comments_message_length" CHECK (char_length(trim("ticket_comments"."message")) BETWEEN 1 AND 3000)
);
--> statement-breakpoint
CREATE TABLE "ticket_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"actor_id" text,
	"event_type" text NOT NULL,
	"field_name" text,
	"old_value" text,
	"new_value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignee_id_profiles_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_history" ADD CONSTRAINT "ticket_history_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_history" ADD CONSTRAINT "ticket_history_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tickets_author_id_created_at_idx" ON "tickets" USING btree ("author_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "tickets_assignee_id_status_idx" ON "tickets" USING btree ("assignee_id","status");--> statement-breakpoint
CREATE INDEX "tickets_status_created_at_idx" ON "tickets" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "tickets_priority_created_at_idx" ON "tickets" USING btree ("priority","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ticket_comments_ticket_id_created_at_idx" ON "ticket_comments" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "ticket_history_ticket_id_created_at_idx" ON "ticket_history" USING btree ("ticket_id","created_at");