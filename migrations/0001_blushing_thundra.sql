CREATE TABLE IF NOT EXISTS "company_industries" (
	"company_id" uuid NOT NULL,
	"industry_id" uuid NOT NULL,
	CONSTRAINT "company_industries_company_id_industry_id_pk" PRIMARY KEY("company_id","industry_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "industries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skill_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(2) NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "factories" ADD COLUMN "state_id" uuid;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "category_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_industries" ADD CONSTRAINT "company_industries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_industries" ADD CONSTRAINT "company_industries_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_industries_company_idx" ON "company_industries" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_industries_industry_idx" ON "company_industries" USING btree ("industry_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "industries_name_idx" ON "industries" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "skill_categories_name_idx" ON "skill_categories" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "states_code_idx" ON "states" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "states_name_idx" ON "states" USING btree ("name");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "factories" ADD CONSTRAINT "factories_state_id_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "skills" ADD CONSTRAINT "skills_category_id_skill_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."skill_categories"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "factories_state_id_idx" ON "factories" USING btree ("state_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skills_category_id_idx" ON "skills" USING btree ("category_id");