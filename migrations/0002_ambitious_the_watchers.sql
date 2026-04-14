CREATE TABLE IF NOT EXISTS "external_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skill_relations" (
	"skill_id" uuid NOT NULL,
	"related_skill_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "skill_relations_skill_id_related_skill_id_pk" PRIMARY KEY("skill_id","related_skill_id")
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "aliases" text[];--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "skill_relations" ADD CONSTRAINT "skill_relations_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "skill_relations" ADD CONSTRAINT "skill_relations_related_skill_id_skills_id_fk" FOREIGN KEY ("related_skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "external_refs_entity_idx" ON "external_references" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "external_refs_source_idx" ON "external_references" USING btree ("source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "external_refs_external_id_idx" ON "external_references" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skill_relations_skill_idx" ON "skill_relations" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skill_relations_related_idx" ON "skill_relations" USING btree ("related_skill_id");