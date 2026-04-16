DO $$ BEGIN
 CREATE TYPE "public"."proficiency_level" AS ENUM('awareness', 'novice', 'competent', 'proficient', 'expert');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."ref_type" AS ENUM('material', 'machine', 'standard', 'process', 'certification');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TYPE "entity_type" ADD VALUE IF NOT EXISTS 'refs';--> statement-breakpoint
ALTER TYPE "entity_type" ADD VALUE IF NOT EXISTS 'schools';--> statement-breakpoint
ALTER TYPE "entity_type" ADD VALUE IF NOT EXISTS 'programs';--> statement-breakpoint
ALTER TYPE "entity_type" ADD VALUE IF NOT EXISTS 'persons';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entity_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"label" text NOT NULL,
	"url" text NOT NULL,
	"link_type" text,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "person_skill_refs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"machine_ref_id" uuid,
	"material_ref_id" uuid,
	"level" "proficiency_level" DEFAULT 'competent',
	"years_experience" integer,
	"verified_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "persons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"linkedin_url" text,
	"current_title" text,
	"current_employer_id" uuid,
	"location_state" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "program_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alias_text" text NOT NULL,
	"canonical_program_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "program_skills" (
	"program_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"importance" "importance" DEFAULT 'required',
	CONSTRAINT "program_skills_program_id_skill_id_pk" PRIMARY KEY("program_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"cip_code" text,
	"credential_type" text,
	"duration_hours" integer,
	"is_open_source" boolean DEFAULT false,
	"curriculum_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ref_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alias_text" text NOT NULL,
	"canonical_ref_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "refs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "ref_type" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"properties" jsonb,
	"manufacturer" text,
	"tags" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "schools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"headquarters_lat" text,
	"headquarters_lng" text,
	"state" text,
	"state_id" uuid,
	"school_type" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skill_refs" (
	"skill_id" uuid NOT NULL,
	"ref_id" uuid NOT NULL,
	CONSTRAINT "skill_refs_skill_id_ref_id_pk" PRIMARY KEY("skill_id","ref_id")
);
--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "parent_skill_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "person_skill_refs" ADD CONSTRAINT "person_skill_refs_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "person_skill_refs" ADD CONSTRAINT "person_skill_refs_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "person_skill_refs" ADD CONSTRAINT "person_skill_refs_machine_ref_id_refs_id_fk" FOREIGN KEY ("machine_ref_id") REFERENCES "public"."refs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "person_skill_refs" ADD CONSTRAINT "person_skill_refs_material_ref_id_refs_id_fk" FOREIGN KEY ("material_ref_id") REFERENCES "public"."refs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "persons" ADD CONSTRAINT "persons_current_employer_id_companies_id_fk" FOREIGN KEY ("current_employer_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "program_aliases" ADD CONSTRAINT "program_aliases_canonical_program_id_programs_id_fk" FOREIGN KEY ("canonical_program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "program_skills" ADD CONSTRAINT "program_skills_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "program_skills" ADD CONSTRAINT "program_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "programs" ADD CONSTRAINT "programs_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ref_aliases" ADD CONSTRAINT "ref_aliases_canonical_ref_id_refs_id_fk" FOREIGN KEY ("canonical_ref_id") REFERENCES "public"."refs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "schools" ADD CONSTRAINT "schools_state_id_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "skill_refs" ADD CONSTRAINT "skill_refs_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "skill_refs" ADD CONSTRAINT "skill_refs_ref_id_refs_id_fk" FOREIGN KEY ("ref_id") REFERENCES "public"."refs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entity_links_entity_idx" ON "entity_links" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "person_skill_refs_person_idx" ON "person_skill_refs" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "person_skill_refs_skill_idx" ON "person_skill_refs" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "person_skill_refs_machine_idx" ON "person_skill_refs" USING btree ("machine_ref_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "program_aliases_text_idx" ON "program_aliases" USING btree ("alias_text");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "program_skills_program_idx" ON "program_skills" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "program_skills_skill_idx" ON "program_skills" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "programs_school_idx" ON "programs" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "programs_cip_idx" ON "programs" USING btree ("cip_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "programs_title_idx" ON "programs" USING btree ("title");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ref_aliases_text_idx" ON "ref_aliases" USING btree ("alias_text");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "refs_type_name_idx" ON "refs" USING btree ("type","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refs_type_idx" ON "refs" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refs_name_idx" ON "refs" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "schools_name_idx" ON "schools" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "schools_state_idx" ON "schools" USING btree ("state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skill_refs_skill_idx" ON "skill_refs" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skill_refs_ref_idx" ON "skill_refs" USING btree ("ref_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skills_parent_idx" ON "skills" USING btree ("parent_skill_id");