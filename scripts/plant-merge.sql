-- One row for one plant: what stays in the database so that a migration, the
-- intake runner and Admin Tools merge two plant rows by one rule.
--
--   plant_keeps(a, b)          which of two rows that are one plant is the one to keep
--   plant_merge_takes(k, g)    the facts the kept row would take from the other
--   plant_merge(keep, gone …)  folds one row into the other and says so in load_log
--   plants_apart               pairs an admin said are two plants
--
-- Additive and safe to run again. scripts/build-duplicates-sql.mjs puts this
-- file into the migration; scripts/ingest/README.md describes it.

-- Two plants an admin looked at and said are two plants: they are not offered
-- as one again, by the cleanup or by the lists in Admin Tools. The lower id
-- is always `a_id`.
CREATE TABLE IF NOT EXISTS plants_apart (
  a_id uuid NOT NULL REFERENCES factories(id) ON DELETE CASCADE,
  b_id uuid NOT NULL REFERENCES factories(id) ON DELETE CASCADE,
  decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (a_id, b_id),
  CHECK (a_id < b_id)
);
CREATE INDEX IF NOT EXISTS plants_apart_b_idx ON plants_apart (b_id);

-- A decision is found by the plant it is about (Admin Tools reads why a pair waits).
CREATE INDEX IF NOT EXISTS load_log_entity_idx ON load_log (entity_id) WHERE entity_id IS NOT NULL;
-- The few staged records an admin said are not some plant, found by that plant.
CREATE INDEX IF NOT EXISTS intake_links_not_ids_idx ON intake_links USING gin (not_ids) WHERE not_ids <> '{}';

-- Of two rows that are one plant, the one to keep: the one written from
-- sources; else the one with a headcount; else the one placed in a county
-- (its coordinates agree with its state); else the one with more facts filled
-- in; else the older; else the lower id. Its name is the name that stays.
CREATE OR REPLACE FUNCTION plant_keeps(p_a uuid, p_b uuid) RETURNS uuid LANGUAGE sql STABLE AS $f$
  SELECT f.id FROM factories f WHERE f.id IN (p_a, p_b)
  ORDER BY f.curated DESC, (f.workforce_size IS NOT NULL) DESC, (f.county_fips IS NOT NULL) DESC,
           ((NULLIF(btrim(f.address), '') IS NOT NULL)::int + (NULLIF(btrim(f.city), '') IS NOT NULL)::int
            + (NULLIF(btrim(f.zip_code), '') IS NOT NULL)::int + (f.primary_naics IS NOT NULL)::int
            + (f.primary_naics_description IS NOT NULL)::int + (NULLIF(btrim(f.products), '') IS NOT NULL)::int
            + (f.opened_year IS NOT NULL)::int) DESC,
           f.created_at, f.id
  LIMIT 1
$f$;

-- The facts the kept row takes from the other, in fact_sources' words: only
-- where its own is empty, and never one an admin emptied on purpose.
CREATE OR REPLACE FUNCTION plant_merge_takes(p_keep uuid, p_gone uuid) RETURNS text[] LANGUAGE sql STABLE AS $f$
  SELECT coalesce(array_agg(t.fact ORDER BY t.ord), '{}')
  FROM factories k, factories g,
       LATERAL (VALUES
         -- A post office box alone is not where a plant is: the other row's street address is taken over it,
         -- unless the kept row was written from sources.
         (1, 'address', NULLIF(btrim(g.address), '') IS NOT NULL AND g.address !~* '^\s*(p\.?\s*o\.?\s*)?box\s+[0-9a-z]+\s*$'
                        AND (NULLIF(btrim(k.address), '') IS NULL OR (NOT k.curated AND k.address ~* '^\s*(p\.?\s*o\.?\s*)?box\s+[0-9a-z]+\s*$'))),
         (2, 'city', NULLIF(btrim(k.city), '') IS NULL AND NULLIF(btrim(g.city), '') IS NOT NULL),
         (3, 'zip', NULLIF(btrim(k.zip_code), '') IS NULL AND NULLIF(btrim(g.zip_code), '') IS NOT NULL),
         -- The industry's name; and its code, where the code belongs to the name the kept row ends up with.
         (4, 'industry', (k.primary_naics_description IS NULL AND g.primary_naics_description IS NOT NULL)
                         OR (k.primary_naics IS NULL AND g.primary_naics IS NOT NULL
                             AND (k.primary_naics_description IS NULL OR g.primary_naics_description IS NULL
                                  OR g.primary_naics_description = k.primary_naics_description))),
         (5, 'headcount', k.workforce_size IS NULL AND g.workforce_size IS NOT NULL),
         (6, 'products', NULLIF(btrim(k.products), '') IS NULL AND NULLIF(btrim(g.products), '') IS NOT NULL),
         (7, 'opened', k.opened_year IS NULL AND g.opened_year IS NOT NULL)
       ) AS t(ord, fact, takes)
  WHERE k.id = p_keep AND g.id = p_gone AND t.takes
    AND NOT EXISTS (SELECT 1 FROM fact_sources s WHERE s.factory_id = k.id AND s.fact = t.fact AND s.source = 'admin')
