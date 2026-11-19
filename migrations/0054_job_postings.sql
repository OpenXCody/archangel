-- Jobs from employers' own public postings.
--
-- A posting an employer publishes on its careers site comes in through the
-- intake runner (scripts/ingest/run.mjs, sources of kind 'job') and lands as a
-- job: the same row a company's member posts, marked with the source it came
-- from. What is kept is facts and a link: the title, the career and level, the
-- plant, the skills and makes it asks for, its requirements, its pay when
-- stated, when it was posted and where to apply. Never the posting's text.
--
-- As with plants (0043) the runner orchestrates and the database decides:
-- posting_decide says which plant and career each staged posting is,
-- posting_resolve keeps the list of places that wait for a person,
-- posting_apply brings the jobs in line, and intake_undo_run takes a run
-- back. Admin Tools calls the same functions when an admin points a place at
-- a plant. scripts/ingest/README.md describes all of it.
--
-- Additive, quick (no table is rewritten: every new column is nullable; one
-- NOT NULL is dropped) and safe to run again. It loads no data.

-- ---------------------------------------------------------------------------
-- The crosswalk and the sources take jobs
-- ---------------------------------------------------------------------------

-- One outside id names one job: external_references rows of this kind. The
-- value is not used in this file (a new enum value cannot be, inside the
-- transaction that adds it).
ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'jobs';

-- A source describes plants or jobs. For a source of jobs: the hiring system
-- its board runs on, the company as our data names it, and other companies we
-- list under their own names whose plants the same board hires for.
ALTER TABLE intake_sources DROP CONSTRAINT IF EXISTS intake_sources_kind_check;
ALTER TABLE intake_sources ADD CONSTRAINT intake_sources_kind_check CHECK (kind IN ('factory', 'job'));
ALTER TABLE intake_sources ADD COLUMN IF NOT EXISTS system text;
ALTER TABLE intake_sources ADD COLUMN IF NOT EXISTS company text;
ALTER TABLE intake_sources ADD COLUMN IF NOT EXISTS also text[];

-- What a run of a job source changed:
--   op 'job'      a job it added, changed, closed or reopened (fact says which; before and after are
--                 posting_job_snapshot, with the two dates of `seen` beside them)
--   op 'posting'  a staged posting as it stood before the run changed it (fact: the posting's id)
--   op 'place'    a place on the waiting list, as it stood before (fact: 'waiting' for one the run put there)
ALTER TABLE intake_changes DROP CONSTRAINT IF EXISTS intake_changes_op_check;
ALTER TABLE intake_changes ADD CONSTRAINT intake_changes_op_check CHECK (op IN ('fact', 'id', 'plant', 'company', 'job', 'posting', 'place'));

-- ---------------------------------------------------------------------------
-- A job that came from a source
-- ---------------------------------------------------------------------------

-- `source` is the intake source the job came from (null: a member posted it),
-- `source_id` the posting's own id there. A job with a source is kept in step
-- with the employer's site by the runner and is not edited here.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source_id text;
-- The level the title states ("II", "Senior", "Lead") and where it stands, 1 to 4.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS level_word text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS level_rank smallint;
-- What the posting asks for, as facts. One object, only the keys that were said:
--   { "yearsMin": 3, "yearsMax": 5, "education": "...", "certifications": ["..."], "clearance": "...", "citizenship": "..." }
-- One column rather than six: the facts are sparse, a list among them, and the
-- words they hold are the reader's (scripts/ingest/postings/read/), which will
-- grow. It stays queryable: requirements->>'clearance', (requirements->>'yearsMin')::int,
-- requirements->'certifications' ? 'AWS D17.1'. Shift and employment type have
-- their own columns already.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS requirements jsonb;
-- When the employer's site last listed it. A job from a source expires 7 days
-- after that (posting_apply), so it leaves the lists by itself if runs stop.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
-- A posting that does not say full-time or part-time is not called either.
ALTER TABLE jobs ALTER COLUMN employment_type DROP NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_level_rank_check') THEN
    ALTER TABLE jobs ADD CONSTRAINT jobs_level_rank_check CHECK (level_rank IS NULL OR level_rank BETWEEN 1 AND 4) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_requirements_check') THEN
    ALTER TABLE jobs ADD CONSTRAINT jobs_requirements_check CHECK (requirements IS NULL OR jsonb_typeof(requirements) = 'object') NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS jobs_source_idx ON jobs (source, source_id) WHERE source IS NOT NULL;
-- The open jobs, newest first: what the Jobs page reads a page of.
CREATE INDEX IF NOT EXISTS jobs_open_posted_idx ON jobs (posted_at DESC, id) WHERE status = 'open';

-- A make of a skill that a job names (the machine or software it is run on).
-- The make carries its skill, as a person's marks and a company's version do,
-- so a row can only be for one of that skill's makes and follows a make that
-- moves to another skill in a merge. Summed by jobs.company_id and
-- jobs.occupation_id, this and job_skills are what a company's version of a
-- career will be written from.
CREATE TABLE IF NOT EXISTS job_makes (
  job_id uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  skill_id uuid NOT NULL,
  make_id uuid NOT NULL,
  PRIMARY KEY (job_id, make_id),
  CONSTRAINT job_makes_make_fkey FOREIGN KEY (skill_id, make_id)
    REFERENCES skill_makes (skill_id, id) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS job_makes_make_idx ON job_makes (skill_id, make_id);

-- A place an employer's postings name where we list no plant of that
-- employer: it waits for a person ('waiting'), who points it at a plant
-- ('pointed': every posting naming it follows) or leaves it ('left': it is not
-- asked about again). Only places that could not be placed by rule, or that an
-- admin decided, have a row. `place_key` is posting_place_key(city, state).
CREATE TABLE IF NOT EXISTS posting_places (
  source text NOT NULL REFERENCES intake_sources (slug) ON DELETE CASCADE,
  place_key text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'pointed', 'left')),
  -- The plant an admin pointed it at. Followed through merges (record_now).
  factory_id uuid,
  -- The run that first found it without a plant.
  run_id bigint,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, place_key)
);
CREATE INDEX IF NOT EXISTS posting_places_waiting_idx ON posting_places (source) WHERE status = 'waiting';

