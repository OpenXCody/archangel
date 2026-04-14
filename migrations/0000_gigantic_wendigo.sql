DO $$ BEGIN
 CREATE TYPE "public"."entity_type" AS ENUM('companies', 'factories', 'occupations', 'skills');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."error_status" AS ENUM('pending', 'resolved', 'skipped');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."error_type" AS ENUM('missing_required', 'duplicate_exact', 'potential_alias', 'unlinked_relationship', 'invalid_format', 'out_of_range');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."import_status" AS ENUM('pending', 'processing', 'completed', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."importance" AS ENUM('required', 'preferred', 'nice_to_have');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"industry" text,
	"description" text,
	"headquarters_lat" text,
	"headquarters_lng" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "error_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_batch_id" uuid,
	"entity_type" "entity_type" NOT NULL,
	"source_row_number" integer NOT NULL,
	"source_row_data" text,
	"error_type" "error_type" NOT NULL,
	"field_name" text,
	"original_value" text,
	"suggested_value" text,
	"status" "error_status" DEFAULT 'pending',
	"resolved_at" timestamp,
	"resolution_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "factories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"name" text NOT NULL,
	"specialization" text,
	"description" text,
	"latitude" text NOT NULL,
	"longitude" text NOT NULL,
	"state" text,
	"workforce_size" integer,
	"open_positions" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "factory_occupations" (
	"factory_id" uuid NOT NULL,
	"occupation_id" uuid NOT NULL,
	"headcount" integer,
	"avg_salary_min" integer,
	"avg_salary_max" integer,
	CONSTRAINT "factory_occupations_factory_id_occupation_id_pk" PRIMARY KEY("factory_id","occupation_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" text NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"total_rows" integer NOT NULL,
	"created_count" integer DEFAULT 0,
	"updated_count" integer DEFAULT 0,
	"skipped_count" integer DEFAULT 0,
	"status" "import_status" DEFAULT 'pending',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "occupation_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alias_text" text NOT NULL,
	"canonical_occupation_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "occupation_skills" (
	"occupation_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"importance" "importance" DEFAULT 'required',
	CONSTRAINT "occupation_skills_occupation_id_skill_id_pk" PRIMARY KEY("occupation_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "occupations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"onet_code" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skill_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alias_text" text NOT NULL,
	"canonical_skill_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "error_queue" ADD CONSTRAINT "error_queue_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "factories" ADD CONSTRAINT "factories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "factory_occupations" ADD CONSTRAINT "factory_occupations_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "factory_occupations" ADD CONSTRAINT "factory_occupations_occupation_id_occupations_id_fk" FOREIGN KEY ("occupation_id") REFERENCES "public"."occupations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "occupation_aliases" ADD CONSTRAINT "occupation_aliases_canonical_occupation_id_occupations_id_fk" FOREIGN KEY ("canonical_occupation_id") REFERENCES "public"."occupations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "occupation_skills" ADD CONSTRAINT "occupation_skills_occupation_id_occupations_id_fk" FOREIGN KEY ("occupation_id") REFERENCES "public"."occupations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "occupation_skills" ADD CONSTRAINT "occupation_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "skill_aliases" ADD CONSTRAINT "skill_aliases_canonical_skill_id_skills_id_fk" FOREIGN KEY ("canonical_skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "companies_name_idx" ON "companies" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "companies_industry_idx" ON "companies" USING btree ("industry");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "error_queue_batch_idx" ON "error_queue" USING btree ("import_batch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "error_queue_status_idx" ON "error_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "factories_company_idx" ON "factories" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "factories_state_idx" ON "factories" USING btree ("state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "factories_name_idx" ON "factories" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "factory_occupations_factory_idx" ON "factory_occupations" USING btree ("factory_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "factory_occupations_occupation_idx" ON "factory_occupations" USING btree ("occupation_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "occupation_aliases_text_idx" ON "occupation_aliases" USING btree ("alias_text");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "occupation_skills_occupation_idx" ON "occupation_skills" USING btree ("occupation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "occupation_skills_skill_idx" ON "occupation_skills" USING btree ("skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "occupations_title_idx" ON "occupations" USING btree ("title");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "occupations_onet_idx" ON "occupations" USING btree ("onet_code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "skill_aliases_text_idx" ON "skill_aliases" USING btree ("alias_text");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "skills_name_idx" ON "skills" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skills_category_idx" ON "skills" USING btree ("category");