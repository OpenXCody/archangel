-- Places for deeper facts about plants and companies, and for where each fact
-- came from. Additive, quick (no table is rewritten) and safe to run again.

-- A plant: how many people work there and what that figure refers to, what is
-- made there, when it opened, and whether it is running yet.
ALTER TABLE factories ADD COLUMN IF NOT EXISTS workforce_year smallint;
ALTER TABLE factories ADD COLUMN IF NOT EXISTS workforce_source text;
ALTER TABLE factories ADD COLUMN IF NOT EXISTS workforce_note text;
ALTER TABLE factories ADD COLUMN IF NOT EXISTS products text;
ALTER TABLE factories ADD COLUMN IF NOT EXISTS opened_year smallint;
ALTER TABLE factories ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'operating';
-- True when the plant's facts were written from sources (a research file, or
-- an admin filling them in), so a described plant can be told from a bare one.
ALTER TABLE factories ADD COLUMN IF NOT EXISTS curated boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'factories_status_check') THEN
    ALTER TABLE factories
      ADD CONSTRAINT factories_status_check CHECK (status IN ('operating', 'under construction')) NOT VALID;
  END IF;
END $$;

-- A company: the company it is part of (Bell is part of Textron), and where
-- its headquarters are. The older headquarters_lat / headquarters_lng stay.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS parent_company_id uuid REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS headquarters_city text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS headquarters_state text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS headquarters_country text;
CREATE INDEX IF NOT EXISTS companies_parent_idx ON companies (parent_company_id) WHERE parent_company_id IS NOT NULL;

-- How many people a company employs in one state, when a source says so.
CREATE TABLE IF NOT EXISTS company_state_headcounts (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  state text NOT NULL,
  people integer NOT NULL CHECK (people >= 0),
  year smallint,
  source text,
  note text,
  PRIMARY KEY (company_id, state)
);

-- Where a curated company's or plant's facts came from: one row per source
-- address in external_references (source 'CURATED', external_id the research
-- file's name, url the address). The same address is kept once per record.
CREATE UNIQUE INDEX IF NOT EXISTS external_refs_curated_key
  ON external_references (entity_type, entity_id, url) WHERE source = 'CURATED';

-- What a bulk load decided, as it decided it: one line per company found,
-- created or merged and per plant matched, moved or inserted. `look` marks the
-- lines a person should read. Written by the migrations that
-- scripts/build-employers-sql.mjs generates.
CREATE TABLE IF NOT EXISTS load_log (
  id bigserial PRIMARY KEY,
  run_at timestamptz NOT NULL DEFAULT now(),
  load text NOT NULL,
  kind text NOT NULL,
  action text NOT NULL,
  look boolean NOT NULL DEFAULT false,
  company text,
  plant text,
  detail text,
  -- How far the plant was from the row it was matched to.
  metres integer
);
CREATE INDEX IF NOT EXISTS load_log_run_idx ON load_log (run_at, id);
