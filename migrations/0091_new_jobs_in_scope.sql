-- New jobs are ported from the states an employer's line names.
--
-- The registry of employers' boards (data/employers/boards.json) says where
-- NEW jobs are ported from: "states", the file's own (Texas) for every line,
-- or a line's own where it says otherwise. The runner writes them onto the
-- source's row at every run (intake_sources.states; scripts/ingest/postings/
-- jobs.mjs, scopeSource), and the two functions that decide a job read them
-- there, so the rule holds wherever a job is decided: a run, a place an admin
-- points in Admin Tools, a place the data decides (places.json).
--
-- The rule looks forward only. For a place outside the states it is "keep what
-- is there, add nothing":
--   a job of ours that already exists there is tended exactly as before:
--     brought in line with its posting, closed only when its posting is gone
--     from two complete listings, reopened if it returns, expiring as before;
--   no new job is made there;
--   no place there waits for a person: one that waited leaves the list at the
--     source's next run (journalled, so undoing the run puts it back).
-- A posting with places inside and outside the states becomes new jobs at the
-- places inside only. A source whose row names no states (null) ports from
-- everywhere, as before.
--
-- This migration closes no job, deletes no job, and changes none: it adds one
-- column and replaces two functions. posting_decide is not touched (it is
-- restated by the generated posting-places migrations, scripts/posting-decide.sql):
-- it still says where every staged posting is, and the two functions below
-- leave out the rows the rule sets aside. Hand-written; safe to run again.

