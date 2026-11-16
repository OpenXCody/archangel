-- A company's public identity for the map and lists. Additive and idempotent.
--   domain   : the company's web domain (e.g. "ti.com"), used to show its logo.
--   featured : a curated employer that lists and the map put first.
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "domain" text;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "featured" boolean DEFAULT false NOT NULL;
CREATE INDEX IF NOT EXISTS "companies_featured_idx" ON "companies" ("featured") WHERE "featured";