$f$;

-- Folds plant `p_gone` into plant `p_keep`. The kept row keeps its name, its
-- company, its place and every fact it has, and takes the other's where its
-- own are empty (plant_merge_takes). It is curated if either was. Where each
-- fact came from follows the fact (fact_sources; a fact taken that had no
-- origin on record is marked 'merged', at the rank it had where it was).
--
-- Everything attached moves: jobs (which then belong to the kept plant's
-- company), careers recorded at the plant, citations, every outside id (the
-- kept plant then holds an id the two shared once, and that row is no longer
-- marked `duplicate`), staged records resolved to the plant and matches
-- waiting on it, and what an admin said the plant is not. Requests to add a
-- plant name a company and a place, never a plant row: there is nothing of
-- theirs to move.
--
-- It writes record_merges, so record_now('factory', <old id>) leads to the
-- kept plant, and one line in load_log: the row kept, why (`p_why`), what was
-- taken and what moved. Returns the same as jsonb.
--
--   p_via   who merged: 'admin', 'cleanup' (a migration, named in p_load) or 'run'
--   p_load  the load the log line is filed under
-- Refused (nothing changes): a plant into itself (PM400), a row that is not
-- there (PM404), and a plant written from sources into one that was not
-- (PM409): that merge is made the other way round.
CREATE OR REPLACE FUNCTION plant_merge(
  p_keep uuid, p_gone uuid, p_via text DEFAULT 'admin', p_actor uuid DEFAULT NULL, p_load text DEFAULT 'plant-merge',
  p_why text DEFAULT NULL, p_look boolean DEFAULT false, p_run bigint DEFAULT NULL, p_evidence jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE
  k factories%ROWTYPE;
  g factories%ROWTYPE;
  v_takes text[];
  v_fact text;
  v_metres integer;
  v_jobs integer := 0;
  v_careers integer := 0;
  v_citations integer := 0;
  v_ids integer := 0;
  v_shared integer := 0;
  v_records integer := 0;
  v_moved jsonb;
  v_said text[] := '{}';
  v_company text;
  v_gone_company text;
BEGIN
  IF p_keep IS NULL OR p_gone IS NULL OR p_keep = p_gone THEN
    RAISE EXCEPTION USING ERRCODE = 'PM400', MESSAGE = 'Choose a different plant to merge into.';
  END IF;
  -- Both rows are held, in one order, so two merges cannot cross.
  PERFORM 1 FROM factories WHERE id IN (p_keep, p_gone) ORDER BY id FOR UPDATE;
  SELECT * INTO k FROM factories WHERE id = p_keep;
  SELECT * INTO g FROM factories WHERE id = p_gone;
  IF g.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'PM404', MESSAGE = 'Plant not found'; END IF;
  IF k.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'PM404', MESSAGE = 'The plant to merge into was not found.'; END IF;
  IF g.curated AND NOT k.curated THEN
    RAISE EXCEPTION USING ERRCODE = 'PM409',
      MESSAGE = format('%s was written from sources and %s was not: keep %s and merge the other into it.', g.name, k.name, g.name);
  END IF;

  v_takes := plant_merge_takes(p_keep, p_gone);
  v_metres := CASE WHEN k.lat IS NOT NULL AND k.lng IS NOT NULL AND g.lat IS NOT NULL AND g.lng IS NOT NULL
    THEN round(sqrt(power((k.lat - g.lat) * 111320, 2) + power((k.lng - g.lng) * 111320 * cos(radians(k.lat)), 2)))::integer END;
  SELECT name INTO v_company FROM companies WHERE id = k.company_id;
  SELECT name INTO v_gone_company FROM companies WHERE id = g.company_id;

  -- Where each fact taken came from goes with it.
  FOREACH v_fact IN ARRAY v_takes LOOP
    DELETE FROM fact_sources WHERE factory_id = p_keep AND fact = v_fact;
    UPDATE fact_sources SET factory_id = p_keep WHERE factory_id = p_gone AND fact = v_fact;
    IF NOT FOUND THEN
      INSERT INTO fact_sources (factory_id, fact, source, rank, as_of, set_by)
        VALUES (p_keep, v_fact, 'merged', CASE WHEN g.curated THEN 80 ELSE 10 END,
                CASE WHEN v_fact = 'headcount' AND g.workforce_year IS NOT NULL THEN make_date(g.workforce_year, 12, 31) END, p_actor);
    END IF;
    -- A run that set the fact on the row that is going can still take it back from the row that has it now.
    UPDATE intake_changes SET entity_id = p_keep WHERE entity_id = p_gone AND op = 'fact' AND fact = v_fact AND undone_at IS NULL;
  END LOOP;

  -- Jobs: at the kept plant, for the kept plant's company.
  UPDATE jobs SET factory_id = p_keep, company_id = COALESCE(k.company_id, company_id), updated_at = now() WHERE factory_id = p_gone;
  GET DIAGNOSTICS v_jobs = ROW_COUNT;
  -- Careers recorded at the plant: the kept row's own line stands where both have one.
  UPDATE factory_occupations x SET factory_id = p_keep WHERE x.factory_id = p_gone
    AND NOT EXISTS (SELECT 1 FROM factory_occupations y WHERE y.factory_id = p_keep AND y.occupation_id = x.occupation_id);
  GET DIAGNOSTICS v_careers = ROW_COUNT;

  -- Citations: one per source address.
  DELETE FROM external_references x WHERE x.entity_type = 'factories' AND x.entity_id = p_gone AND x.source = 'CURATED'
    AND EXISTS (SELECT 1 FROM external_references y WHERE y.entity_type = 'factories' AND y.entity_id = p_keep AND y.source = 'CURATED' AND y.url = x.url);
  UPDATE external_references SET entity_id = p_keep WHERE entity_type = 'factories' AND entity_id = p_gone AND source = 'CURATED';
  GET DIAGNOSTICS v_citations = ROW_COUNT;

  -- Outside ids. One the two rows shared is kept once, on the kept row; the rest move.
  DELETE FROM external_references x WHERE x.entity_type = 'factories' AND x.entity_id = p_gone AND x.source <> 'CURATED'
    AND EXISTS (SELECT 1 FROM external_references y WHERE y.entity_type = 'factories' AND y.entity_id = p_keep
                AND y.source = x.source AND y.external_id = x.external_id);
  GET DIAGNOSTICS v_shared = ROW_COUNT;
  UPDATE external_references SET entity_id = p_keep WHERE entity_type = 'factories' AND entity_id = p_gone AND source <> 'CURATED';
  GET DIAGNOSTICS v_ids = ROW_COUNT;
  -- A row left behind by a plant that no longer exists gives the id up, and an id only this plant now carries is no duplicate.
  DELETE FROM external_references y USING external_references x
    WHERE x.entity_type = 'factories' AND x.entity_id = p_keep AND x.source <> 'CURATED' AND x.duplicate
      AND y.entity_type = 'factories' AND y.source = x.source AND y.external_id = x.external_id AND y.id <> x.id
      AND NOT EXISTS (SELECT 1 FROM factories f WHERE f.id = y.entity_id);
  UPDATE external_references x SET duplicate = false
    WHERE x.entity_type = 'factories' AND x.entity_id = p_keep AND x.source <> 'CURATED' AND x.duplicate
      AND NOT EXISTS (SELECT 1 FROM external_references y WHERE y.entity_type = 'factories' AND y.source = x.source
                      AND y.external_id = x.external_id AND y.id <> x.id AND NOT y.duplicate);

  -- Intake: staged records resolved to the plant, matches waiting on it, and what an admin said it is not.
  UPDATE intake_links SET entity_id = p_keep WHERE entity_id = p_gone;
  GET DIAGNOSTICS v_records = ROW_COUNT;
  UPDATE intake_links SET not_ids = (SELECT coalesce(array_agg(DISTINCT CASE WHEN x = p_gone THEN p_keep ELSE x END), '{}') FROM unnest(not_ids) x)
    WHERE not_ids <> '{}' AND not_ids @> ARRAY[p_gone];
  UPDATE intake_review SET entity_id = p_keep WHERE entity_id = p_gone;
  UPDATE intake_review q SET candidates = (
      SELECT coalesce(jsonb_agg(c ORDER BY ord), '[]'::jsonb) FROM (
        SELECT DISTINCT ON (c->>'id') c, ord FROM (
          SELECT CASE WHEN e->>'id' = p_gone::text THEN e || jsonb_build_object('id', p_keep::text) ELSE e END AS c, ord
          FROM jsonb_array_elements(q.candidates) WITH ORDINALITY t(e, ord)) s
        ORDER BY c->>'id', ord) d)
    WHERE q.status = 'waiting' AND q.candidates @> jsonb_build_array(jsonb_build_object('id', p_gone::text));
  -- The old review list (migration 0009): the kept row's own line stands.
  UPDATE factory_review x SET factory_id = p_keep WHERE x.factory_id = p_gone
    AND NOT EXISTS (SELECT 1 FROM factory_review y WHERE y.factory_id = p_keep);
  -- What was said to be a different plant from the one going is a different plant from the one kept.
  INSERT INTO plants_apart (a_id, b_id, decided_by, decided_at)
    SELECT least(p_keep, o.other), greatest(p_keep, o.other), o.decided_by, o.decided_at
    FROM (SELECT CASE WHEN a_id = p_gone THEN b_id ELSE a_id END AS other, decided_by, decided_at
          FROM plants_apart WHERE a_id = p_gone OR b_id = p_gone) o
    WHERE o.other <> p_keep
  ON CONFLICT (a_id, b_id) DO NOTHING;

  -- The history: an id that pointed at the row that is going leads to the one kept.
  INSERT INTO record_merges (kind, from_id, into_id, from_name, via, run_id, actor_id, note)
    VALUES ('factory', p_gone, p_keep, g.name, p_via, p_run, p_actor, CASE WHEN p_via = 'admin' THEN NULL ELSE p_load END)
  ON CONFLICT (kind, from_id) DO NOTHING;

  DELETE FROM factories WHERE id = p_gone;

  UPDATE factories x SET
    address = CASE WHEN 'address' = ANY (v_takes) THEN g.address ELSE x.address END,
    city = CASE WHEN 'city' = ANY (v_takes) THEN g.city ELSE x.city END,
    zip_code = CASE WHEN 'zip' = ANY (v_takes) THEN g.zip_code ELSE x.zip_code END,
    primary_naics_description = CASE WHEN 'industry' = ANY (v_takes) THEN COALESCE(x.primary_naics_description, g.primary_naics_description) ELSE x.primary_naics_description END,
    primary_naics = CASE WHEN 'industry' = ANY (v_takes)
      THEN COALESCE(x.primary_naics, CASE WHEN g.primary_naics_description IS NULL
                                           OR g.primary_naics_description = COALESCE(x.primary_naics_description, g.primary_naics_description)
                                          THEN g.primary_naics END)
      ELSE x.primary_naics END,
    workforce_size = CASE WHEN 'headcount' = ANY (v_takes) THEN g.workforce_size ELSE x.workforce_size END,
    workforce_year = CASE WHEN 'headcount' = ANY (v_takes) THEN g.workforce_year ELSE x.workforce_year END,
    workforce_source = CASE WHEN 'headcount' = ANY (v_takes) THEN g.workforce_source ELSE x.workforce_source END,
    workforce_note = CASE WHEN 'headcount' = ANY (v_takes) THEN g.workforce_note ELSE x.workforce_note END,
    products = CASE WHEN 'products' = ANY (v_takes) THEN g.products ELSE x.products END,
    opened_year = CASE WHEN 'opened' = ANY (v_takes) THEN g.opened_year ELSE x.opened_year END,
    -- Not facts a source fills, and shown nowhere today: kept where the kept row has none.
    specialization = COALESCE(NULLIF(btrim(x.specialization), ''), g.specialization),
    description = COALESCE(NULLIF(btrim(x.description), ''), g.description),
    curated = x.curated OR g.curated,
    updated_at = now()
  WHERE x.id = p_keep;

  v_moved := jsonb_strip_nulls(jsonb_build_object(
    'jobs', NULLIF(v_jobs, 0), 'careers', NULLIF(v_careers, 0), 'citations', NULLIF(v_citations, 0),
    'ids', NULLIF(v_ids, 0), 'sharedIds', NULLIF(v_shared, 0), 'records', NULLIF(v_records, 0)));
  IF cardinality(v_takes) > 0 THEN v_said := v_said || ('Taken from it: ' || array_to_string(v_takes, ', ')); END IF;
  IF v_jobs > 0 THEN v_said := v_said || format('%s job%s moved', v_jobs, CASE WHEN v_jobs = 1 THEN '' ELSE 's' END); END IF;
  IF v_careers > 0 THEN v_said := v_said || format('%s career%s moved', v_careers, CASE WHEN v_careers = 1 THEN '' ELSE 's' END); END IF;
  IF v_citations > 0 THEN v_said := v_said || format('%s citation%s moved', v_citations, CASE WHEN v_citations = 1 THEN '' ELSE 's' END); END IF;
  IF v_ids > 0 THEN v_said := v_said || format('%s outside id%s moved', v_ids, CASE WHEN v_ids = 1 THEN '' ELSE 's' END); END IF;
  IF v_shared > 0 THEN v_said := v_said || format('%s shared id%s kept once', v_shared, CASE WHEN v_shared = 1 THEN '' ELSE 's' END); END IF;

  INSERT INTO load_log (load, kind, action, look, company, plant, detail, metres, run_id, entity_id, evidence)
    VALUES (p_load, 'plant', 'merged', p_look, v_company, k.name,
            format('kept, and "%s"%s merged into it%s. %s', g.name,
                   CASE WHEN g.company_id IS DISTINCT FROM k.company_id THEN format(' (filed under "%s")', coalesce(v_gone_company, 'no company')) ELSE '' END,
                   coalesce(': ' || p_why, ''),
                   CASE WHEN cardinality(v_said) > 0 THEN array_to_string(v_said, '; ') || '.' ELSE 'Nothing was taken from it.' END),
            v_metres, p_run, p_keep,
            coalesce(p_evidence, '{}'::jsonb) || jsonb_build_object(
              'merged', p_gone, 'mergedName', g.name, 'mergedCompany', v_gone_company, 'took', to_jsonb(v_takes), 'moved', v_moved));

  RETURN jsonb_build_object(
    'kept', jsonb_build_object('id', p_keep, 'name', k.name),
    'merged', jsonb_build_object('id', p_gone, 'name', g.name),
    'took', to_jsonb(v_takes), 'moved', v_moved, 'metres', v_metres);
END $f$;
