-- posting_decide (migration 0054) as it stands from migration 0067: the same
-- function, with two rules more for the near rule (the company's nearest plant
-- within 10 km of a town where it has none). A place set aside as no plant, by a
-- person in Admin Tools or by the data (data/employers/places.json), takes no
-- plant by it. And a posting another of whose places has its plant (by the city,
-- or pointed) takes no second job by it. Read into 0067 and 0079 by
-- scripts/build-posting-places-sql.mjs; a change to it is a change here and a new
-- generated migration. The place a caller asks about (`p_place`) narrows only
-- the answer: every place of a posting is weighed, so one place asked about
-- alone is decided as it is with the rest.

-- For every staged posting of a source that is still on the employer's site,
-- at every place it names: the plant it is at and the career it is. One row
-- per posting and place; factory_id is null where no plant could be found
-- (the place waits) and occupation_id where the career is not stored.
--
-- The plant, in this order (`how`):
--   admin    the place was pointed at a plant, by an admin or by the data (posting_places.status 'pointed')
--   city     the company's one plant in that city and state
--   address  of several there, the one whose street address the posting's words carry
--   name     ... or whose name they carry (the words of the plant's name that are not the company's, the city's or generic)
--   largest  ... else the one with the most people
--   keeps    ... none of them with a headcount: the one the plant merge would keep of them (plant_keeps' order:
--            written from sources, then placed in a county, then more facts filled in, then the older, then the
--            lower id). The same plant every run; marked for a look
--   near     none in the city: the company's nearest plant in the state within 10 km of the city's centre,
--            the centre being the middle of every plant we list in that city (no outside geocoder); never
--            for a place set aside as no plant (posting_places.status 'left'), and never for a posting
--            another of whose places has its plant
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
    ORDER BY rec.source_id, k.place_key
  ), ours AS (
    SELECT f.id, f.company_id, f.state, posting_city_key(f.city) AS city_key, f.workforce_size, f.curated, f.created_at, f.lat, f.lng,
           (f.county_fips IS NOT NULL) AS in_county,
           -- How many facts are filled in, counted as plant_keeps counts them.
           ((NULLIF(btrim(f.address), '') IS NOT NULL)::int + (NULLIF(btrim(f.city), '') IS NOT NULL)::int
            + (NULLIF(btrim(f.zip_code), '') IS NOT NULL)::int + (f.primary_naics IS NOT NULL)::int
            + (f.primary_naics_description IS NOT NULL)::int + (NULLIF(btrim(f.products), '') IS NOT NULL)::int
            + (f.opened_year IS NOT NULL)::int) AS facts,
           -- The street number and the first word of the street: "12100 samsung".
           (regexp_match(posting_words(f.address), '^ ([0-9]{2,6}) ([a-z0-9]+) '))[1:2] AS street,
           -- The words of its name that tell it from the company's other plants.
           ARRAY(SELECT DISTINCT w FROM regexp_split_to_table(btrim(posting_words(f.name)), ' ') w
                 WHERE (length(w) >= 4 OR (w ~ '[0-9]' AND length(w) >= 2))
                   AND position(' ' || w || ' ' IN posting_words(co.name || ' ' || coalesce(f.city, '') || ' ' || coalesce(f.state, ''))) = 0
                   AND w NOT IN ('plant', 'plants', 'factory', 'facility', 'facilities', 'manufacturing', 'operations', 'operation', 'division',
                                 'company', 'corporation', 'corp', 'incorporated', 'site', 'center', 'centre', 'campus', 'building', 'bldg',
                                 'works', 'north', 'south', 'east', 'west', 'america', 'american', 'usa', 'international', 'industries',
                                 'products', 'systems', 'group', 'holdings', 'technologies', 'technology', 'services', 'assembly',
                                 'space', 'exploration', 'development', 'engineering', 'research', 'global', 'general', 'national', 'united')) AS telling
    FROM factories f JOIN companies co ON co.id = f.company_id
    WHERE f.company_id IN (SELECT company_id FROM fam)
  ), pointed AS (
    SELECT pp.place_key, f.id, f.company_id
    FROM posting_places pp JOIN factories f ON f.id = record_now('factory', pp.factory_id)
    WHERE pp.source = p_source AND pp.status = 'pointed' AND pp.factory_id IS NOT NULL
  ), incity AS (
    SELECT rp.source_id, rp.place_key, o.id, o.company_id, o.workforce_size, o.curated, o.created_at, o.in_county, o.facts,
           CASE WHEN o.street IS NOT NULL AND position(' ' || o.street[1] || ' ' || o.street[2] || ' ' IN rp.words) > 0 THEN 100 ELSE 0 END
             + (SELECT count(*) FROM unnest(o.telling) w WHERE position(' ' || w || ' ' IN rp.words) > 0)::integer AS fit
    FROM rp JOIN ours o ON o.state = rp.state AND o.city_key = rp.city_key
    WHERE NOT EXISTS (SELECT 1 FROM pointed a WHERE a.place_key = rp.place_key)
  ), ranked AS (
    SELECT c.*, count(*) OVER w AS options,
           -- The posting's words first, then the most people; where neither chooses, the plant merge's own order.
           row_number() OVER (w ORDER BY c.fit DESC, c.workforce_size DESC NULLS LAST,
                                         c.curated DESC, c.in_county DESC, c.facts DESC, c.created_at, c.id) AS pick,
           count(*) FILTER (WHERE c.fit = m.best) OVER w AS at_best, m.best
    FROM incity c
    JOIN (SELECT source_id, place_key, max(fit) AS best FROM incity GROUP BY 1, 2) m ON m.source_id = c.source_id AND m.place_key = c.place_key
    WINDOW w AS (PARTITION BY c.source_id, c.place_key)
  ), empty_places AS (
    -- Places where the company has no plant in the city and no admin has pointed: the city's centre, from every plant we list there.
    SELECT pl.place_key, pl.state, c.lat, c.lng
    FROM (SELECT DISTINCT rp.place_key, rp.city_key, rp.state FROM rp
          WHERE NOT EXISTS (SELECT 1 FROM pointed a WHERE a.place_key = rp.place_key)
            AND NOT EXISTS (SELECT 1 FROM ours o WHERE o.state = rp.state AND o.city_key = rp.city_key)
            -- A place set aside as no plant (by a person or by the data) is not given the nearest plant: a posting for an
            -- office is not shown at a factory 10 km off. A plant of the company in the city itself still wins.
            AND NOT EXISTS (SELECT 1 FROM posting_places x WHERE x.source = p_source AND x.place_key = rp.place_key AND x.status = 'left')) pl
    CROSS JOIN LATERAL (
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY f.lat) AS lat, percentile_cont(0.5) WITHIN GROUP (ORDER BY f.lng) AS lng
      FROM factories f WHERE f.state = pl.state AND f.lat IS NOT NULL AND f.lng IS NOT NULL AND posting_city_key(f.city) = pl.city_key
    ) c
    WHERE c.lat IS NOT NULL
  ), near AS (
    SELECT DISTINCT ON (e.place_key) e.place_key, o.id, o.company_id, posting_metres(e.lat, e.lng, o.lat::float8, o.lng::float8) AS metres,
           count(*) OVER (PARTITION BY e.place_key)::integer AS options
    FROM empty_places e JOIN ours o ON o.state = e.state AND o.lat IS NOT NULL AND o.lng IS NOT NULL
    WHERE posting_metres(e.lat, e.lng, o.lat::float8, o.lng::float8) <= 10000
    ORDER BY e.place_key, posting_metres(e.lat, e.lng, o.lat::float8, o.lng::float8), o.id
  ), decided AS (
    SELECT rp.source_id, rp.place_key, rp.city, rp.state,
           coalesce(a.company_id, r.company_id, n.company_id) AS company_id,
           coalesce(a.id, r.id, n.id) AS factory_id,
           rp.occupation_id,
           CASE WHEN a.id IS NOT NULL THEN 'admin'
                WHEN r.id IS NOT NULL THEN CASE WHEN r.options = 1 THEN 'city'
                                                WHEN r.best >= 100 AND r.at_best = 1 THEN 'address'
                                                WHEN r.best > 0 AND r.at_best = 1 THEN 'name'
                                                WHEN r.workforce_size IS NOT NULL THEN 'largest'
                                                ELSE 'keeps' END
                WHEN n.id IS NOT NULL THEN 'near' END AS how,
           n.metres,
           coalesce(r.options, n.options, 0)::integer AS options
    FROM rp
    LEFT JOIN pointed a ON a.place_key = rp.place_key
    LEFT JOIN ranked r ON r.source_id = rp.source_id AND r.place_key = rp.place_key AND r.pick = 1
    LEFT JOIN near n ON n.place_key = rp.place_key AND a.id IS NULL AND r.id IS NULL
  )
  -- One posting is one job at a plant. Where two of the places it names come to the same plant (the plant's own
  -- city and a town beside it, or a place an admin pointed there), the place that is the plant's by rule stands
  -- and the other makes nothing: not a second job, and not a place that waits. And the near rule is a fallback for
  -- a posting that has no plant otherwise: where another place it names has its plant (by the city, or pointed), a
  -- town beside it makes nothing either, not a second job at whatever plant stands nearest that town.
  SELECT d.source_id, d.place_key, d.city, d.state, d.company_id, d.factory_id, d.occupation_id, d.how, d.metres, d.options
  FROM (SELECT decided.*,
               row_number() OVER (PARTITION BY decided.source_id, decided.factory_id
                                  ORDER BY (decided.how = 'near'), (decided.how = 'admin'), decided.metres NULLS FIRST, decided.place_key) AS nth,
               bool_or(decided.factory_id IS NOT NULL AND decided.how <> 'near') OVER (PARTITION BY decided.source_id) AS placed_otherwise
        FROM decided) d
  WHERE (d.factory_id IS NULL OR (d.nth = 1 AND NOT (d.how = 'near' AND d.placed_otherwise)))
    -- `p_place` (one place, as Admin Tools and 0067 apply it) narrows the answer, never what is weighed: a posting's
    -- other places still decide whether this one is its plant's by rule.
    AND (p_place IS NULL OR d.place_key = p_place)
$f$;
