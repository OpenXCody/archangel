-- The industry as a level of the product: what each of the 21 manufacturing
-- industries makes, and the official count of who works in it, by state.
-- Two new tables and nothing else; safe to run more than once. The rows come
-- from the generated migration that follows (0036).

-- One row per industry (a NAICS manufacturing subsector), curated in
-- data/industries/industries.json.
CREATE TABLE IF NOT EXISTS "industry_profiles" (
  -- The NAICS subsector: '311' to '339'.
  "code" text PRIMARY KEY,
  -- The title a plant carries in factories.primary_naics_description.
  "name" text NOT NULL,
  -- One plain sentence on what the industry makes.
  "summary" text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "industry_profiles_name_key" ON "industry_profiles" ("name");

-- Official statistics by industry and place, one row per year. A figure the
-- source withheld is NULL, never zero.
CREATE TABLE IF NOT EXISTS "industry_stats" (
  -- 'US' for the nation, or a two-letter state code.
  "state" text NOT NULL,
  -- The NAICS subsector, or '31-33' for manufacturing as a whole.
  "industry_code" text NOT NULL,
  "year" integer NOT NULL,
  "establishments" integer,
  -- People employed (annual average).
  "employment" integer,
  -- Average annual pay, in dollars.
  "avg_annual_pay" integer,
  -- Who published the figures, as said on screen, and where to read about them.
  "source" text NOT NULL,
  "source_url" text,
  PRIMARY KEY ("state", "industry_code", "year")
);
-- An industry's page reads every state's row for that industry.
CREATE INDEX IF NOT EXISTS "industry_stats_industry_idx" ON "industry_stats" ("industry_code", "year");