-- ---------------------------------------------------------------------------
-- Words
-- ---------------------------------------------------------------------------

-- A city as it is compared: lower case, "Saint" and "St." alike, no punctuation.
CREATE OR REPLACE FUNCTION posting_city_key(p_city text) RETURNS text LANGUAGE sql IMMUTABLE AS $f$
  SELECT btrim(regexp_replace(
    regexp_replace(regexp_replace(regexp_replace(lower(coalesce(p_city, '')), '\msaint\M', 'st', 'g'), '\mfort\M', 'ft', 'g'), '\mmount\M', 'mt', 'g'),
    '[^a-z0-9]+', ' ', 'g'))
$f$;

CREATE OR REPLACE FUNCTION posting_place_key(p_city text, p_state text) RETURNS text LANGUAGE sql IMMUTABLE AS $f$
  SELECT posting_city_key(p_city) || '|' || upper(btrim(coalesce(p_state, '')))
$f$;

-- Text as words to look for whole words in: lower case, one space between, one at each end.
CREATE OR REPLACE FUNCTION posting_words(p_text text) RETURNS text LANGUAGE sql IMMUTABLE AS $f$
  SELECT ' ' || btrim(regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', ' ', 'g')) || ' '
$f$;

-- Metres between two points (equirectangular: exact enough under 100 km).
CREATE OR REPLACE FUNCTION posting_metres(lat1 float8, lng1 float8, lat2 float8, lng2 float8) RETURNS integer LANGUAGE sql IMMUTABLE AS $f$
  SELECT round(sqrt(power((lat1 - lat2) * 111320, 2) + power((lng1 - lng2) * 111320 * cos(radians((lat1 + lat2) / 2)), 2)))::integer
$f$;

-- ---------------------------------------------------------------------------
-- Which company, which plant, which career
-- ---------------------------------------------------------------------------

-- The companies a source's postings are for: the ones its registry line names
-- (`named`: found by exact name or other name, in any letter case, as the
-- employer loader finds a company) and the companies that are part of them.
CREATE OR REPLACE FUNCTION posting_companies(p_source text) RETURNS TABLE (company_id uuid, named boolean) LANGUAGE sql STABLE AS $f$
  WITH RECURSIVE names AS (
    SELECT lower(btrim(n)) AS name
    FROM intake_sources s, unnest(ARRAY[s.company] || coalesce(s.also, '{}')) n
    WHERE s.slug = p_source AND n IS NOT NULL AND btrim(n) <> ''
  ), family(id, depth, named) AS (
    SELECT c.id, 0, true FROM companies c
    WHERE lower(c.name) IN (SELECT name FROM names)
       OR EXISTS (SELECT 1 FROM unnest(c.aliases) a WHERE lower(a) IN (SELECT name FROM names))
    UNION
    SELECT c.id, f.depth + 1, false FROM family f JOIN companies c ON c.parent_company_id = f.id WHERE f.depth < 3
  )
  SELECT id, bool_or(named) FROM family GROUP BY id
$f$;

-- For every staged posting of a source that is still on the employer's site,
-- at every place it names: the plant it is at and the career it is. One row
-- per posting and place; factory_id is null where no plant could be found
-- (the place waits) and occupation_id where the career is not stored.
--
-- The plant, in this order (`how`):
--   admin    the place was pointed at a plant by an admin
--   city     the company's one plant in that city and state
--   address  of several there, the one whose street address the posting's words carry
--   name     ... or whose name they carry (the words of the plant's name that are not the company's, the city's or generic)
--   largest  ... else the one with the most people, then the one written from sources, then the oldest
--   near     none in the city: the company's nearest plant in the state within 20 km of the city's centre,
--            the centre being the middle of every plant we list in that city (no outside geocoder)
-- "The company" is posting_companies. The posting's words are what staging
-- keeps of it: its title, its location line, its street address, its department.
-- `options` is how many plants were candidates; `metres` the distance for 'near'.
CREATE OR REPLACE FUNCTION posting_decide(p_source text, p_place text DEFAULT NULL)
RETURNS TABLE (source_id text, place_key text, city text, state text, company_id uuid, factory_id uuid, occupation_id uuid,
               how text, metres integer, options integer)
LANGUAGE sql STABLE AS $f$
  WITH fam AS (
    SELECT company_id FROM posting_companies(p_source)
  ), rec AS (
    SELECT r.source_id, r.facts,
           posting_words(concat_ws(' ', r.facts->>'title', r.facts->>'location', r.facts->>'address', r.facts->>'department')) AS words,
           (SELECT o.id FROM occupations o WHERE lower(o.title) = lower(r.facts->'reading'->'career'->>'title') ORDER BY o.id LIMIT 1) AS occupation_id
    FROM intake_records r
    WHERE r.source = p_source AND r.gone_run_id IS NULL
  ), rp AS (
    SELECT DISTINCT ON (rec.source_id, k.place_key)
           rec.source_id, rec.words, rec.occupation_id, k.place_key, k.city_key, btrim(p->>'city') AS city, upper(btrim(p->>'state')) AS state
    FROM rec
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(rec.facts->'reading'->'places') = 'array' THEN rec.facts->'reading'->'places' ELSE '[]'::jsonb END) p
    CROSS JOIN LATERAL (SELECT posting_city_key(p->>'city') AS city_key, posting_place_key(p->>'city', p->>'state') AS place_key) k
    WHERE k.city_key <> '' AND upper(btrim(coalesce(p->>'state', ''))) ~ '^[A-Z]{2}$'
      AND (p_place IS NULL OR k.place_key = p_place)
    ORDER BY rec.source_id, k.place_key
  ), ours AS (
    SELECT f.id, f.company_id, f.state, posting_city_key(f.city) AS city_key, f.workforce_size, f.curated, f.created_at, f.lat, f.lng,
           -- The street number and the first word of the street: "12100 samsung".
           (regexp_match(posting_words(f.address), '^ ([0-9]{2,6}) ([a-z0-9]+) '))[1:2] AS street,
           -- The words of its name that tell it from the company's other plants.
           ARRAY(SELECT DISTINCT w FROM regexp_split_to_table(btrim(posting_words(f.name)), ' ') w
                 WHERE (length(w) >= 4 OR (w ~ '[0-9]' AND length(w) >= 2))
                   AND position(' ' || w || ' ' IN posting_words(co.name || ' ' || coalesce(f.city, '') || ' ' || coalesce(f.state, ''))) = 0
                   AND w NOT IN ('plant', 'plants', 'factory', 'facility', 'facilities', 'manufacturing', 'operations', 'operation', 'division',
                                 'company', 'corporation', 'corp', 'incorporated', 'site', 'center', 'centre', 'campus', 'building', 'bldg',
                                 'works', 'north', 'south', 'east', 'west', 'america', 'american', 'usa', 'international', 'industries',
                                 'products', 'systems', 'group', 'holdings', 'technologies', 'technology', 'services', 'assembly')) AS telling
    FROM factories f JOIN companies co ON co.id = f.company_id
    WHERE f.company_id IN (SELECT company_id FROM fam)
  ), pointed AS (
    SELECT pp.place_key, f.id, f.company_id
    FROM posting_places pp JOIN factories f ON f.id = record_now('factory', pp.factory_id)
    WHERE pp.source = p_source AND pp.status = 'pointed' AND pp.factory_id IS NOT NULL
  ), incity AS (
    SELECT rp.source_id, rp.place_key, o.id, o.company_id, o.workforce_size, o.curated, o.created_at,
           CASE WHEN o.street IS NOT NULL AND position(' ' || o.street[1] || ' ' || o.street[2] || ' ' IN rp.words) > 0 THEN 100 ELSE 0 END
             + (SELECT count(*) FROM unnest(o.telling) w WHERE position(' ' || w || ' ' IN rp.words) > 0)::integer AS fit
    FROM rp JOIN ours o ON o.state = rp.state AND o.city_key = rp.city_key
    WHERE NOT EXISTS (SELECT 1 FROM pointed a WHERE a.place_key = rp.place_key)
  ), ranked AS (
    SELECT c.*, count(*) OVER w AS options,
           row_number() OVER (w ORDER BY c.fit DESC, c.workforce_size DESC NULLS LAST, c.curated DESC, c.created_at, c.id) AS pick,
           count(*) FILTER (WHERE c.fit = m.best) OVER w AS at_best, m.best
    FROM incity c
    JOIN (SELECT source_id, place_key, max(fit) AS best FROM incity GROUP BY 1, 2) m ON m.source_id = c.source_id AND m.place_key = c.place_key
    WINDOW w AS (PARTITION BY c.source_id, c.place_key)
  ), empty_places AS (
    -- Places where the company has no plant in the city and no admin has pointed: the city's centre, from every plant we list there.
    SELECT pl.place_key, pl.state, c.lat, c.lng
    FROM (SELECT DISTINCT rp.place_key, rp.city_key, rp.state FROM rp
          WHERE NOT EXISTS (SELECT 1 FROM pointed a WHERE a.place_key = rp.place_key)
            AND NOT EXISTS (SELECT 1 FROM ours o WHERE o.state = rp.state AND o.city_key = rp.city_key)) pl
    CROSS JOIN LATERAL (
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY f.lat) AS lat, percentile_cont(0.5) WITHIN GROUP (ORDER BY f.lng) AS lng
      FROM factories f WHERE f.state = pl.state AND f.lat IS NOT NULL AND f.lng IS NOT NULL AND posting_city_key(f.city) = pl.city_key
    ) c
    WHERE c.lat IS NOT NULL
  ), near AS (
    SELECT DISTINCT ON (e.place_key) e.place_key, o.id, o.company_id, posting_metres(e.lat, e.lng, o.lat::float8, o.lng::float8) AS metres,
           count(*) OVER (PARTITION BY e.place_key)::integer AS options
    FROM empty_places e JOIN ours o ON o.state = e.state AND o.lat IS NOT NULL AND o.lng IS NOT NULL
    WHERE posting_metres(e.lat, e.lng, o.lat::float8, o.lng::float8) <= 20000
    ORDER BY e.place_key, posting_metres(e.lat, e.lng, o.lat::float8, o.lng::float8), o.id
  )
  SELECT rp.source_id, rp.place_key, rp.city, rp.state,
         coalesce(a.company_id, r.company_id, n.company_id),
         coalesce(a.id, r.id, n.id),
         rp.occupation_id,
         CASE WHEN a.id IS NOT NULL THEN 'admin'
              WHEN r.id IS NOT NULL THEN CASE WHEN r.options = 1 THEN 'city'
                                              WHEN r.best >= 100 AND r.at_best = 1 THEN 'address'
                                              WHEN r.best > 0 AND r.at_best = 1 THEN 'name'
                                              ELSE 'largest' END
              WHEN n.id IS NOT NULL THEN 'near' END,
         n.metres,
         coalesce(r.options, n.options, 0)::integer
  FROM rp
  LEFT JOIN pointed a ON a.place_key = rp.place_key
  LEFT JOIN ranked r ON r.source_id = rp.source_id AND r.place_key = rp.place_key AND r.pick = 1
  LEFT JOIN near n ON n.place_key = rp.place_key AND a.id IS NULL AND r.id IS NULL
