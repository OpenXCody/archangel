-- Intake: what large sources need to come in outside the website's deploy.
-- Tables for sources, runs and raw staging; external_references made the
-- crosswalk for every source's own ids; a merge history; where each of a
-- plant's facts came from; a review queue; and the functions that write a
-- staged record onto a plant, so the runner (scripts/ingest/run.mjs) and
-- Admin Tools decide by one rule. scripts/ingest/README.md describes it all.
--
-- Additive, quick (no table is rewritten: every new column is nullable or has
-- a constant default) and safe to run again. It loads no data.

-- ---------------------------------------------------------------------------
-- Sources and runs
-- ---------------------------------------------------------------------------

-- A source, registered once by the runner from its adapter
-- (scripts/ingest/sources/<slug>.mjs) the first time it is staged.
CREATE TABLE IF NOT EXISTS intake_sources (
  slug text PRIMARY KEY CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  name text NOT NULL,
  publisher text,
  -- Where it comes from, its terms in a line, how it is fetched in a line.
  url text,
  terms text,
  how_fetched text,
  -- The kind of record it describes. Plants only, today.
  kind text NOT NULL DEFAULT 'factory' CHECK (kind IN ('factory')),
  -- The name its ids are kept under in external_references.source.
  ref_source text NOT NULL UNIQUE,
  -- Which of its records are staged: 'known' only those whose id we already
  -- hold (the rest are counted, not kept); 'all' every record.
  scope text NOT NULL DEFAULT 'known' CHECK (scope IN ('known', 'all')),
  -- A record with no candidate: 'hold' it, or 'add' it as a new plant.
  unmatched text NOT NULL DEFAULT 'hold' CHECK (unmatched IN ('hold', 'add')),
  -- 'empty': it fills a fact only where the plant has none. 'ranked': it also
  -- replaces a value from a lower-ranked source, or an older one of its rank.
  fill text NOT NULL DEFAULT 'empty' CHECK (fill IN ('empty', 'ranked')),
  -- How far its word goes, 1 to 99, and per fact where that differs
  -- ({"headcount": 70}). An admin's value is 100 and is never replaced.
  rank smallint NOT NULL DEFAULT 50 CHECK (rank BETWEEN 1 AND 99),
  ranks jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One load of one source. `counts` and `timings` (seconds per stage) are what
-- the run reports; `input` is the file or address it read.
CREATE TABLE IF NOT EXISTS intake_runs (
  id bigserial PRIMARY KEY,
  source text NOT NULL REFERENCES intake_sources(slug) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'staging'
    CHECK (state IN ('staging', 'staged', 'resolved', 'applying', 'applied', 'undone', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  input text,
  input_sha256 text,
  input_bytes bigint,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  timings jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- 'cli', or the GitHub Actions run that started it.
  started_by text,
  note text
);
CREATE INDEX IF NOT EXISTS intake_runs_source_idx ON intake_runs (source, id DESC);

-- ---------------------------------------------------------------------------
-- Raw staging
-- ---------------------------------------------------------------------------

-- What a source said, one row per source record, kept as it said it
-- (`payload`: the source's own column names) beside the adapter's reading of
-- it in our words (`facts`). The run columns let a later run tell new from
-- changed from gone. Written only when a run stages.
CREATE TABLE IF NOT EXISTS intake_records (
  source text NOT NULL REFERENCES intake_sources(slug) ON DELETE CASCADE,
  source_id text NOT NULL,
  -- The run that first saw it, the run that last saw it new or changed, and
  -- the run that found it missing (null while the source still has it: such
  -- a record was in every run of its source since it appeared). A run does
  -- not touch the records it finds unchanged, so staging a large source
  -- again rewrites only what changed.
  first_run_id bigint NOT NULL,
  changed_run_id bigint NOT NULL,
  gone_run_id bigint,
  payload jsonb NOT NULL,
  facts jsonb NOT NULL,
  hash text NOT NULL,
  PRIMARY KEY (source, source_id)
);
CREATE INDEX IF NOT EXISTS intake_records_changed_idx ON intake_records (changed_run_id);

-- Which of our records each staged record is: one short row beside it, so
-- resolving and applying never rewrite what the source said.
CREATE TABLE IF NOT EXISTS intake_links (
  source text NOT NULL,
  source_id text NOT NULL,
  -- Our record, how it was found ('id', 'matched', 'added') and the run that
  -- decided. 'review' (in the queue), 'held' and 'new' (to be added when the
  -- run is applied) have no record yet.
  entity_id uuid,
  resolution text CHECK (resolution IN ('id', 'matched', 'added', 'review', 'held', 'new')),
  resolved_run_id bigint,
  -- Records an admin said it is not.
  not_ids uuid[] NOT NULL DEFAULT '{}',
  -- The version of the record (its hash) whose facts were last applied, and by which run.
  applied_hash text,
  applied_run_id bigint,
  PRIMARY KEY (source, source_id),
  FOREIGN KEY (source, source_id) REFERENCES intake_records (source, source_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS intake_links_entity_idx ON intake_links (entity_id) WHERE entity_id IS NOT NULL;

-- The two read as one.
CREATE OR REPLACE VIEW intake_staged AS
  SELECT r.source, r.source_id, r.first_run_id, r.changed_run_id, r.gone_run_id, r.payload, r.facts, r.hash,
         l.entity_id, l.resolution, l.resolved_run_id, l.not_ids, l.applied_hash, l.applied_run_id
  FROM intake_records r JOIN intake_links l ON l.source = r.source AND l.source_id = r.source_id;

-- Where a run's records land first, batch by batch, before they are compared
-- with intake_records. Emptied when the run is staged.
CREATE TABLE IF NOT EXISTS intake_load (
  run_id bigint NOT NULL,
  seq integer NOT NULL,
  source_id text NOT NULL,
  payload jsonb NOT NULL,
  facts jsonb NOT NULL,
  hash text NOT NULL,
  PRIMARY KEY (run_id, seq)
);

-- ---------------------------------------------------------------------------
-- Identity: external_references is the crosswalk
-- ---------------------------------------------------------------------------

-- A source's id names at most one of our records of a kind. Rows with source
-- 'CURATED' are not ids (they are the addresses a curated record's facts came
-- from, many per record) and stay outside the rule.
--
-- Production cannot be seen from here, so two rows that already carry one id
-- are not an error: the first (a record that still exists before one that
-- does not, then the oldest) keeps the id and the others are marked
-- `duplicate`. They are two rows for one outside thing, which is worth
-- knowing: SELECT * FROM external_references WHERE duplicate.
ALTER TABLE external_references ADD COLUMN IF NOT EXISTS duplicate boolean NOT NULL DEFAULT false;
-- The run that wrote the id; null for ids from before intake, or written by hand.
ALTER TABLE external_references ADD COLUMN IF NOT EXISTS run_id bigint;

UPDATE external_references x SET duplicate = true
FROM (
  SELECT r.id, row_number() OVER (
    PARTITION BY r.source, r.entity_type, r.external_id
    ORDER BY (CASE r.entity_type
                WHEN 'factories' THEN EXISTS (SELECT 1 FROM factories f WHERE f.id = r.entity_id)
                WHEN 'companies' THEN EXISTS (SELECT 1 FROM companies c WHERE c.id = r.entity_id)
                ELSE true END) DESC,
             r.created_at, r.id) AS n
  FROM external_references r
  WHERE r.source <> 'CURATED' AND NOT r.duplicate
) d
WHERE d.id = x.id AND d.n > 1;

-- The rule, and the index a lookup by (source, id) uses.
CREATE UNIQUE INDEX IF NOT EXISTS external_refs_identity_key
  ON external_references (source, entity_type, external_id)
  WHERE source <> 'CURATED' AND NOT duplicate;

-- Which record was merged into which, when and by whom, so an id that
-- pointed at a record that is gone still leads somewhere. Written by
-- server/lib/recordMerge.ts (an admin), scripts/employers-loader.sql (a
-- research file) and intake runs. A record is merged away once.
CREATE TABLE IF NOT EXISTS record_merges (
  id bigserial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('company', 'factory', 'career', 'skill')),
  from_id uuid NOT NULL,
  into_id uuid NOT NULL,
  from_name text,
  merged_at timestamptz NOT NULL DEFAULT now(),
  -- 'admin', 'loader' (a research file, named in `note`) or 'run'.
  via text NOT NULL,
  run_id bigint,
  actor_id uuid,
  note text,
  CHECK (from_id <> into_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS record_merges_from_key ON record_merges (kind, from_id);
CREATE INDEX IF NOT EXISTS record_merges_into_idx ON record_merges (kind, into_id);

-- The merges admins made before this table existed, from the audit log.
INSERT INTO record_merges (kind, from_id, into_id, from_name, merged_at, via, actor_id)
SELECT a.kind, (a.detail->'merged'->>'id')::uuid, a.record_id, a.detail->'merged'->>'name', a.at, 'admin', a.actor_id
FROM audit_log a
WHERE a.action = 'merged' AND a.kind IN ('company', 'career', 'skill') AND a.record_id IS NOT NULL
  AND a.detail->'merged'->>'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND (a.detail->'merged'->>'id')::uuid <> a.record_id
ORDER BY a.at
ON CONFLICT (kind, from_id) DO NOTHING;

-- The record an id stands for now: itself, or the record it was merged into,
-- however many merges on.
CREATE OR REPLACE FUNCTION record_now(p_kind text, p_id uuid) RETURNS uuid LANGUAGE sql STABLE AS $f$
  WITH RECURSIVE walk(id, depth) AS (
    SELECT p_id, 0
    UNION ALL
    SELECT m.into_id, w.depth + 1 FROM walk w JOIN record_merges m ON m.kind = p_kind AND m.from_id = w.id WHERE w.depth < 32
  )
  SELECT id FROM walk ORDER BY depth DESC LIMIT 1
$f$;

-- ---------------------------------------------------------------------------
-- Where a plant's facts came from
-- ---------------------------------------------------------------------------

-- One row per plant and fact, for the facts sources fill: who says so
-- (`source`: an intake source's slug, 'admin', or 'curated' for a research
-- file), how far their word goes (`rank`), what day the value is for
-- (`as_of`), and the run and source record that set it. A fact with no row
-- was there before intake: a curated plant's counts as rank 80, any other as
-- rank 10. factories.workforce_source and workforce_year stay what the page
-- shows for a headcount; this says which load wrote them.
CREATE TABLE IF NOT EXISTS fact_sources (
  factory_id uuid NOT NULL REFERENCES factories(id) ON DELETE CASCADE,
  fact text NOT NULL CHECK (fact IN ('industry', 'address', 'city', 'zip', 'coordinates', 'headcount', 'products', 'opened', 'status')),
  source text NOT NULL,
  rank smallint NOT NULL,
  as_of date,
  run_id bigint,
  source_id text,
  set_by uuid,
  set_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (factory_id, fact)
);
CREATE INDEX IF NOT EXISTS fact_sources_run_idx ON fact_sources (run_id) WHERE run_id IS NOT NULL;

-- What admins typed before this table existed, from the audit log: a value an
-- admin typed is never replaced by a source.
INSERT INTO fact_sources (factory_id, fact, source, rank, set_by, set_at)
SELECT DISTINCT ON (a.record_id, m.fact) a.record_id, m.fact, 'admin', 100, a.actor_id, a.at
FROM audit_log a
JOIN factories f ON f.id = a.record_id
CROSS JOIN LATERAL jsonb_object_keys(CASE WHEN jsonb_typeof(a.detail->'changes') = 'object' THEN a.detail->'changes' ELSE '{}'::jsonb END) AS k(key)
JOIN (VALUES ('industry', 'industry'), ('address', 'address'), ('city', 'city'), ('latitude', 'coordinates'), ('longitude', 'coordinates'),
             ('workforceSize', 'headcount'), ('workforceYear', 'headcount'), ('workforceSource', 'headcount'), ('workforceNote', 'headcount'),
             ('products', 'products'), ('openedYear', 'opened'), ('status', 'status')) AS m(key, fact) ON m.key = k.key
WHERE a.kind = 'factory' AND a.action = 'edited'
ORDER BY a.record_id, m.fact, a.at DESC
ON CONFLICT (factory_id, fact) DO NOTHING;

-- And the plants admins added by hand: where they put them is theirs.
INSERT INTO fact_sources (factory_id, fact, source, rank, set_by, set_at)
SELECT f.id, v.fact, 'admin', 100, a.actor_id, a.at
FROM audit_log a
JOIN factories f ON f.id = a.record_id
CROSS JOIN LATERAL (VALUES ('coordinates', true), ('city', f.city IS NOT NULL), ('address', f.address IS NOT NULL)) AS v(fact, has)
WHERE a.kind = 'factory' AND a.action = 'added' AND v.has
ON CONFLICT (factory_id, fact) DO NOTHING;

-- The one rule for whether a source's value goes onto a plant.
--   p_fill, p_rank, p_as_of   the source's fill rule, its rank for this fact, the day its value is for
--   cur_*                     what the plant has: whether it is empty, who set it, their rank and day
-- An admin's word stands, even when it is "nothing". An empty fact is filled.
-- A source that only fills stops there. Otherwise the higher rank wins, and at
-- the same rank the newer value.
CREATE OR REPLACE FUNCTION intake_fact_wins(p_fill text, p_rank integer, p_as_of date, cur_empty boolean, cur_source text, cur_rank integer, cur_as_of date)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $f$
  SELECT CASE
    WHEN cur_source = 'admin' THEN false
    WHEN cur_empty THEN true
    WHEN p_fill = 'empty' THEN false
    WHEN p_rank > coalesce(cur_rank, 0) THEN true
    WHEN p_rank = coalesce(cur_rank, 0) AND p_as_of IS NOT NULL AND (cur_as_of IS NULL OR p_as_of > cur_as_of) THEN true
    ELSE false
  END
$f$;

-- ---------------------------------------------------------------------------
-- Decisions, changes and the review queue
-- ---------------------------------------------------------------------------

-- load_log stays the one home for what a load decided. A run's lines carry
-- the run, the source's record and our record; `evidence` is what the
-- decision was made on. The employer loader's lines have none of these.
ALTER TABLE load_log ADD COLUMN IF NOT EXISTS run_id bigint;
ALTER TABLE load_log ADD COLUMN IF NOT EXISTS source_id text;
ALTER TABLE load_log ADD COLUMN IF NOT EXISTS entity_id uuid;
ALTER TABLE load_log ADD COLUMN IF NOT EXISTS evidence jsonb;
CREATE INDEX IF NOT EXISTS load_log_run_id_idx ON load_log (run_id, id) WHERE run_id IS NOT NULL;

-- What a run changed, one row per change, with the values before and after:
-- how a run is undone, and the history behind fact_sources.
--   op 'fact'     columns of a plant (before, after) and who the fact belonged to (before_source)
--   op 'id'       an id written to the crosswalk (after: {"ref": <external_references.id>})
--   op 'plant'    a plant the run added;  op 'company'  a company it added for one
CREATE TABLE IF NOT EXISTS intake_changes (
  id bigserial PRIMARY KEY,
  run_id bigint NOT NULL,
  -- The review decision that made it, when an admin did.
  review_id bigint,
  op text NOT NULL CHECK (op IN ('fact', 'id', 'plant', 'company')),
  entity_id uuid NOT NULL,
  fact text,
  before jsonb,
  after jsonb,
  before_source jsonb,
  at timestamptz NOT NULL DEFAULT now(),
  undone_at timestamptz
);
CREATE INDEX IF NOT EXISTS intake_changes_run_idx ON intake_changes (run_id, id);
CREATE INDEX IF NOT EXISTS intake_changes_entity_idx ON intake_changes (entity_id, id);

-- A staged record that may be one of our plants, waiting for a person.
-- `candidates` is the evidence as the run saw it, best first:
-- [{ id, rule, metres, name, company, city, state }].
CREATE TABLE IF NOT EXISTS intake_review (
  id bigserial PRIMARY KEY,
  source text NOT NULL,
  source_id text NOT NULL,
  run_id bigint NOT NULL,
  reason text NOT NULL,
  candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'same', 'different', 'withdrawn')),
  -- The plant an admin said it is.
  entity_id uuid,
  -- Set by Skip: still waiting, after the ones nobody has looked at.
  skipped_at timestamptz,
  decided_at timestamptz,
  decided_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (source, source_id) REFERENCES intake_records (source, source_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS intake_review_waiting_key ON intake_review (source, source_id) WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS intake_review_queue_idx ON intake_review (skipped_at NULLS FIRST, id) WHERE status = 'waiting';

-- ---------------------------------------------------------------------------
-- Writing a staged record onto its plant
-- ---------------------------------------------------------------------------

-- Applies one staged record to the plant it was resolved to: writes its id to
-- the crosswalk, then each fact the record carries, by intake_fact_wins.
-- Every change is journalled in intake_changes and its origin recorded in
-- fact_sources; one line in load_log says what was filled. Returns the facts
-- it set. Used by the runner for every record of a run and by Admin Tools
-- when an admin says a queued record is one of our plants.
--
-- The facts a record may carry (the adapter contract, scripts/ingest/README.md):
--   naics, industry          -> primary_naics, primary_naics_description
--   address | city | zip     -> address | city | zip_code
--   latitude, longitude      -> latitude, longitude
--   people, peopleYear, peopleSource, peopleNote -> workforce_*
--   products | opened | status
--   asOf (the day the values are for), url (the record at the source),
--   industryNote (why the record offers no industry: logged, nothing written)
CREATE OR REPLACE FUNCTION intake_apply_record(p_source text, p_source_id text, p_run bigint, p_review bigint DEFAULT NULL, p_actor uuid DEFAULT NULL)
RETURNS text[] LANGUAGE plpgsql AS $f$
DECLARE
  s intake_sources%ROWTYPE;
  r intake_staged%ROWTYPE;
  f factories%ROWTYPE;
  prov fact_sources%ROWTYPE;
  v jsonb;
  v_as_of date;
  v_fact text;
  v_key text;
  v_cand jsonb;
  v_cur jsonb;
  v_fact_as_of date;
  v_cur_as_of date;
  v_patch jsonb := '{}'::jsonb;
  v_set text[] := '{}';
  v_said text[] := '{}';
  v_ref uuid;
BEGIN
  SELECT * INTO s FROM intake_sources WHERE slug = p_source;
  PERFORM 1 FROM intake_links WHERE source = p_source AND source_id = p_source_id FOR UPDATE;
  SELECT * INTO r FROM intake_staged WHERE source = p_source AND source_id = p_source_id;
  IF s.slug IS NULL OR r.source IS NULL OR r.entity_id IS NULL THEN RETURN v_set; END IF;
  SELECT * INTO f FROM factories WHERE id = r.entity_id FOR UPDATE;
  IF f.id IS NULL THEN RETURN v_set; END IF;
  v := r.facts;
  v_as_of := CASE WHEN v->>'asOf' ~ '^\d{4}-\d{2}-\d{2}$' THEN (v->>'asOf')::date END;

  -- The crosswalk: this source's id for the plant. A row left behind by a
  -- record that no longer exists gives the id up first.
  IF NOT EXISTS (SELECT 1 FROM external_references x
                 WHERE x.source = s.ref_source AND x.entity_type = 'factories' AND x.external_id = r.source_id
                   AND NOT x.duplicate AND EXISTS (SELECT 1 FROM factories y WHERE y.id = x.entity_id)) THEN
    DELETE FROM external_references x
      WHERE x.source = s.ref_source AND x.entity_type = 'factories' AND x.external_id = r.source_id AND NOT x.duplicate;
    INSERT INTO external_references (entity_type, entity_id, source, external_id, url, run_id)
      VALUES ('factories', f.id, s.ref_source, r.source_id, NULLIF(v->>'url', ''), p_run)
      RETURNING id INTO v_ref;
    INSERT INTO intake_changes (run_id, review_id, op, entity_id, after)
      VALUES (p_run, p_review, 'id', f.id, jsonb_build_object('ref', v_ref, 'source', s.ref_source, 'external_id', r.source_id));
  END IF;

  FOREACH v_fact IN ARRAY ARRAY['industry', 'address', 'city', 'zip', 'coordinates', 'headcount', 'products', 'opened', 'status'] LOOP
    v_cand := NULL;
    v_fact_as_of := v_as_of;
    CASE v_fact
      WHEN 'industry' THEN
        v_key := 'primary_naics';
        IF NULLIF(btrim(v->>'naics'), '') IS NOT NULL THEN
          v_cand := jsonb_build_object('primary_naics', left(btrim(v->>'naics'), 6),
            'primary_naics_description', coalesce(NULLIF(btrim(v->>'industry'), ''), f.primary_naics_description));
        END IF;
      WHEN 'address' THEN
        v_key := 'address';
        IF NULLIF(btrim(v->>'address'), '') IS NOT NULL THEN v_cand := jsonb_build_object('address', btrim(v->>'address')); END IF;
      WHEN 'city' THEN
        v_key := 'city';
        IF NULLIF(btrim(v->>'city'), '') IS NOT NULL THEN v_cand := jsonb_build_object('city', btrim(v->>'city')); END IF;
      WHEN 'zip' THEN
        v_key := 'zip_code';
        IF NULLIF(btrim(v->>'zip'), '') IS NOT NULL THEN v_cand := jsonb_build_object('zip_code', left(btrim(v->>'zip'), 10)); END IF;
      WHEN 'coordinates' THEN
        v_key := 'latitude';
        IF v->>'latitude' ~ '^-?\d+(\.\d+)?$' AND v->>'longitude' ~ '^-?\d+(\.\d+)?$' THEN
          v_cand := jsonb_build_object('latitude', v->>'latitude', 'longitude', v->>'longitude');
        END IF;
      WHEN 'headcount' THEN
        v_key := 'workforce_size';
        IF v->>'people' ~ '^\d{1,7}$' THEN
          v_cand := jsonb_build_object('workforce_size', (v->>'people')::integer,
            'workforce_year', CASE WHEN v->>'peopleYear' ~ '^\d{4}$' THEN (v->>'peopleYear')::integer END,
            'workforce_source', NULLIF(v->>'peopleSource', ''), 'workforce_note', NULLIF(v->>'peopleNote', ''));
          IF v->>'peopleYear' ~ '^\d{4}$' THEN v_fact_as_of := make_date((v->>'peopleYear')::integer, 12, 31); END IF;
        END IF;
      WHEN 'products' THEN
        v_key := 'products';
        IF NULLIF(btrim(v->>'products'), '') IS NOT NULL THEN v_cand := jsonb_build_object('products', btrim(v->>'products')); END IF;
      WHEN 'opened' THEN
        v_key := 'opened_year';
        IF v->>'opened' ~ '^\d{4}$' THEN v_cand := jsonb_build_object('opened_year', (v->>'opened')::integer); END IF;
      WHEN 'status' THEN
        v_key := 'status';
        IF v->>'status' IN ('operating', 'under construction') THEN v_cand := jsonb_build_object('status', v->>'status'); END IF;
    END CASE;
    CONTINUE WHEN v_cand IS NULL;

    -- What the plant has for those columns. Nothing to do when it is the same.
    SELECT jsonb_object_agg(k, to_jsonb(f)->k) INTO v_cur FROM jsonb_object_keys(v_cand) k;
    CONTINUE WHEN v_cur = v_cand;

    prov := NULL;
    SELECT * INTO prov FROM fact_sources WHERE factory_id = f.id AND fact = v_fact;
    v_cur_as_of := coalesce(prov.as_of, CASE WHEN v_fact = 'headcount' AND f.workforce_year IS NOT NULL THEN make_date(f.workforce_year, 12, 31) END);
    IF NOT intake_fact_wins(
         s.fill, coalesce((s.ranks->>v_fact)::integer, s.rank::integer), v_fact_as_of,
         NULLIF(btrim(coalesce(v_cur->>v_key, '')), '') IS NULL,
         prov.source, coalesce(prov.rank::integer, CASE WHEN f.curated THEN 80 ELSE 10 END), v_cur_as_of) THEN
      CONTINUE;
    END IF;

    v_patch := v_patch || v_cand;
    v_set := v_set || v_fact;
    v_said := v_said || CASE v_fact
      WHEN 'industry' THEN concat_ws(' ', 'industry', v_cand->>'primary_naics', '(' || (v_cand->>'primary_naics_description') || ')')
      WHEN 'headcount' THEN concat_ws(' ', 'people', v_cand->>'workforce_size', '(' || (v_cand->>'workforce_year') || ')')
      WHEN 'coordinates' THEN format('coordinates %s, %s', v_cand->>'latitude', v_cand->>'longitude')
      ELSE v_fact || ' ' || (v_cand->>v_key) END;
    INSERT INTO intake_changes (run_id, review_id, op, entity_id, fact, before, after, before_source)
      VALUES (p_run, p_review, 'fact', f.id, v_fact, v_cur, v_cand, CASE WHEN prov.factory_id IS NOT NULL THEN to_jsonb(prov) END);
    INSERT INTO fact_sources (factory_id, fact, source, rank, as_of, run_id, source_id, set_by, set_at)
      VALUES (f.id, v_fact, s.slug, coalesce((s.ranks->>v_fact)::integer, s.rank::integer), v_fact_as_of, p_run, r.source_id, p_actor, now())
    ON CONFLICT (factory_id, fact) DO UPDATE
      SET source = EXCLUDED.source, rank = EXCLUDED.rank, as_of = EXCLUDED.as_of, run_id = EXCLUDED.run_id,
          source_id = EXCLUDED.source_id, set_by = EXCLUDED.set_by, set_at = EXCLUDED.set_at;
  END LOOP;

  IF v_patch <> '{}'::jsonb THEN
    UPDATE factories t SET
      primary_naics = n.primary_naics, primary_naics_description = n.primary_naics_description,
      address = n.address, city = n.city, zip_code = n.zip_code, latitude = n.latitude, longitude = n.longitude,
      workforce_size = n.workforce_size, workforce_year = n.workforce_year, workforce_source = n.workforce_source,
      workforce_note = n.workforce_note, products = n.products, opened_year = n.opened_year, status = n.status,
      updated_at = now()
    FROM jsonb_populate_record(NULL::factories, to_jsonb(f) || v_patch) n
    WHERE t.id = f.id;
    -- A plant this run added came with its facts: its one line is "added".
    IF NOT EXISTS (SELECT 1 FROM intake_changes c WHERE c.run_id = p_run AND c.op = 'plant' AND c.entity_id = f.id) THEN
      INSERT INTO load_log (load, kind, action, look, company, plant, detail, run_id, source_id, entity_id)
        VALUES (s.slug, 'plant', 'filled', false, (SELECT name FROM companies WHERE id = f.company_id), f.name,
                array_to_string(v_said, '; '), p_run, r.source_id, f.id);
    END IF;
  END IF;

  -- The record has a code for the plant's industry that is not written: said once for each version of the record.
  IF NULLIF(v->>'industryNote', '') IS NOT NULL AND f.primary_naics IS NULL AND NOT ('industry' = ANY (v_set))
     AND r.applied_hash IS DISTINCT FROM r.hash THEN
    INSERT INTO load_log (load, kind, action, look, company, plant, detail, run_id, source_id, entity_id)
      VALUES (s.slug, 'plant', 'not filled', true, (SELECT name FROM companies WHERE id = f.company_id), f.name,
              'industry: ' || (v->>'industryNote'), p_run, r.source_id, f.id);
  END IF;

  UPDATE intake_links SET applied_hash = r.hash, applied_run_id = p_run WHERE source = p_source AND source_id = p_source_id;
  RETURN v_set;
END $f$;

-- Adds a staged record as a new plant, for a source whose records with no
-- candidate are added. Its company is found by exact name or other name, in
-- any letter case (the employer loader's rule), or created. Returns the
-- plant's id, or null with a line in load_log when it cannot be added: no
-- name, company, state or coordinates; Puerto Rico; construction materials.
CREATE OR REPLACE FUNCTION intake_add_plant(p_source text, p_source_id text, p_run bigint, p_review bigint DEFAULT NULL, p_actor uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE
  s intake_sources%ROWTYPE;
  r intake_staged%ROWTYPE;
  v jsonb;
  v_name text;
  v_company text;
  v_why text;
  v_found integer;
  k uuid;
  v_fid uuid;
BEGIN
  SELECT * INTO s FROM intake_sources WHERE slug = p_source;
  PERFORM 1 FROM intake_links WHERE source = p_source AND source_id = p_source_id FOR UPDATE;
  SELECT * INTO r FROM intake_staged WHERE source = p_source AND source_id = p_source_id;
  IF s.slug IS NULL OR r.source IS NULL THEN RETURN NULL; END IF;
  v := r.facts;
  v_name := NULLIF(btrim(v->>'name'), '');
  v_company := NULLIF(btrim(v->>'company'), '');
  v_why := CASE
    WHEN v_name IS NULL THEN 'the record has no name'
    WHEN v_company IS NULL THEN 'the record names no company'
    WHEN NOT (coalesce(v->>'latitude', '') ~ '^-?\d+(\.\d+)?$' AND coalesce(v->>'longitude', '') ~ '^-?\d+(\.\d+)?$') THEN 'the record has no coordinates'
    WHEN coalesce(v->>'state', '') !~ '^[A-Z]{2}$' THEN 'the record has no state'
    WHEN v->>'state' = 'PR' THEN 'Puerto Rico is not covered'
    WHEN v->>'naics' ~ '^(32732|32733|32739|324121)' THEN 'construction materials are not covered'
  END;
  IF v_why IS NOT NULL THEN
    UPDATE intake_links SET resolution = 'held', resolved_run_id = p_run WHERE source = p_source AND source_id = p_source_id;
    INSERT INTO load_log (load, kind, action, look, company, plant, detail, run_id, source_id)
      VALUES (s.slug, 'plant', 'held', true, v_company, v_name, 'not added: ' || v_why, p_run, r.source_id);
    RETURN NULL;
  END IF;

  -- The company: the row named as the record names it before one known by that name, then the fullest row.
  SELECT count(*) INTO v_found FROM companies co
    WHERE lower(co.name) = lower(v_company) OR EXISTS (SELECT 1 FROM unnest(co.aliases) a WHERE lower(a) = lower(v_company));
  SELECT co.id INTO k FROM companies co
    WHERE lower(co.name) = lower(v_company) OR EXISTS (SELECT 1 FROM unnest(co.aliases) a WHERE lower(a) = lower(v_company))
    ORDER BY (lower(co.name) = lower(v_company)) DESC, co.featured DESC,
             (SELECT count(*) FROM factories x WHERE x.company_id = co.id) DESC, co.created_at, co.id
    LIMIT 1;
  IF k IS NULL THEN
    INSERT INTO companies (name) VALUES (v_company) RETURNING id INTO k;
    INSERT INTO intake_changes (run_id, review_id, op, entity_id, after) VALUES (p_run, p_review, 'company', k, jsonb_build_object('name', v_company));
    INSERT INTO load_log (load, kind, action, look, company, detail, run_id, source_id, entity_id)
      VALUES (s.slug, 'company', 'created', false, v_company, NULL, p_run, r.source_id, k);
  END IF;

  -- One company does not have two plants of one name in one state: that row is the plant.
  SELECT x.id INTO v_fid FROM factories x WHERE x.company_id = k AND x.state = v->>'state' AND lower(x.name) = lower(v_name) LIMIT 1;
  IF v_fid IS NULL THEN
    INSERT INTO factories (company_id, name, latitude, longitude, state)
      VALUES (k, v_name, v->>'latitude', v->>'longitude', v->>'state') RETURNING id INTO v_fid;
    INSERT INTO intake_changes (run_id, review_id, op, entity_id, after) VALUES (p_run, p_review, 'plant', v_fid, jsonb_build_object('name', v_name));
    -- Its place came with it.
    INSERT INTO fact_sources (factory_id, fact, source, rank, as_of, run_id, source_id, set_by)
      VALUES (v_fid, 'coordinates', s.slug, coalesce((s.ranks->>'coordinates')::integer, s.rank::integer),
              CASE WHEN v->>'asOf' ~ '^\d{4}-\d{2}-\d{2}$' THEN (v->>'asOf')::date END, p_run, r.source_id, p_actor);
    INSERT INTO load_log (load, kind, action, look, company, plant, detail, run_id, source_id, entity_id)
      VALUES (s.slug, 'plant', 'added', v_found > 1, v_company, v_name,
              CASE WHEN v_found > 1 THEN format('its company is found under %s rows; the fullest was taken', v_found) END, p_run, r.source_id, v_fid);
    UPDATE intake_links SET entity_id = v_fid, resolution = 'added', resolved_run_id = p_run WHERE source = p_source AND source_id = p_source_id;
  ELSE
    INSERT INTO load_log (load, kind, action, look, company, plant, detail, run_id, source_id, entity_id)
      VALUES (s.slug, 'plant', 'matched', false, v_company, v_name, 'its company already has a plant of this name in this state', p_run, r.source_id, v_fid);
    UPDATE intake_links SET entity_id = v_fid, resolution = 'matched', resolved_run_id = p_run WHERE source = p_source AND source_id = p_source_id;
  END IF;
  PERFORM intake_apply_record(p_source, p_source_id, p_run, p_review, p_actor);
  RETURN v_fid;
END $f$;

-- Takes back what a run changed, newest change first. A fact is restored
-- only where the plant still has the value the run gave it: a value changed
-- since (by an admin, or a later run) is kept and said so. A plant or
-- company the run added goes only when nothing has been hung on it since.
-- Returns what it did: { restored, kept, ids, plants, companies }.
CREATE OR REPLACE FUNCTION intake_undo_run(p_run bigint) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE
  c intake_changes%ROWTYPE;
  f factories%ROWTYPE;
  v_source text;
  v_restored integer := 0;
  v_kept integer := 0;
  v_ids integer := 0;
  v_plants integer := 0;
  v_companies integer := 0;
BEGIN
  SELECT source INTO v_source FROM intake_runs WHERE id = p_run;
  IF v_source IS NULL THEN RAISE EXCEPTION 'There is no run %.', p_run; END IF;
  FOR c IN SELECT * FROM intake_changes WHERE run_id = p_run AND undone_at IS NULL ORDER BY id DESC LOOP
    IF c.op = 'fact' THEN
      SELECT * INTO f FROM factories WHERE id = c.entity_id FOR UPDATE;
      IF f.id IS NOT NULL AND to_jsonb(f) @> c.after THEN
        UPDATE factories t SET
          primary_naics = n.primary_naics, primary_naics_description = n.primary_naics_description,
          address = n.address, city = n.city, zip_code = n.zip_code, latitude = n.latitude, longitude = n.longitude,
          workforce_size = n.workforce_size, workforce_year = n.workforce_year, workforce_source = n.workforce_source,
          workforce_note = n.workforce_note, products = n.products, opened_year = n.opened_year, status = n.status,
          updated_at = now()
        FROM jsonb_populate_record(NULL::factories, to_jsonb(f) || c.before) n
        WHERE t.id = f.id;
        DELETE FROM fact_sources WHERE factory_id = f.id AND fact = c.fact AND run_id = p_run;
        IF c.before_source IS NOT NULL THEN
          INSERT INTO fact_sources SELECT * FROM jsonb_populate_record(NULL::fact_sources, c.before_source)
          ON CONFLICT (factory_id, fact) DO NOTHING;
        END IF;
        v_restored := v_restored + 1;
      ELSIF f.id IS NOT NULL THEN
        v_kept := v_kept + 1;
        INSERT INTO load_log (load, kind, action, look, plant, detail, run_id, entity_id)
          VALUES (v_source, 'plant', 'kept', true, f.name, format('%s was changed after the run and is left as it is', c.fact), p_run, f.id);
      END IF;
    ELSIF c.op = 'id' THEN
      DELETE FROM external_references WHERE id = (c.after->>'ref')::uuid AND run_id = p_run;
      IF FOUND THEN v_ids := v_ids + 1; END IF;
    ELSIF c.op = 'plant' THEN
      IF EXISTS (SELECT 1 FROM jobs j WHERE j.factory_id = c.entity_id) THEN
        v_kept := v_kept + 1;
        INSERT INTO load_log (load, kind, action, look, plant, detail, run_id, entity_id)
          VALUES (v_source, 'plant', 'kept', true, c.after->>'name', 'a job was posted at the plant the run added: it stays', p_run, c.entity_id);
      ELSE
        DELETE FROM external_references WHERE entity_type = 'factories' AND entity_id = c.entity_id;
        DELETE FROM factories WHERE id = c.entity_id;
        IF FOUND THEN v_plants := v_plants + 1; END IF;
      END IF;
    ELSIF c.op = 'company' THEN
      IF NOT EXISTS (SELECT 1 FROM factories x WHERE x.company_id = c.entity_id)
         AND NOT EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.entity_id)
         AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.company_id = c.entity_id) THEN
        DELETE FROM external_references WHERE entity_type = 'companies' AND entity_id = c.entity_id;
        DELETE FROM companies WHERE id = c.entity_id;
        IF FOUND THEN v_companies := v_companies + 1; END IF;
      ELSE
        v_kept := v_kept + 1;
      END IF;
    END IF;
    UPDATE intake_changes SET undone_at = now() WHERE id = c.id;
  END LOOP;

  -- The run's decisions go with its changes: what it resolved is unresolved, what it queued is withdrawn.
  UPDATE intake_links SET entity_id = NULL, resolution = NULL, resolved_run_id = NULL
    WHERE source = v_source AND resolved_run_id = p_run;
  UPDATE intake_links SET applied_hash = NULL, applied_run_id = NULL
    WHERE source = v_source AND applied_run_id = p_run;
  UPDATE intake_review SET status = 'withdrawn', decided_at = now() WHERE run_id = p_run AND status = 'waiting';
  RETURN jsonb_build_object('restored', v_restored, 'kept', v_kept, 'ids', v_ids, 'plants', v_plants, 'companies', v_companies);
END $f$;