-- Where a source's new jobs are ported from: two-letter state codes, or null
-- for everywhere. Every source of jobs that exists when the column is first
-- added is given the registry's states as they stand in this change (Texas),
-- so the rule holds from this migration on and not only from each source's
-- next run; the runner writes each line's own from then on. Only then: a
-- second run of this file leaves the column as the runner has it.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = current_schema() AND table_name = 'intake_sources' AND column_name = 'states') THEN
    ALTER TABLE intake_sources ADD COLUMN states text[];
    UPDATE intake_sources SET states = ARRAY['TX'] WHERE kind = 'job';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Resolve: the places that wait (0054's, with the rule)
-- ---------------------------------------------------------------------------

-- posting_resolve as migration 0054 wrote it, with one step more: of what
-- posting_decide says, a place outside the source's states is kept only where
-- a job of ours already stands at it for that posting (it has a plant and its
-- outside id, "<posting id>@<place key>", names a job). Every other place
-- outside them is set aside before anything is counted or listed: it does not
-- wait, and a place there that waited leaves the list. `outside` in the answer
-- is how many postings' places were set aside.
CREATE OR REPLACE FUNCTION posting_resolve(p_source text, p_run bigint) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE
  v_company text;
  v_named integer;
  v_nil constant uuid := '00000000-0000-0000-0000-000000000000';
  v_states text[];
  v_ref text;
  r record;
  n_new integer := 0;
  n_outside integer := 0;
BEGIN
  SELECT company, states, ref_source INTO v_company, v_states, v_ref FROM intake_sources WHERE slug = p_source AND kind = 'job';
  IF NOT FOUND THEN RAISE EXCEPTION '% is not a source of job postings.', p_source; END IF;
  SELECT count(*) FILTER (WHERE named) INTO v_named FROM posting_companies(p_source);
  IF v_named = 0 THEN
    INSERT INTO load_log (load, kind, action, look, company, detail, run_id)
      VALUES (p_source, 'company', 'not listed', true, v_company, 'the registry names a company we do not list: no posting can be placed', p_run);
    RETURN jsonb_build_object('company', false);
  END IF;
  -- A name on one row and the same name as another row's other name: two rows for one company.
  IF (SELECT count(*) FROM companies c WHERE lower(c.name) = lower(v_company)
        OR EXISTS (SELECT 1 FROM unnest(c.aliases) a WHERE lower(a) = lower(v_company))) > 1
     AND NOT EXISTS (SELECT 1 FROM load_log WHERE load = p_source AND action = 'two rows') THEN
    INSERT INTO load_log (load, kind, action, look, company, detail, run_id)
      VALUES (p_source, 'company', 'two rows', true, v_company, 'more than one company row answers to this name: the plants of all of them are used; merge them', p_run);
  END IF;
  INSERT INTO load_log (load, kind, action, look, company, detail, run_id)
    SELECT p_source, 'company', 'not listed', true, n, 'the registry also names this company, which we do not list', p_run
    FROM intake_sources s, unnest(coalesce(s.also, '{}')) n
    WHERE s.slug = p_source
      AND NOT EXISTS (SELECT 1 FROM companies c WHERE lower(c.name) = lower(btrim(n)) OR EXISTS (SELECT 1 FROM unnest(c.aliases) a WHERE lower(a) = lower(btrim(n))))
      AND NOT EXISTS (SELECT 1 FROM load_log l WHERE l.load = p_source AND l.action = 'not listed' AND l.company = n);

  DROP TABLE IF EXISTS posting_decided;
  CREATE TEMP TABLE posting_decided ON COMMIT DROP AS SELECT * FROM posting_decide(p_source);

  -- Where new jobs are ported from (0091). A place outside the source's states stands only where a job of ours is
  -- already there for the posting; every other one is set aside: it makes no job and does not wait.
  IF v_states IS NOT NULL THEN
    DELETE FROM posting_decided d
      WHERE NOT (d.state = ANY (v_states))
        AND (d.factory_id IS NULL OR NOT EXISTS (
              SELECT 1 FROM external_references x JOIN jobs j ON j.id = x.entity_id
              WHERE x.source = v_ref AND x.entity_type = 'jobs' AND NOT x.duplicate AND x.external_id = d.source_id || '@' || d.place_key));
    GET DIAGNOSTICS n_outside = ROW_COUNT;
  END IF;

  -- A place pointed at a plant that no longer exists waits again.
  FOR r IN SELECT pp.* FROM posting_places pp
           WHERE pp.source = p_source AND pp.status = 'pointed'
             AND NOT EXISTS (SELECT 1 FROM factories f WHERE f.id = record_now('factory', pp.factory_id)) LOOP
    INSERT INTO intake_changes (run_id, op, entity_id, fact, before) VALUES (p_run, 'place', v_nil, 'unpointed', to_jsonb(r));
    UPDATE posting_places SET status = 'waiting', factory_id = NULL, decided_by = NULL, decided_at = NULL
      WHERE source = p_source AND place_key = r.place_key;
  END LOOP;

  -- A waiting place that has a plant now, or that nothing names any more, leaves the list.
  FOR r IN SELECT pp.* FROM posting_places pp
           WHERE pp.source = p_source AND pp.status = 'waiting'
             AND NOT EXISTS (SELECT 1 FROM posting_decided d WHERE d.place_key = pp.place_key AND d.factory_id IS NULL) LOOP
    INSERT INTO intake_changes (run_id, op, entity_id, fact, before) VALUES (p_run, 'place', v_nil, 'placed', to_jsonb(r));
    DELETE FROM posting_places WHERE source = p_source AND place_key = r.place_key;
  END LOOP;

  -- A place with no plant that is not on the list yet.
  FOR r IN SELECT d.place_key, min(d.city) AS city, min(d.state) AS state, count(DISTINCT d.source_id)::integer AS postings
           FROM posting_decided d
           WHERE d.factory_id IS NULL AND NOT EXISTS (SELECT 1 FROM posting_places pp WHERE pp.source = p_source AND pp.place_key = d.place_key)
           GROUP BY d.place_key ORDER BY count(DISTINCT d.source_id) DESC, d.place_key LOOP
    INSERT INTO posting_places (source, place_key, city, state, status, run_id) VALUES (p_source, r.place_key, r.city, r.state, 'waiting', p_run);
    INSERT INTO intake_changes (run_id, op, entity_id, fact, after) VALUES (p_run, 'place', v_nil, 'waiting', jsonb_build_object('place_key', r.place_key));
    INSERT INTO load_log (load, kind, action, look, company, detail, run_id, evidence)
      VALUES (p_source, 'place', 'waiting', true, v_company,
              format('%s, %s: %s %s it and we list no plant of the company there', r.city, r.state, r.postings,
                     CASE WHEN r.postings = 1 THEN 'posting names' ELSE 'postings name' END),
              p_run, jsonb_build_object('place', r.place_key, 'postings', r.postings));
    n_new := n_new + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'company', true,
    'kept', (SELECT count(*) FROM intake_records WHERE source = p_source AND gone_run_id IS NULL),
    'placed', (SELECT count(DISTINCT source_id) FROM posting_decided WHERE factory_id IS NOT NULL AND occupation_id IS NOT NULL),
    'waiting', (SELECT count(DISTINCT d.source_id) FROM posting_decided d WHERE d.factory_id IS NULL
                  AND NOT EXISTS (SELECT 1 FROM posting_decided e WHERE e.source_id = d.source_id AND e.factory_id IS NOT NULL)),
    'waitingPlaces', (SELECT count(*) FROM posting_places WHERE source = p_source AND status = 'waiting'),
    'newPlaces', n_new,
    'noCareer', (SELECT count(DISTINCT source_id) FROM posting_decided WHERE occupation_id IS NULL),
    'outside', n_outside);
