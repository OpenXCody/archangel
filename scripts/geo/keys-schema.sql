-- The keys that join a plant to public statistics, and the reference tables
-- behind them. Everything here is additive and safe to run more than once.
-- This is the hand-written half of migration 0044; scripts/build-geo-sql.mjs
-- puts the reference rows after it.

-- Metropolitan and micropolitan areas (core based statistical areas), as the
-- Office of Management and Budget delineates them. data/geo/metros.json.
CREATE TABLE IF NOT EXISTS "metros" (
  -- The five-digit CBSA code.
  "code" text PRIMARY KEY,
  -- "Austin-Round Rock-San Marcos, TX"
  "name" text NOT NULL,
  -- 'metropolitan' | 'micropolitan'
  "kind" text NOT NULL
);

-- Every county and county equivalent of the 50 states and the District of
-- Columbia. data/geo/counties.json.
CREATE TABLE IF NOT EXISTS "counties" (
  -- The five-digit FIPS code: state, then county.
  "fips" text PRIMARY KEY,
  -- As the Census Bureau writes it: "Travis County", "Orleans Parish".
  "name" text NOT NULL,
  -- The two-letter state code (shared/states.ts).
  "state" text NOT NULL,
  -- The metro area the county belongs to; null for a county in none.
  "cbsa_code" text REFERENCES "metros" ("code")
);
CREATE INDEX IF NOT EXISTS "counties_state_idx" ON "counties" ("state");
CREATE INDEX IF NOT EXISTS "counties_cbsa_idx" ON "counties" ("cbsa_code");

-- The 2022 NAICS codes for manufacturing, sector to national industry.
-- data/industries/naics-2022.json.
CREATE TABLE IF NOT EXISTS "naics" (
  -- '31-33' for the sector, then three to six digits.
  "code" text PRIMARY KEY,
  "title" text NOT NULL,
  -- 2 sector, 3 subsector (the product's 21 industries), 4 industry group, 5 industry, 6 national industry.
  "level" smallint NOT NULL,
  -- The code one level up; null for the sector.
  "parent" text REFERENCES "naics" ("code")
);
CREATE INDEX IF NOT EXISTS "naics_parent_idx" ON "naics" ("parent");

-- Other forms of a code that mean exactly one 2022 national industry: a
-- shorter code with one industry under it, or a code of an earlier edition
-- that went whole to one industry. data/industries/naics-concordance.json.
CREATE TABLE IF NOT EXISTS "naics_concordance" (
  "from_code" text PRIMARY KEY,
  "code" text NOT NULL REFERENCES "naics" ("code"),
  -- 'only' | '2017' | '2012' | '2007'
  "basis" text NOT NULL
);

-- Official statistics by industry and county, one row per year: the county
-- sibling of industry_stats, with the same columns and the same rule (a
-- figure the source withheld is NULL, never zero). A county with no row had
-- nothing to count.
CREATE TABLE IF NOT EXISTS "industry_county_stats" (
  "county_fips" text NOT NULL REFERENCES "counties" ("fips"),
  -- '31-33' for manufacturing as a whole; a NAICS subsector when figures by industry are loaded.
  "industry_code" text NOT NULL,
  "year" integer NOT NULL,
  "establishments" integer,
  -- People employed (annual average).
  "employment" integer,
  -- Average annual pay, in dollars.
  "avg_annual_pay" integer,
  "source" text NOT NULL,
  "source_url" text,
  PRIMARY KEY ("county_fips", "industry_code", "year")
);

-- A plant's coordinates as numbers. The app reads and writes the text
-- columns; these are computed from them by the database itself, so they
-- cannot disagree with them whichever way a row is written. Text that is not
-- a plain number, or a number that is not a latitude or longitude, is NULL.
ALTER TABLE "factories"
  ADD COLUMN IF NOT EXISTS "lat" double precision GENERATED ALWAYS AS (
    CASE WHEN "latitude" ~ '^\s*[-+]?([0-9]{1,3}(\.[0-9]*)?|\.[0-9]+)\s*$'
          AND "latitude"::double precision BETWEEN -90 AND 90
         THEN "latitude"::double precision END
  ) STORED,
  ADD COLUMN IF NOT EXISTS "lng" double precision GENERATED ALWAYS AS (
    CASE WHEN "longitude" ~ '^\s*[-+]?([0-9]{1,3}(\.[0-9]*)?|\.[0-9]+)\s*$'
          AND "longitude"::double precision BETWEEN -180 AND 180
         THEN "longitude"::double precision END
  ) STORED,
  -- The county the coordinates fall in, and that county's metro area. Written
  -- by scripts/geo/assign-keys.mjs; NULL until it has run for the row.
  ADD COLUMN IF NOT EXISTS "county_fips" text REFERENCES "counties" ("fips"),
  ADD COLUMN IF NOT EXISTS "cbsa_code" text REFERENCES "metros" ("code"),
  -- The 2022 national industry (six digits) that primary_naics means, when it
  -- means exactly one. primary_naics itself is left as it was stored.
  ADD COLUMN IF NOT EXISTS "naics" varchar(6) REFERENCES "naics" ("code");
CREATE INDEX IF NOT EXISTS "factories_county_idx" ON "factories" ("county_fips");
CREATE INDEX IF NOT EXISTS "factories_cbsa_idx" ON "factories" ("cbsa_code");
CREATE INDEX IF NOT EXISTS "factories_naics_idx" ON "factories" ("naics");

-- The 2022 national industry a stored code means, or NULL: the code itself
-- when it is one, otherwise the one industry another form of it stands for.
CREATE OR REPLACE FUNCTION naics_2022(stored text) RETURNS varchar(6)
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT n.code FROM naics n WHERE n.code = btrim(stored) AND n.level = 6),
    (SELECT c.code FROM naics_concordance c WHERE c.from_code = btrim(stored))
  )::varchar(6)
$$;

-- Keeps the keys honest on every write, whoever makes it (the API, a loader's
-- SQL, the intake pipeline):
-- - naics follows primary_naics;
-- - a plant whose coordinates change loses its county and metro area, unless
--   the same statement sets them: the old county may no longer be true, and
--   the next run of scripts/geo/assign-keys.mjs places the plant again.
CREATE OR REPLACE FUNCTION factories_keys() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.primary_naics IS DISTINCT FROM OLD.primary_naics THEN
    NEW.naics := naics_2022(NEW.primary_naics);
  END IF;
  IF TG_OP = 'UPDATE'
     AND (NEW.latitude IS DISTINCT FROM OLD.latitude OR NEW.longitude IS DISTINCT FROM OLD.longitude)
     AND NEW.county_fips IS NOT DISTINCT FROM OLD.county_fips THEN
    NEW.county_fips := NULL;
    NEW.cbsa_code := NULL;
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS "factories_keys" ON "factories";
CREATE TRIGGER "factories_keys" BEFORE INSERT OR UPDATE ON "factories"
  FOR EACH ROW EXECUTE FUNCTION factories_keys();
