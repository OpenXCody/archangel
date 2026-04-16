ALTER TABLE "factories" ADD COLUMN IF NOT EXISTS "primary_naics" varchar(6);--> statement-breakpoint
ALTER TABLE "factories" ADD COLUMN IF NOT EXISTS "primary_naics_description" text;--> statement-breakpoint
ALTER TABLE "factories" ADD COLUMN IF NOT EXISTS "source_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "factories" ADD COLUMN IF NOT EXISTS "confidence" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "factories_primary_naics_idx" ON "factories" USING btree ("primary_naics");