$f$;

-- ---------------------------------------------------------------------------
-- A job as a run sees it
-- ---------------------------------------------------------------------------

-- What a run may write to a job, as one value: compared to tell changed from
-- the same, journalled before and after, restored by undo.
CREATE OR REPLACE FUNCTION posting_job_snapshot(p_job uuid) RETURNS jsonb LANGUAGE sql STABLE AS $f$
  SELECT jsonb_build_object(
    'company_id', j.company_id, 'factory_id', j.factory_id, 'occupation_id', j.occupation_id, 'title', j.title,
    'employment_type', j.employment_type, 'shift', j.shift, 'pay_min', j.pay_min, 'pay_max', j.pay_max, 'pay_period', j.pay_period,
    'apply_url', j.apply_url, 'posted_at', j.posted_at, 'level_word', j.level_word, 'level_rank', j.level_rank,
    'requirements', j.requirements, 'status', j.status, 'closed_reason', j.closed_reason,
    'skills', coalesce((SELECT jsonb_agg(s.skill_id ORDER BY s.skill_id) FROM job_skills s WHERE s.job_id = j.id), '[]'::jsonb),
    'makes', coalesce((SELECT jsonb_agg(m.make_id ORDER BY m.make_id) FROM job_makes m WHERE m.job_id = j.id), '[]'::jsonb))
  FROM jobs j WHERE j.id = p_job
