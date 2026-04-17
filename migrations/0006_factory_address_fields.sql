ALTER TABLE "factories" ADD COLUMN IF NOT EXISTS "address" text;--> statement-breakpoint
ALTER TABLE "factories" ADD COLUMN IF NOT EXISTS "city" text;--> statement-breakpoint
ALTER TABLE "factories" ADD COLUMN IF NOT EXISTS "zip_code" varchar(10);--> statement-breakpoint
ALTER TABLE "factories" ADD COLUMN IF NOT EXISTS "country" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "factories_city_idx" ON "factories" USING btree ("city");