END $f$;

-- ---------------------------------------------------------------------------
-- Apply: the jobs (0054's, with the rule)
-- ---------------------------------------------------------------------------

-- posting_apply as migration 0054 wrote it, with one condition more on the
-- plan: a posting at a place becomes a job, or stays one, when the place is in
-- the source's states or a job of ours already stands there for it. So a job
-- outside the states is corrected, seen, closed and reopened exactly as
-- before, and no new one is made there. Nothing else is changed.
CREATE OR REPLACE FUNCTION posting_apply(p_source text, p_run bigint, p_place text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE
  v_ref text;
  v_gone constant text := 'No longer on the company''s careers site';
  v_ttl constant interval := interval '14 days';
  v_complete boolean;
  v_states text[];
  it record;
  v_job uuid;
  v_before jsonb;
  v_ref_id uuid;
  n_added integer := 0;
  n_changed integer := 0;
  n_reopened integer := 0;
  n_closed integer := 0;
  n_seen integer := 0;
BEGIN
  SELECT ref_source, states INTO v_ref, v_states FROM intake_sources WHERE slug = p_source AND kind = 'job';
  IF v_ref IS NULL THEN RAISE EXCEPTION '% is not a source of job postings.', p_source; END IF;
  -- Whether the run's listing was read to its end (a run from before this was recorded counts as complete).
  SELECT coalesce((counts->>'complete')::boolean, true) INTO v_complete FROM intake_runs WHERE id = p_run;
  v_complete := coalesce(v_complete, true);

  -- An id whose job is gone (its plant or company was deleted) names nothing.
  DELETE FROM external_references x
    WHERE x.source = v_ref AND x.entity_type = 'jobs' AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.id = x.entity_id);

  DROP TABLE IF EXISTS posting_plan;
  CREATE TEMP TABLE posting_plan ON COMMIT DROP AS
    SELECT d.source_id, d.place_key, d.city, d.state, d.how, d.metres, d.options,
           d.source_id || '@' || d.place_key AS ext,
           r.facts, posting_job_wanted(r.facts, d.company_id, d.factory_id, d.occupation_id, x.entity_id) AS want,
           x.entity_id AS job_id
    FROM posting_decide(p_source, p_place) d
    JOIN intake_records r ON r.source = p_source AND r.source_id = d.source_id
    LEFT JOIN external_references x ON x.source = v_ref AND x.entity_type = 'jobs' AND NOT x.duplicate
                                   AND x.external_id = d.source_id || '@' || d.place_key
    WHERE d.factory_id IS NOT NULL AND d.occupation_id IS NOT NULL
      -- Where new jobs are ported from (0091): a place outside the source's states is in the plan only where a job of
      -- ours already stands there for the posting. That job is tended as before; no new one is made.
      AND (v_states IS NULL OR d.state = ANY (v_states) OR x.entity_id IS NOT NULL);
  CREATE INDEX ON posting_plan (job_id);

  FOR it IN
    SELECT p.*, co.name AS company_name, f.name AS factory_name, f.workforce_size
    FROM posting_plan p
    JOIN factories f ON f.id = (p.want->>'factory_id')::uuid
    JOIN companies co ON co.id = f.company_id
    WHERE p.job_id IS NULL OR posting_job_snapshot(p.job_id) IS DISTINCT FROM p.want
    ORDER BY p.source_id, p.place_key
  LOOP
    IF it.job_id IS NULL THEN
      INSERT INTO jobs (company_id, factory_id, occupation_id, title, employment_type, pay_period, status,
                        posted_at, expires_at, source, source_id, last_seen_at)
        VALUES ((it.want->>'company_id')::uuid, (it.want->>'factory_id')::uuid, (it.want->>'occupation_id')::uuid, it.want->>'title', NULL, 'hour', 'open',
                coalesce((it.want->>'posted_at')::timestamp, now() AT TIME ZONE 'UTC'), (now() AT TIME ZONE 'UTC') + v_ttl, p_source, it.source_id, now())
        RETURNING id INTO v_job;
      PERFORM posting_job_write(v_job, it.want);
      INSERT INTO external_references (entity_type, entity_id, source, external_id, url, run_id)
        VALUES ('jobs', v_job, v_ref, it.ext, it.want->>'apply_url', p_run) RETURNING id INTO v_ref_id;
      UPDATE posting_plan SET job_id = v_job WHERE ext = it.ext;
      INSERT INTO intake_changes (run_id, op, entity_id, fact, after) VALUES (p_run, 'job', v_job, 'added', posting_job_snapshot(v_job));
      INSERT INTO intake_changes (run_id, op, entity_id, after) VALUES (p_run, 'id', v_job, jsonb_build_object('ref', v_ref_id));
      INSERT INTO load_log (load, kind, action, look, company, plant, detail, metres, run_id, source_id, entity_id, evidence)
        VALUES (p_source, 'job', 'added',
                it.how IN ('near', 'keeps'), it.company_name, it.factory_name,
                format('%s, at %s, %s: %s', it.want->>'title', it.city, it.state,
                       CASE it.how WHEN 'city' THEN 'the company''s one plant there'
                                  WHEN 'address' THEN format('of %s plants there, the one at the posting''s address', it.options)
                                  WHEN 'name' THEN format('of %s plants there, the one the posting names', it.options)
                                  WHEN 'largest' THEN format('of %s plants there, the largest', it.options)
                                  WHEN 'keeps' THEN format('of %s plants there, none with a headcount: the one the plant merge would keep (written from sources, then placed in a county, then more facts, then older)', it.options)
                                  WHEN 'near' THEN format('no plant in that city: the nearest, %s km from its centre', round(it.metres / 1000.0, 1))
                                  ELSE 'the plant an admin pointed the place at' END),
                it.metres, p_run, it.source_id, v_job,
                jsonb_build_object('how', it.how, 'options', it.options, 'career', it.facts->'reading'->'career'));
      n_added := n_added + 1;
    ELSE
      v_before := posting_job_snapshot(it.job_id);
      IF v_before IS NULL THEN CONTINUE; END IF;
      -- Closed by anyone but a run: it stays as it was left.
      IF v_before->>'status' <> 'open' AND v_before->>'closed_reason' IS DISTINCT FROM v_gone THEN CONTINUE; END IF;
      INSERT INTO intake_changes (run_id, op, entity_id, fact, before)
        SELECT p_run, 'job', j.id, CASE WHEN j.status = 'open' THEN 'changed' ELSE 'reopened' END,
               v_before || jsonb_build_object('seen', jsonb_build_array(j.last_seen_at, j.expires_at))
        FROM jobs j WHERE j.id = it.job_id;
      PERFORM posting_job_write(it.job_id, it.want);
      UPDATE jobs SET last_seen_at = now(), expires_at = (now() AT TIME ZONE 'UTC') + v_ttl WHERE id = it.job_id;
      UPDATE intake_changes SET after = posting_job_snapshot(it.job_id)
        WHERE run_id = p_run AND op = 'job' AND entity_id = it.job_id AND after IS NULL;
      INSERT INTO load_log (load, kind, action, look, company, plant, detail, run_id, source_id, entity_id, evidence)
        VALUES (p_source, 'job', CASE WHEN v_before->>'status' = 'open' THEN 'changed' ELSE 'reopened' END, false, it.company_name, it.factory_name,
                format('%s, at %s, %s: %s', it.want->>'title', it.city, it.state,
                       CASE WHEN v_before->>'status' = 'open'
                            THEN 'the posting changed: ' || coalesce((SELECT string_agg(k, ', ' ORDER BY k) FROM jsonb_object_keys(it.want) k
                                                                      WHERE v_before->k IS DISTINCT FROM it.want->k), 'nothing we keep')
                            ELSE 'the posting is on the company''s site again' END),
                p_run, it.source_id, it.job_id, NULL);
      IF v_before->>'status' = 'open' THEN n_changed := n_changed + 1; ELSE n_reopened := n_reopened + 1; END IF;
    END IF;
  END LOOP;

  IF p_place IS NULL THEN
    -- The open jobs of the source that no posting stands behind any more. One whose posting
    -- went missing in this very run waits for the next complete listing: a board can drop a
    -- posting for a day. A posting is only ever marked missing by a complete listing, and a job
    -- is closed for it only by a later complete one.
    FOR it IN
      SELECT j.id, j.title, j.source_id, j.last_seen_at, j.expires_at, co.name AS company_name, f.name AS factory_name,
             r.gone_run_id IS NOT NULL AS left_site
      FROM jobs j
      JOIN factories f ON f.id = j.factory_id
      JOIN companies co ON co.id = j.company_id
      LEFT JOIN intake_records r ON r.source = p_source AND r.source_id = j.source_id
      WHERE j.source = p_source AND j.status = 'open'
        AND NOT EXISTS (SELECT 1 FROM posting_plan p WHERE p.job_id = j.id)
        AND (r.gone_run_id IS NULL OR (v_complete AND r.gone_run_id < p_run))
      ORDER BY j.id
    LOOP
      INSERT INTO intake_changes (run_id, op, entity_id, fact, before)
        VALUES (p_run, 'job', it.id, 'closed', posting_job_snapshot(it.id) || jsonb_build_object('seen', jsonb_build_array(it.last_seen_at, it.expires_at)));
      UPDATE jobs SET status = 'closed', closed_reason = v_gone, updated_at = now() WHERE id = it.id;
      UPDATE intake_changes SET after = posting_job_snapshot(it.id) WHERE run_id = p_run AND op = 'job' AND entity_id = it.id AND after IS NULL;
      INSERT INTO load_log (load, kind, action, look, company, plant, detail, run_id, source_id, entity_id)
        VALUES (p_source, 'job', 'closed', false, it.company_name, it.factory_name,
                format('%s: %s', it.title, CASE WHEN it.left_site THEN 'gone from two complete listings of the company''s site running'
                                               ELSE 'the posting no longer names this place, or its plant or career is gone' END),
                p_run, it.source_id, it.id);
      n_closed := n_closed + 1;
    END LOOP;
  END IF;

  -- Seen: once a day, for the jobs that are as they should be, and only by a listing read to its end.
  IF v_complete AND p_place IS NULL THEN
    UPDATE jobs j SET last_seen_at = now(), expires_at = (now() AT TIME ZONE 'UTC') + v_ttl
      FROM posting_plan p
      WHERE j.id = p.job_id AND j.status = 'open' AND (j.last_seen_at IS NULL OR j.last_seen_at < now() - interval '12 hours');
    GET DIAGNOSTICS n_seen = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('added', n_added, 'changed', n_changed, 'reopened', n_reopened, 'closed', n_closed, 'seen', n_seen,
                            'open', (SELECT count(*) FROM jobs WHERE source = p_source AND status = 'open'));
END $f$;