$f$;

-- The job a staged posting would be at a plant, in the same shape (always
-- open). `facts` is the staged record's: the adapter's fields and the reading.
-- A posting that does not say when it was posted keeps the day the job
-- (`p_job`) already has.
CREATE OR REPLACE FUNCTION posting_job_wanted(p_facts jsonb, p_company uuid, p_factory uuid, p_occupation uuid, p_job uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE AS $f$
  SELECT jsonb_build_object(
    'company_id', p_company, 'factory_id', p_factory, 'occupation_id', p_occupation,
    'title', left(btrim(p_facts->>'title'), 200),
    'employment_type', (SELECT t FROM (SELECT regexp_replace(lower(btrim(rd->'requirements'->>'employmentType')), '[ _]+', '-', 'g') AS t) e
                        WHERE t IN ('full-time', 'part-time', 'contract', 'apprenticeship')),
    'shift', NULLIF(left(btrim(rd->'requirements'->>'shift'), 40), ''),
    'pay_min', CASE WHEN pay.ok THEN round((rd->'pay'->>'min')::numeric * 100)::integer END,
    'pay_max', CASE WHEN pay.ok THEN round((rd->'pay'->>'max')::numeric * 100)::integer END,
    'pay_period', CASE WHEN pay.ok THEN rd->'pay'->>'period' ELSE 'hour' END,
    'apply_url', p_facts->>'url',
    'posted_at', CASE WHEN p_facts->>'postedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                      THEN ((p_facts->>'postedAt')::timestamptz AT TIME ZONE 'UTC')
                      ELSE (SELECT j.posted_at FROM jobs j WHERE j.id = p_job) END,
    'level_word', NULLIF(left(btrim(rd->'level'->>'word'), 40), ''),
    'level_rank', CASE WHEN rd->'level'->>'rank' ~ '^[1-4]$' THEN (rd->'level'->>'rank')::integer END,
    'requirements', NULLIF(jsonb_strip_nulls(jsonb_build_object(
        'yearsMin', rd->'requirements'->'yearsMin', 'yearsMax', rd->'requirements'->'yearsMax',
        'education', rd->'requirements'->'education',
        'certifications', CASE WHEN jsonb_typeof(rd->'requirements'->'certifications') = 'array'
                                AND jsonb_array_length(rd->'requirements'->'certifications') > 0 THEN rd->'requirements'->'certifications' END,
        'clearance', rd->'requirements'->'clearance', 'citizenship', rd->'requirements'->'citizenship')), '{}'::jsonb),
    'status', 'open', 'closed_reason', NULL,
    -- The skills it asks for, by their catalogue names; a make brings its skill with it.
    'skills', coalesce((
      SELECT jsonb_agg(s.id ORDER BY s.id) FROM skills s
      WHERE lower(s.name) IN (
        SELECT lower(e->>'name') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(rd->'skills') = 'array' THEN rd->'skills' ELSE '[]'::jsonb END) e
        UNION
        SELECT lower(e->>'skill') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(rd->'makes') = 'array' THEN rd->'makes' ELSE '[]'::jsonb END) e)), '[]'::jsonb),
    'makes', coalesce((
      SELECT jsonb_agg(m.id ORDER BY m.id) FROM skill_makes m JOIN skills s ON s.id = m.skill_id
      WHERE EXISTS (
        SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(rd->'makes') = 'array' THEN rd->'makes' ELSE '[]'::jsonb END) e
        WHERE lower(e->>'skill') = lower(s.name) AND lower(e->>'make') = lower(m.name))), '[]'::jsonb))
  FROM (SELECT coalesce(p_facts->'reading', '{}'::jsonb) AS rd) x
  CROSS JOIN LATERAL (
    SELECT coalesce(rd->'pay'->>'period' IN ('hour', 'year')
             AND rd->'pay'->>'min' ~ '^[0-9]+([.][0-9]+)?$' AND rd->'pay'->>'max' ~ '^[0-9]+([.][0-9]+)?$'
             AND (rd->'pay'->>'min')::numeric > 0 AND (rd->'pay'->>'min')::numeric <= (rd->'pay'->>'max')::numeric
             AND (rd->'pay'->>'max')::numeric <= 1000000, false) AS ok
  ) pay
$f$;

-- Writes a snapshot's values onto a job (its skills and makes included).
CREATE OR REPLACE FUNCTION posting_job_write(p_job uuid, p_want jsonb) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  UPDATE jobs SET
    company_id = (p_want->>'company_id')::uuid, factory_id = (p_want->>'factory_id')::uuid, occupation_id = (p_want->>'occupation_id')::uuid,
    title = p_want->>'title', employment_type = p_want->>'employment_type', shift = p_want->>'shift',
    pay_min = (p_want->>'pay_min')::integer, pay_max = (p_want->>'pay_max')::integer, pay_period = p_want->>'pay_period',
    apply_url = p_want->>'apply_url', posted_at = coalesce((p_want->>'posted_at')::timestamp, posted_at),
    level_word = p_want->>'level_word', level_rank = (p_want->>'level_rank')::smallint,
    requirements = NULLIF(p_want->'requirements', 'null'::jsonb),
    status = p_want->>'status', closed_reason = p_want->>'closed_reason', updated_at = now()
  WHERE id = p_job;
  DELETE FROM job_makes WHERE job_id = p_job AND NOT (p_want->'makes' ? make_id::text);
  DELETE FROM job_skills WHERE job_id = p_job AND NOT (p_want->'skills' ? skill_id::text);
  INSERT INTO job_skills (job_id, skill_id, required)
    SELECT p_job, s.id, true FROM skills s WHERE p_want->'skills' ? s.id::text
    ON CONFLICT (job_id, skill_id) DO NOTHING;
  INSERT INTO job_makes (job_id, skill_id, make_id)
    SELECT p_job, m.skill_id, m.id FROM skill_makes m WHERE p_want->'makes' ? m.id::text
    ON CONFLICT (job_id, make_id) DO NOTHING;
END $f$;

-- ---------------------------------------------------------------------------
-- Resolve: the places that wait
-- ---------------------------------------------------------------------------

-- Brings the waiting list of a source up to what its postings name now:
-- a place with no plant gets a row (once; a line in load_log says how many
-- postings name it), a waiting place that has a plant now or that no posting
-- names any more leaves the list, a place pointed at a plant that is gone
-- waits again. Nothing the site reads is written. Returns the counts.
CREATE OR REPLACE FUNCTION posting_resolve(p_source text, p_run bigint) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE
  v_company text;
  v_named integer;
  v_nil constant uuid := '00000000-0000-0000-0000-000000000000';
  r record;
  n_new integer := 0;
BEGIN
  SELECT company INTO v_company FROM intake_sources WHERE slug = p_source AND kind = 'job';
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
    'noCareer', (SELECT count(DISTINCT source_id) FROM posting_decided WHERE occupation_id IS NULL));
END $f$;

-- ---------------------------------------------------------------------------
-- Apply: the jobs
-- ---------------------------------------------------------------------------

-- Brings the jobs of a source in line with its staged postings:
--   a posting at a place with a plant and a career that has no job gets one
--     (its outside id, "<posting id>@<place key>", is written to the crosswalk);
--   a job whose posting changed, or whose plant was decided otherwise, is corrected;
--   a job closed because its posting had left is opened again when the posting is back;
--   a job whose posting has been missing from the employer's site for two runs
--     running, or no longer names the place, is closed. A job is never deleted.
-- Every change is journalled (intake_changes) and said in load_log. A job
-- that is as it should be is not written, except for the day it was last
-- seen, which moves once a day (and its expiry with it, 7 days on).
-- `p_place` limits it to the postings naming one place and closes nothing:
-- what Admin Tools calls when a place is pointed at a plant.
CREATE OR REPLACE FUNCTION posting_apply(p_source text, p_run bigint, p_place text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE
  v_ref text;
  v_gone constant text := 'No longer on the company''s careers site';
  v_ttl constant interval := interval '7 days';
  d record;
  v_job uuid;
  v_before jsonb;
  v_ref_id uuid;
  n_added integer := 0;
  n_changed integer := 0;
  n_reopened integer := 0;
  n_closed integer := 0;
  n_seen integer := 0;
BEGIN
  SELECT ref_source INTO v_ref FROM intake_sources WHERE slug = p_source AND kind = 'job';
  IF v_ref IS NULL THEN RAISE EXCEPTION '% is not a source of job postings.', p_source; END IF;

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
    WHERE d.factory_id IS NOT NULL AND d.occupation_id IS NOT NULL;
  CREATE INDEX ON posting_plan (job_id);

  FOR d IN
    SELECT p.*, co.name AS company_name, f.name AS factory_name, f.workforce_size
    FROM posting_plan p
    JOIN factories f ON f.id = (p.want->>'factory_id')::uuid
    JOIN companies co ON co.id = f.company_id
    WHERE p.job_id IS NULL OR posting_job_snapshot(p.job_id) IS DISTINCT FROM p.want
    ORDER BY p.source_id, p.place_key
  LOOP
    IF d.job_id IS NULL THEN
      INSERT INTO jobs (company_id, factory_id, occupation_id, title, employment_type, pay_period, status,
                        posted_at, expires_at, source, source_id, last_seen_at)
        VALUES ((d.want->>'company_id')::uuid, (d.want->>'factory_id')::uuid, (d.want->>'occupation_id')::uuid, d.want->>'title', NULL, 'hour', 'open',
                coalesce((d.want->>'posted_at')::timestamp, now() AT TIME ZONE 'UTC'), (now() AT TIME ZONE 'UTC') + v_ttl, p_source, d.source_id, now())
        RETURNING id INTO v_job;
      PERFORM posting_job_write(v_job, d.want);
      INSERT INTO external_references (entity_type, entity_id, source, external_id, url, run_id)
        VALUES ('jobs', v_job, v_ref, d.ext, d.want->>'apply_url', p_run) RETURNING id INTO v_ref_id;
      UPDATE posting_plan SET job_id = v_job WHERE ext = d.ext;
      INSERT INTO intake_changes (run_id, op, entity_id, fact, after) VALUES (p_run, 'job', v_job, 'added', posting_job_snapshot(v_job));
      INSERT INTO intake_changes (run_id, op, entity_id, after) VALUES (p_run, 'id', v_job, jsonb_build_object('ref', v_ref_id));
      INSERT INTO load_log (load, kind, action, look, company, plant, detail, metres, run_id, source_id, entity_id, evidence)
        VALUES (p_source, 'job', 'added',
                d.how = 'near' OR (d.how = 'largest' AND d.workforce_size IS NULL), d.company_name, d.factory_name,
                format('%s, at %s, %s: %s', d.want->>'title', d.city, d.state,
                       CASE d.how WHEN 'city' THEN 'the company''s one plant there'
                                  WHEN 'address' THEN format('of %s plants there, the one at the posting''s address', d.options)
                                  WHEN 'name' THEN format('of %s plants there, the one the posting names', d.options)
                                  WHEN 'largest' THEN format('of %s plants there, the largest%s', d.options,
                                                             CASE WHEN d.workforce_size IS NULL THEN ' (no headcount on record: the first listed)' ELSE '' END)
                                  WHEN 'near' THEN format('no plant in that city: the nearest, %s km from its centre', round(d.metres / 1000.0, 1))
                                  ELSE 'the plant an admin pointed the place at' END),
                d.metres, p_run, d.source_id, v_job,
                jsonb_build_object('how', d.how, 'options', d.options, 'career', d.facts->'reading'->'career'));
      n_added := n_added + 1;
    ELSE
      v_before := posting_job_snapshot(d.job_id);
      IF v_before IS NULL THEN CONTINUE; END IF;
      -- Closed by anyone but a run: it stays as it was left.
      IF v_before->>'status' <> 'open' AND v_before->>'closed_reason' IS DISTINCT FROM v_gone THEN CONTINUE; END IF;
      INSERT INTO intake_changes (run_id, op, entity_id, fact, before)
        SELECT p_run, 'job', j.id, CASE WHEN j.status = 'open' THEN 'changed' ELSE 'reopened' END,
               v_before || jsonb_build_object('seen', jsonb_build_array(j.last_seen_at, j.expires_at))
        FROM jobs j WHERE j.id = d.job_id;
      PERFORM posting_job_write(d.job_id, d.want);
      UPDATE jobs SET last_seen_at = now(), expires_at = (now() AT TIME ZONE 'UTC') + v_ttl WHERE id = d.job_id;
      UPDATE intake_changes SET after = posting_job_snapshot(d.job_id)
        WHERE run_id = p_run AND op = 'job' AND entity_id = d.job_id AND after IS NULL;
      INSERT INTO load_log (load, kind, action, look, company, plant, detail, run_id, source_id, entity_id, evidence)
        VALUES (p_source, 'job', CASE WHEN v_before->>'status' = 'open' THEN 'changed' ELSE 'reopened' END, false, d.company_name, d.factory_name,
                format('%s, at %s, %s: %s', d.want->>'title', d.city, d.state,
                       CASE WHEN v_before->>'status' = 'open'
                            THEN 'the posting changed: ' || coalesce((SELECT string_agg(k, ', ' ORDER BY k) FROM jsonb_object_keys(d.want) k
                                                                      WHERE v_before->k IS DISTINCT FROM d.want->k), 'nothing we keep')
                            ELSE 'the posting is on the company''s site again' END),
                p_run, d.source_id, d.job_id, NULL);
      IF v_before->>'status' = 'open' THEN n_changed := n_changed + 1; ELSE n_reopened := n_reopened + 1; END IF;
    END IF;
  END LOOP;

  IF p_place IS NULL THEN
    -- The open jobs of the source that no posting stands behind any more. One whose posting
    -- went missing in this very run waits for the next: a board can drop a posting for a day.
    FOR d IN
      SELECT j.id, j.title, j.source_id, j.last_seen_at, j.expires_at, co.name AS company_name, f.name AS factory_name,
             r.gone_run_id IS NOT NULL AS left_site
      FROM jobs j
      JOIN factories f ON f.id = j.factory_id
      JOIN companies co ON co.id = j.company_id
      LEFT JOIN intake_records r ON r.source = p_source AND r.source_id = j.source_id
      WHERE j.source = p_source AND j.status = 'open'
        AND NOT EXISTS (SELECT 1 FROM posting_plan p WHERE p.job_id = j.id)
        AND (r.gone_run_id IS NULL OR r.gone_run_id < p_run)
      ORDER BY j.id
    LOOP
      INSERT INTO intake_changes (run_id, op, entity_id, fact, before)
        VALUES (p_run, 'job', d.id, 'closed', posting_job_snapshot(d.id) || jsonb_build_object('seen', jsonb_build_array(d.last_seen_at, d.expires_at)));
      UPDATE jobs SET status = 'closed', closed_reason = v_gone, updated_at = now() WHERE id = d.id;
      UPDATE intake_changes SET after = posting_job_snapshot(d.id) WHERE run_id = p_run AND op = 'job' AND entity_id = d.id AND after IS NULL;
      INSERT INTO load_log (load, kind, action, look, company, plant, detail, run_id, source_id, entity_id)
        VALUES (p_source, 'job', 'closed', false, d.company_name, d.factory_name,
                format('%s: %s', d.title, CASE WHEN d.left_site THEN 'gone from the company''s site for two runs'
                                               ELSE 'the posting no longer names this place, or its plant or career is gone' END),
                p_run, d.source_id, d.id);
      n_closed := n_closed + 1;
    END LOOP;
  END IF;

  -- Seen: once a day, for the jobs that are as they should be.
  UPDATE jobs j SET last_seen_at = now(), expires_at = (now() AT TIME ZONE 'UTC') + v_ttl
    FROM posting_plan p
    WHERE j.id = p.job_id AND j.status = 'open' AND (j.last_seen_at IS NULL OR j.last_seen_at < now() - interval '12 hours');
  GET DIAGNOSTICS n_seen = ROW_COUNT;

  RETURN jsonb_build_object('added', n_added, 'changed', n_changed, 'reopened', n_reopened, 'closed', n_closed, 'seen', n_seen,
                            'open', (SELECT count(*) FROM jobs WHERE source = p_source AND status = 'open'));
END $f$;

-- ---------------------------------------------------------------------------
-- Undo
-- ---------------------------------------------------------------------------

-- intake_undo_run (0043) with what a run of a job source changed: a job it
-- added is removed (closed instead, if anyone has applied to it), a job it
-- changed, closed or reopened is put back as it was where it is still as the
-- run left it, the staged postings and the waiting list are put back as they
-- stood, and the postings it staged for the first time are unstaged. The day
-- a job was last seen is not taken back for jobs the run did not change.
-- Returns { restored, kept, ids, plants, companies, jobs }.
CREATE OR REPLACE FUNCTION intake_undo_run(p_run bigint) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE
  c intake_changes%ROWTYPE;
  f factories%ROWTYPE;
  v_source text;
  v_kind text;
  v_restored integer := 0;
  v_kept integer := 0;
  v_ids integer := 0;
  v_plants integer := 0;
  v_companies integer := 0;
  v_jobs integer := 0;
  v_now jsonb;
BEGIN
  SELECT r.source, s.kind INTO v_source, v_kind FROM intake_runs r JOIN intake_sources s ON s.slug = r.source WHERE r.id = p_run;
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
    ELSIF c.op = 'job' THEN
      v_now := posting_job_snapshot(c.entity_id);
      IF v_now IS NULL THEN
        NULL;  -- the job went with its plant or company
      ELSIF c.fact = 'added' THEN
        IF EXISTS (SELECT 1 FROM applications a WHERE a.job_id = c.entity_id) THEN
          UPDATE jobs SET status = 'closed', closed_reason = 'No longer on the company''s careers site', updated_at = now() WHERE id = c.entity_id;
          v_kept := v_kept + 1;
          INSERT INTO load_log (load, kind, action, look, detail, run_id, entity_id)
            VALUES (v_source, 'job', 'kept', true, format('%s: people applied to the job the run added, so it is closed, not removed', v_now->>'title'), p_run, c.entity_id);
        ELSE
          DELETE FROM jobs WHERE id = c.entity_id;
          v_jobs := v_jobs + 1;
        END IF;
      ELSIF v_now = c.after THEN
        PERFORM posting_job_write(c.entity_id, c.before - 'seen');
        UPDATE jobs SET posted_at = (c.before->>'posted_at')::timestamp,
                        last_seen_at = (c.before->'seen'->>0)::timestamptz, expires_at = (c.before->'seen'->>1)::timestamp
          WHERE id = c.entity_id;
        v_jobs := v_jobs + 1;
      ELSE
        v_kept := v_kept + 1;
        INSERT INTO load_log (load, kind, action, look, detail, run_id, entity_id)
          VALUES (v_source, 'job', 'kept', true, format('%s was changed after the run and is left as it is', v_now->>'title'), p_run, c.entity_id);
      END IF;
    ELSIF c.op = 'posting' THEN
      UPDATE intake_records SET
        changed_run_id = (c.before->>'changed_run_id')::bigint, gone_run_id = (c.before->>'gone_run_id')::bigint,
        payload = c.before->'payload', facts = c.before->'facts', hash = c.before->>'hash'
      WHERE source = v_source AND source_id = c.fact;
    ELSIF c.op = 'place' THEN
      IF c.fact = 'waiting' THEN
        DELETE FROM posting_places WHERE source = v_source AND place_key = c.after->>'place_key' AND status = 'waiting' AND run_id = p_run;
      ELSE
        INSERT INTO posting_places SELECT * FROM jsonb_populate_record(NULL::posting_places, c.before)
        ON CONFLICT (source, place_key) DO UPDATE SET
          status = EXCLUDED.status, factory_id = EXCLUDED.factory_id, run_id = EXCLUDED.run_id,
          decided_by = EXCLUDED.decided_by, decided_at = EXCLUDED.decided_at, created_at = EXCLUDED.created_at;
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
  -- A posting the run staged for the first time was not staged before it.
  IF v_kind = 'job' THEN
    DELETE FROM intake_records WHERE source = v_source AND first_run_id = p_run;
  END IF;
  RETURN jsonb_build_object('restored', v_restored, 'kept', v_kept, 'ids', v_ids, 'plants', v_plants, 'companies', v_companies, 'jobs', v_jobs);
END $f$;
