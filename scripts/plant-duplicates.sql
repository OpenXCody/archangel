-- Plants listed twice: the cleanup. Finds every outside id (today the EPA
-- registry id) that more than one live plant row carries, decides pair by
-- pair whether the rows are certainly one plant, merges those (plant_merge)
-- and leaves the rest where an admin will see them. Then the same for plants
-- of one company that share a spot and a name. Every decision is a line in
-- load_log (load `plant-duplicates`; `look` on the lines a person should
-- read). Nothing here knows an id: it decides on the database it meets.
--
-- The functions live in pg_temp (this session only) beside the employer
-- loader's (scripts/employers-loader.sql), whose name rules they use:
-- el_norm, el_bare, el_words, el_share, el_metres, el_merge_company.
-- scripts/ingest/README.md has the rules in words.

-- ---------------------------------------------------------------------------
-- Reading names and addresses
-- ---------------------------------------------------------------------------

-- A name's words for telling that two spellings are one name: without legal
-- endings (el_bare), apostrophes closed up, the usual abbreviations written
-- out, plurals as singulars. "A & L Labs Inc" and "A & L Laboratories
-- Incorporated" read the same.
CREATE OR REPLACE FUNCTION pg_temp.pd_canon(t text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $f$
  SELECT coalesce(array_agg(w ORDER BY ord), '{}') FROM (
    SELECT ord, CASE
      WHEN w IN ('mfg', 'mfr', 'mfrs', 'mfgr', 'manufacturer', 'manufacturers', 'manufacturing') THEN 'manufacturing'
      WHEN w IN ('ind', 'inds', 'indus', 'industry', 'industries') THEN 'industry'
      WHEN w IN ('prod', 'prods', 'product', 'products') THEN 'product'
      WHEN w IN ('lab', 'labs', 'laboratory', 'laboratories') THEN 'laboratory'
      WHEN w IN ('tech', 'techs', 'technology', 'technologies') THEN 'technology'
      WHEN w IN ('assoc', 'assocs', 'associate', 'associates', 'association') THEN 'associate'
      WHEN w IN ('intl', 'internatl', 'international') THEN 'international'
      WHEN w IN ('natl', 'national') THEN 'national'
      WHEN w IN ('bros', 'brothers') THEN 'brother'
      WHEN w IN ('sys', 'system', 'systems') THEN 'system'
      WHEN w IN ('svc', 'svcs', 'service', 'services') THEN 'service'
      WHEN w IN ('chem', 'chems', 'chemical', 'chemicals') THEN 'chemical'
      WHEN w IN ('elec', 'elect', 'electric', 'electrical') THEN 'electric'
      WHEN w IN ('eng', 'engr', 'engrg', 'engineering') THEN 'engineering'
      WHEN w IN ('equip', 'equipment') THEN 'equipment'
      WHEN w IN ('pkg', 'packaging') THEN 'packaging'
      WHEN w IN ('fdry', 'foundry', 'foundries') THEN 'foundry'
      WHEN w IN ('div', 'division') THEN 'division'
      WHEN w IN ('dept', 'department') THEN 'department'
      WHEN w IN ('plt', 'plant') THEN 'plant'
      WHEN w IN ('ave', 'avenue') THEN 'avenue'
      WHEN length(w) > 3 AND w ~ '[^s]s$' THEN left(w, -1)
      ELSE w END AS w
    FROM regexp_split_to_table(pg_temp.el_bare(translate(coalesce(t, ''), '''’`', '')), ' ') WITH ORDINALITY s(w, ord)
    WHERE w NOT IN ('', 'limited', 'cos', 'companies')
  ) x
$f$;

-- Two names that are one name written twice: the same but for legal endings
-- (the loader's rule), or the same words but for abbreviation, plural,
-- spacing and punctuation ("Ace Tank and Equipment", "Acetank & Equipment").
-- (plpgsql, like the others here that call a function with a FROM of its own:
-- a SQL function plans the functions inside it again on every call.)
CREATE OR REPLACE FUNCTION pg_temp.pd_same_name(a text, b text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $f$
DECLARE
  ba text := pg_temp.el_bare(a);
  ca text[];
  cb text[];
BEGIN
  IF ba = '' THEN RETURN false; END IF;
  IF ba = pg_temp.el_bare(b) THEN RETURN true; END IF;
  ca := pg_temp.pd_canon(a);
  cb := pg_temp.pd_canon(b);
  RETURN ca = cb OR (length(array_to_string(ca, '')) >= 4 AND array_to_string(ca, '') = array_to_string(cb, ''));
END $f$;

-- A street address for comparing: lower case, no punctuation, no post office
-- box, directions and street words in their short form, "4th" as "4".
CREATE OR REPLACE FUNCTION pg_temp.pd_street(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $f$
  SELECT coalesce(string_agg(CASE w
      WHEN 'north' THEN 'n' WHEN 'south' THEN 's' WHEN 'east' THEN 'e' WHEN 'west' THEN 'w'
      WHEN 'northeast' THEN 'ne' WHEN 'northwest' THEN 'nw' WHEN 'southeast' THEN 'se' WHEN 'southwest' THEN 'sw'
      WHEN 'street' THEN 'st' WHEN 'str' THEN 'st' WHEN 'avenue' THEN 'ave' WHEN 'av' THEN 'ave' WHEN 'road' THEN 'rd' WHEN 'drive' THEN 'dr'
      WHEN 'boulevard' THEN 'blvd' WHEN 'highway' THEN 'hwy' WHEN 'hiway' THEN 'hwy' WHEN 'hgwy' THEN 'hwy'
      WHEN 'parkway' THEN 'pkwy' WHEN 'pky' THEN 'pkwy' WHEN 'pkway' THEN 'pkwy'
      WHEN 'lane' THEN 'ln' WHEN 'court' THEN 'ct' WHEN 'place' THEN 'pl' WHEN 'circle' THEN 'cir' WHEN 'route' THEN 'rt' WHEN 'rte' THEN 'rt'
      WHEN 'freeway' THEN 'fwy' WHEN 'expressway' THEN 'expy' WHEN 'expwy' THEN 'expy' WHEN 'terrace' THEN 'ter' WHEN 'trail' THEN 'trl'
      WHEN 'county' THEN 'co' WHEN 'cnty' THEN 'co' WHEN 'fort' THEN 'ft' WHEN 'saint' THEN 'st' WHEN 'mount' THEN 'mt'
      WHEN 'building' THEN 'bldg' WHEN 'suite' THEN 'ste' WHEN 'industrial' THEN 'ind' WHEN 'indl' THEN 'ind'
      WHEN 'one' THEN '1' WHEN 'two' THEN '2' WHEN 'three' THEN '3' WHEN 'four' THEN '4' WHEN 'five' THEN '5'
      WHEN 'first' THEN '1' WHEN 'second' THEN '2' WHEN 'third' THEN '3' WHEN 'fourth' THEN '4' WHEN 'fifth' THEN '5'
      ELSE regexp_replace(w, '^([0-9]+)(st|nd|rd|th)$', '\1') END, ' ' ORDER BY ord), '')
  FROM regexp_split_to_table(regexp_replace(regexp_replace(pg_temp.el_norm(t), '\m(p o|po) box [0-9]+\M', ' ', 'g'), '\mand\M', ' ', 'g'), ' +') WITH ORDINALITY s(w, ord)
  WHERE w <> ''
$f$;

-- How far two street addresses agree: 2 strictly, 1 loosely, 0 not at all
-- (or unknown: either is empty). Strictly: the same once written one way, or
-- the same house number on a street whose name begins with the same word
-- ("152 Ipsco Road", "152 Ipsco St"; "65 Pitts Station", "65 Pitt Station"),
-- or the same words in another order. Loosely (for rows already known to be
-- close together) also: the same house number of three digits or more, or
-- the same street where one row gives no number.
CREATE OR REPLACE FUNCTION pg_temp.pd_street_match(a text, b text) RETURNS integer LANGUAGE plpgsql IMMUTABLE AS $f$
DECLARE
  sa text := pg_temp.pd_street(a);
  sb text := pg_temp.pd_street(b);
  na text;
  nb text;
  ma text[];
  mb text[];
BEGIN
  IF sa = '' OR sb = '' THEN RETURN 0; END IF;
  IF sa = sb THEN RETURN 2; END IF;
  -- The house number and the first word of the street's name that is not a direction.
  ma := regexp_match(sa, '^([0-9]+) (?:(?:n|s|e|w|ne|nw|se|sw) )?([a-z0-9]+)');
  mb := regexp_match(sb, '^([0-9]+) (?:(?:n|s|e|w|ne|nw|se|sw) )?([a-z0-9]+)');
  IF ma[1] = mb[1] AND (ma[2] = mb[2] OR (length(ma[2]) >= 4 AND length(mb[2]) >= 4
                                           AND (left(mb[2], length(ma[2])) = ma[2] OR left(ma[2], length(mb[2])) = mb[2]))) THEN
    RETURN 2;
  END IF;
  -- The same words in another order ("North Route 48", "Rte 48 N").
  IF (SELECT array_agg(w ORDER BY w) FROM regexp_split_to_table(sa, ' ') w) = (SELECT array_agg(w ORDER BY w) FROM regexp_split_to_table(sb, ' ') w) THEN
    RETURN 2;
  END IF;
  na := (regexp_match(sa, '^([0-9]+)\M'))[1];
  nb := (regexp_match(sb, '^([0-9]+)\M'))[1];
  IF na IS NOT NULL AND na = nb AND length(na) >= 3 THEN RETURN 1; END IF;
  IF (na IS NULL) <> (nb IS NULL) AND btrim(regexp_replace(sa, '^[0-9]+\M', '')) <> ''
     AND btrim(regexp_replace(sa, '^[0-9]+\M', '')) = btrim(regexp_replace(sb, '^[0-9]+\M', '')) THEN
    RETURN 1;
  END IF;
  RETURN 0;
END $f$;

-- ---------------------------------------------------------------------------
-- Is it one company
-- ---------------------------------------------------------------------------

-- Whether a company has a profile of its own: featured, a web domain, a
-- description, or people who act for it.
CREATE OR REPLACE FUNCTION pg_temp.pd_profile(c uuid) RETURNS boolean LANGUAGE sql STABLE AS $f$
  SELECT coalesce((SELECT co.featured OR co.domain IS NOT NULL OR NULLIF(btrim(co.description), '') IS NOT NULL
                          OR EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = co.id)
                   FROM companies co WHERE co.id = c), false)
$f$;

-- Whether two company rows are one company, and on what evidence; null when
-- nothing recorded says so.
--   same name                       the same but for legal endings, in any letter case
--   other name                      one is known by the other's name (aliases)
--   same name, written differently  the same words but for abbreviation, plural, spacing and punctuation
--   parent                          one is recorded as part of the other
--   family                          one's name is the beginning of the other's ("Bunge", "Bunge Oils"),
--                                   unless both have a profile of their own (a joint venture
--                                   and its parent are two companies on purpose)
-- A name alone never ties a predecessor to a successor or a tenant to a
-- landlord: those stay two companies, and their plants stay for a person.
CREATE OR REPLACE FUNCTION pg_temp.pd_same_company(a uuid, b uuid) RETURNS text LANGUAGE plpgsql STABLE AS $f$
DECLARE
  x companies%ROWTYPE;
  y companies%ROWTYPE;
  bx text;
  by_ text;
BEGIN
  IF a IS NULL OR b IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO x FROM companies WHERE id = a;
  SELECT * INTO y FROM companies WHERE id = b;
  IF x.id IS NULL OR y.id IS NULL THEN RETURN NULL; END IF;
  bx := pg_temp.el_bare(x.name);
  by_ := pg_temp.el_bare(y.name);
  IF bx <> '' AND bx = by_ THEN RETURN 'same name'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(y.aliases, '{}')) n WHERE lower(n) = lower(x.name) OR pg_temp.el_bare(n) = bx)
     OR EXISTS (SELECT 1 FROM unnest(coalesce(x.aliases, '{}')) n WHERE lower(n) = lower(y.name) OR pg_temp.el_bare(n) = by_) THEN
    RETURN 'other name';
  END IF;
  IF pg_temp.pd_same_name(x.name, y.name) THEN RETURN 'same name, written differently'; END IF;
  IF x.parent_company_id = y.id OR y.parent_company_id = x.id THEN RETURN 'parent'; END IF;
  IF ((length(bx) >= 3 AND left(by_, length(bx) + 1) = bx || ' ') OR (length(by_) >= 3 AND left(bx, length(by_) + 1) = by_ || ' '))
     AND NOT (pg_temp.pd_profile(a) AND pg_temp.pd_profile(b)) THEN
    RETURN 'family';
  END IF;
  RETURN NULL;
END $f$;

-- Whether a plant's name begins with a company's name: the company's words
-- (pd_canon: no legal endings, abbreviations written out, plurals as
-- singulars) are the plant's first words, however they are spaced ("A J
-- Knott Tool" begins "AJ KNOTT TOOL & MFG CORP"). A name under three
-- characters names nothing.
CREATE OR REPLACE FUNCTION pg_temp.pd_named_for(plant text, company text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $f$
DECLARE
  cs text := array_to_string(pg_temp.pd_canon(company), '');
  pw text[] := pg_temp.pd_canon(plant);
  v_head text := '';
  w text;
BEGIN
  IF length(cs) < 3 THEN RETURN false; END IF;
  FOREACH w IN ARRAY pw LOOP
    v_head := v_head || w;
    IF v_head = cs THEN RETURN true; END IF;
    EXIT WHEN length(v_head) >= length(cs);
  END LOOP;
  RETURN false;
END $f$;

-- The company a merged plant is filed under, of the two its rows had: the one
-- a curated row was written under; else the part before its parent; else the
-- one with a profile; else the one with more plants; else the kept row's own.
CREATE OR REPLACE FUNCTION pg_temp.pd_company_for(p_keep uuid, p_gone uuid, p_rel text) RETURNS uuid LANGUAGE sql STABLE AS $f$
  SELECT CASE
    WHEN k.curated THEN k.company_id
    WHEN p_rel = 'parent' THEN (SELECT c.id FROM companies c WHERE c.id IN (k.company_id, g.company_id) AND c.parent_company_id IN (k.company_id, g.company_id) LIMIT 1)
    ELSE (SELECT c.id FROM companies c WHERE c.id IN (k.company_id, g.company_id)
          ORDER BY pg_temp.pd_profile(c.id) DESC, (SELECT count(*) FROM factories f WHERE f.company_id = c.id) DESC, (c.id = k.company_id) DESC
          LIMIT 1)
  END
  FROM factories k, factories g WHERE k.id = p_keep AND g.id = p_gone
$f$;

-- Whether a company row has nothing of its own left: no plants, people,
-- jobs, requests, invites, companies that are part of it, web domain,
-- featured flag, description, headquarters, headcounts or citations.
CREATE OR REPLACE FUNCTION pg_temp.pd_company_bare(c uuid) RETURNS boolean LANGUAGE sql STABLE AS $f$
  SELECT NOT co.featured AND co.domain IS NULL AND co.slug IS NULL AND NULLIF(btrim(co.description), '') IS NULL AND co.headquarters_city IS NULL
    AND NOT EXISTS (SELECT 1 FROM factories x WHERE x.company_id = co.id)
    AND NOT EXISTS (SELECT 1 FROM company_members x WHERE x.company_id = co.id)
    AND NOT EXISTS (SELECT 1 FROM jobs x WHERE x.company_id = co.id)
    AND NOT EXISTS (SELECT 1 FROM invites x WHERE x.company_id = co.id)
    AND NOT EXISTS (SELECT 1 FROM company_requests x WHERE x.company_id = co.id OR x.added_company_id = co.id)
    AND NOT EXISTS (SELECT 1 FROM companies x WHERE x.parent_company_id = co.id)
    AND NOT EXISTS (SELECT 1 FROM company_state_headcounts x WHERE x.company_id = co.id)
    AND NOT EXISTS (SELECT 1 FROM external_references x WHERE x.entity_type = 'companies' AND x.entity_id = co.id)
  FROM companies co WHERE co.id = c
$f$;

-- ---------------------------------------------------------------------------
-- Is it one plant
-- ---------------------------------------------------------------------------

-- What to do with two live rows that carry one outside id. Returns
--   { decision: 'merge', rule, company, metres }   they are certainly one plant
--   { decision: 'review', reason, rule, metres }   a person decides
--   { decision: 'apart' }                          an admin already said they are two
--
-- One plant (`rule`), in this order:
--   same address   within 5 km and the street addresses agree
--   same name      within 5 km and the names are one name
--   same spot      within 100 m
--   near           within 1.5 km, and one name says only the company and the place
--   placed apart   further than 5 km (one row's coordinates are wrong): only when
--                  the street addresses agree exactly and the names do not disagree
-- Never: rows filed under two states (one is misfiled, and which is not known
-- here), or two rows both written from sources.
-- One company (`company`): the same row, or pd_same_company; or `named for`:
-- two companies nothing ties together, where the plant is certain by an
-- address or a name and both rows' names begin with the name of one of the
-- two and not the other's. Then the plant is that company's (`to`), and the
-- other company row is left as it is. Any other rows under two companies
-- that nothing ties together are left for a person even when the plant is
-- plainly one: which company it belongs to is not guessed.
CREATE OR REPLACE FUNCTION pg_temp.pd_verdict(p_a uuid, p_b uuid) RETURNS jsonb LANGUAGE plpgsql STABLE AS $f$
DECLARE
  a factories%ROWTYPE;
  b factories%ROWTYPE;
  v_ca text;
  v_cb text;
  d integer;
  v_drop text[];
  wa text[];
  wb text[];
  v_class integer;
  v_street integer;
  v_rule text;
  v_rel text;
  v_reason text;
  v_to uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM plants_apart WHERE a_id = least(p_a, p_b) AND b_id = greatest(p_a, p_b)) THEN
    RETURN jsonb_build_object('decision', 'apart');
  END IF;
  SELECT * INTO a FROM factories WHERE id = p_a;
  SELECT * INTO b FROM factories WHERE id = p_b;
  SELECT name INTO v_ca FROM companies WHERE id = a.company_id;
  SELECT name INTO v_cb FROM companies WHERE id = b.company_id;
  d := CASE WHEN a.lat IS NOT NULL AND a.lng IS NOT NULL AND b.lat IS NOT NULL AND b.lng IS NOT NULL THEN pg_temp.el_metres(a.lat, a.lng, b.lat, b.lng) END;

  -- The loader's reading of two plant names: the same (0), a telling word in common (1), one says only the
  -- company and the place (2), nothing in common (3).
  v_drop := regexp_split_to_array(pg_temp.el_norm(concat_ws(' ', v_ca, v_cb, a.city, b.city, a.state, b.state)), ' ');
  IF pg_temp.pd_same_name(a.name, b.name) THEN
    v_class := 0;
  ELSE
    wa := pg_temp.el_words(a.name, v_drop);
    wb := pg_temp.el_words(b.name, v_drop);
    v_class := CASE WHEN pg_temp.el_share(wa, wb) THEN 1 WHEN cardinality(wa) = 0 OR cardinality(wb) = 0 THEN 2 ELSE 3 END;
  END IF;
  v_street := pg_temp.pd_street_match(a.address, b.address);

  v_rule := CASE
    WHEN a.state IS NOT NULL AND b.state IS NOT NULL AND a.state <> b.state THEN NULL
    WHEN a.curated AND b.curated THEN NULL
    WHEN d <= 5000 AND v_street >= 1 THEN 'same address'
    WHEN d <= 5000 AND v_class = 0 THEN 'same name'
    WHEN d <= 100 THEN 'same spot'
    WHEN d <= 1500 AND v_class = 2 THEN 'near'
    WHEN (d IS NULL OR d > 5000) AND v_street = 2 AND v_class <= 2 THEN 'placed apart'
  END;
  v_rel := CASE WHEN a.company_id IS NOT DISTINCT FROM b.company_id THEN 'one company' ELSE pg_temp.pd_same_company(a.company_id, b.company_id) END;

  -- Named for: nothing on record ties the two companies, but both rows' names begin with the name of one of them
  -- and not the other's ("AMSTED RAIL CO INC" under Amsted Rail and under Amsted Industries). The plant is that
  -- company's (the loader's own rule for a stranger's row that names a company). Only when the plant is certain by
  -- an address or a name, never when both companies have a profile, and never when a row written from sources
  -- stands under the other company. A recorded parent is decided above, by the parent rule.
  IF v_rel IS NULL AND v_rule IN ('same address', 'same name', 'placed apart') AND a.company_id IS NOT NULL AND b.company_id IS NOT NULL
     AND NOT (pg_temp.pd_profile(a.company_id) AND pg_temp.pd_profile(b.company_id)) THEN
    v_to := CASE
      WHEN pg_temp.pd_named_for(a.name, v_ca) AND pg_temp.pd_named_for(b.name, v_ca)
           AND NOT pg_temp.pd_named_for(a.name, v_cb) AND NOT pg_temp.pd_named_for(b.name, v_cb) THEN a.company_id
      WHEN pg_temp.pd_named_for(a.name, v_cb) AND pg_temp.pd_named_for(b.name, v_cb)
           AND NOT pg_temp.pd_named_for(a.name, v_ca) AND NOT pg_temp.pd_named_for(b.name, v_ca) THEN b.company_id
    END;
    IF v_to IS NOT NULL AND NOT (a.curated AND a.company_id <> v_to) AND NOT (b.curated AND b.company_id <> v_to) THEN
      RETURN jsonb_build_object('decision', 'merge', 'rule', v_rule, 'company', 'named for', 'to', v_to, 'metres', d);
    END IF;
  END IF;

  IF v_rule IS NOT NULL AND v_rel IS NOT NULL THEN
    RETURN jsonb_build_object('decision', 'merge', 'rule', v_rule, 'company', v_rel, 'metres', d);
  END IF;
  v_reason := CASE
    WHEN a.state IS NOT NULL AND b.state IS NOT NULL AND a.state <> b.state THEN 'two states'
    WHEN a.curated AND b.curated THEN 'both written from sources'
    WHEN v_rule IS NULL AND (d IS NULL OR d > 5000) THEN 'far apart'
    WHEN v_rule IS NULL THEN 'names and addresses differ'
    ELSE 'two companies' END;
  RETURN jsonb_strip_nulls(jsonb_build_object('decision', 'review', 'reason', v_reason, 'rule', v_rule, 'company', v_rel, 'metres', d,
    'twoCompanies', CASE WHEN a.company_id IS DISTINCT FROM b.company_id THEN true END));
END $f$;

-- What to do with two rows of one company on one spot (coordinates equal to
-- three decimal places) that carry no id in common: merged only when the
-- names are the same plant by the loader's own rule (el_bare) and the street
-- addresses do not disagree. Two buildings of one site are two rows on purpose.
CREATE OR REPLACE FUNCTION pg_temp.pd_spot_verdict(p_a uuid, p_b uuid) RETURNS jsonb LANGUAGE plpgsql STABLE AS $f$
DECLARE
  a factories%ROWTYPE;
  b factories%ROWTYPE;
  v_reason text;
BEGIN
  IF EXISTS (SELECT 1 FROM plants_apart WHERE a_id = least(p_a, p_b) AND b_id = greatest(p_a, p_b)) THEN
    RETURN jsonb_build_object('decision', 'apart');
  END IF;
  SELECT * INTO a FROM factories WHERE id = p_a;
  SELECT * INTO b FROM factories WHERE id = p_b;
  v_reason := CASE
    WHEN pg_temp.el_bare(a.name) <> pg_temp.el_bare(b.name) THEN 'different names'
    WHEN a.state IS NOT NULL AND b.state IS NOT NULL AND a.state <> b.state THEN 'two states'
    WHEN a.curated AND b.curated THEN 'both written from sources'
    WHEN NULLIF(btrim(a.address), '') IS NOT NULL AND NULLIF(btrim(b.address), '') IS NOT NULL
         AND pg_temp.pd_street_match(a.address, b.address) = 0 THEN 'same name, different street addresses'
  END;
  IF v_reason IS NULL THEN
    RETURN jsonb_build_object('decision', 'merge', 'rule', 'same spot and name', 'company', 'one company', 'metres', pg_temp.el_metres(a.lat, a.lng, b.lat, b.lng));
  END IF;
  RETURN jsonb_build_object('decision', 'review', 'reason', v_reason);
END $f$;

-- ---------------------------------------------------------------------------
-- Doing it
-- ---------------------------------------------------------------------------

-- A plant in a few words, for a log line.
CREATE OR REPLACE FUNCTION pg_temp.pd_says(p uuid) RETURNS text LANGUAGE sql STABLE AS $f$
  SELECT format('"%s" (%s)', f.name, concat_ws('; ', (SELECT c.name FROM companies c WHERE c.id = f.company_id),
                NULLIF(concat_ws(', ', NULLIF(btrim(f.address), ''), NULLIF(btrim(f.city), ''), f.state), '')))
  FROM factories f WHERE f.id = p
$f$;

-- Merges one pair the verdict was sure of. The row kept is plant_keeps'
-- choice. Rows under two company rows that are one company end up under one
-- (pd_company_for), rows named for one of two companies under that one (the
-- verdict's `to`); a company row that is the same name and is left with
-- nothing is merged into it (the loader's company merge: its name becomes
-- another name), any other left without plants is said so. Returns the id kept.
CREATE OR REPLACE FUNCTION pg_temp.pd_merge(p_a uuid, p_b uuid, v jsonb, p_load text, p_evidence jsonb) RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE
  v_keep uuid := plant_keeps(p_a, p_b);
  v_gone uuid := CASE WHEN plant_keeps(p_a, p_b) = p_a THEN p_b ELSE p_a END;
  v_kc uuid;
  v_gc uuid;
  v_to uuid;
  v_other uuid;
  v_moved text;
  v_why text;
  v_look boolean;
  v_other_name text;
BEGIN
  SELECT company_id INTO v_kc FROM factories WHERE id = v_keep;
  SELECT company_id INTO v_gc FROM factories WHERE id = v_gone;
  v_why := CASE v->>'rule'
    WHEN 'same address' THEN 'the same street address'
    WHEN 'same name' THEN 'the same name'
    WHEN 'same spot' THEN 'the same spot'
    WHEN 'near' THEN 'close by, and one name says only the company and the place'
    WHEN 'placed apart' THEN format('the same street address and name, placed %s km apart: one row''s coordinates were wrong, check the kept row''s', round((v->>'metres')::numeric / 1000, 1))
    WHEN 'same spot and name' THEN 'the same company, spot and name'
    ELSE v->>'rule' END;
  v_look := v->>'rule' = 'placed apart';

  IF v_kc IS DISTINCT FROM v_gc THEN
    v_to := coalesce((v->>'to')::uuid, pg_temp.pd_company_for(v_keep, v_gone, v->>'company'));
    v_other := CASE WHEN v_to = v_kc THEN v_gc ELSE v_kc END;
    SELECT name INTO v_other_name FROM companies WHERE id = v_other;
    v_why := v_why || CASE WHEN v->>'company' = 'named for'
      THEN format('; both rows are named for "%s", so the plant is filed under it; nothing on record ties it to "%s", which is left as it is',
                  (SELECT name FROM companies WHERE id = v_to), v_other_name)
      ELSE format('; "%s" and "%s" are one company (%s)', (SELECT name FROM companies WHERE id = v_to), v_other_name,
                  CASE v->>'company' WHEN 'parent' THEN 'one is recorded as part of the other' WHEN 'family' THEN 'one name begins with the other' ELSE v->>'company' END) END;
    -- Worth reading when the tie between the companies is more than a legal ending.
    v_look := v_look OR v->>'company' NOT IN ('same name', 'other name');
    IF v_to <> v_kc THEN
      UPDATE factories SET company_id = v_to, updated_at = now() WHERE id = v_keep;
      UPDATE jobs SET company_id = v_to, updated_at = now() WHERE factory_id = v_keep;
      v_why := v_why || format('; the kept row moved from "%s"', v_other_name);
    END IF;
  END IF;

  PERFORM plant_merge(v_keep, v_gone, 'cleanup', NULL, p_load, v_why, v_look, NULL,
                      coalesce(p_evidence, '{}'::jsonb) || jsonb_build_object('rule', v->>'rule', 'company', v->>'company'));

  IF v_other IS NOT NULL AND NOT EXISTS (SELECT 1 FROM factories f WHERE f.company_id = v_other) THEN
    IF v->>'company' IN ('same name', 'other name', 'same name, written differently') AND pg_temp.pd_company_bare(v_other) THEN
      PERFORM pg_temp.el_merge_company(v_to, v_other);
      INSERT INTO load_log (load, kind, action, look, company, detail, entity_id, evidence)
        VALUES (p_load, 'company', 'merged', true, (SELECT name FROM companies WHERE id = v_to),
                format('"%s" had no plants left and nothing of its own, and is the same name (%s): merged in, its name kept as another name', v_other_name, v->>'company'),
                v_to, jsonb_build_object('merged', v_other, 'mergedName', v_other_name, 'company', v->>'company'));
    ELSE
      INSERT INTO load_log (load, kind, action, look, company, detail, entity_id, evidence)
        VALUES (p_load, 'company', 'left without plants', true, v_other_name,
                format('its last plant was merged into one of "%s". The row is left: %s', (SELECT name FROM companies WHERE id = v_to),
                       CASE WHEN v->>'company' IN ('parent', 'family', 'named for') THEN 'it is a different name. Merge or delete it in Admin Tools'
                            ELSE 'it has a profile, people or requests of its own. Merge it in Admin Tools' END),
                v_other, jsonb_build_object('into', v_to, 'company', v->>'company'));
    END IF;
  END IF;
  RETURN v_keep;
END $f$;

-- A pair left for a person: said once, however often the cleanup runs.
CREATE OR REPLACE FUNCTION pg_temp.pd_leave(p_a uuid, p_b uuid, v jsonb, p_load text, p_source text, p_external_id text) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE
  v_keep uuid := plant_keeps(p_a, p_b);
  v_other uuid := CASE WHEN plant_keeps(p_a, p_b) = p_a THEN p_b ELSE p_a END;
  v_states text;
BEGIN
  IF EXISTS (SELECT 1 FROM load_log l WHERE l.load = p_load AND l.action = 'left for review' AND l.entity_id = v_keep
             AND l.evidence->>'other' = v_other::text AND l.evidence->>'reason' = v->>'reason') THEN
    RETURN;
  END IF;
  SELECT string_agg(DISTINCT state, ' and ' ORDER BY state) INTO v_states FROM factories WHERE id IN (p_a, p_b);
  INSERT INTO load_log (load, kind, action, look, company, plant, detail, metres, source_id, entity_id, evidence)
    SELECT p_load, 'plant', 'left for review', true, (SELECT c.name FROM companies c WHERE c.id = k.company_id), k.name,
      format('%s %s: %s', pg_temp.pd_says(v_other),
        CASE WHEN p_external_id IS NULL THEN 'shares its company and spot' ELSE format('carries the same id (%s %s)', p_source, p_external_id) END,
        CASE v->>'reason'
          WHEN 'two states' THEN format('filed under two states (%s): one row is misfiled', v_states)
          WHEN 'both written from sources' THEN 'both rows were written from sources'
          WHEN 'far apart' THEN format('%s km apart, and the names or street addresses do not agree: one row''s coordinates are wrong, or they are two plants', round((v->>'metres')::numeric / 1000, 1))
          WHEN 'names and addresses differ' THEN 'the names and the street addresses differ: they may be two units of one site'
          WHEN 'two companies' THEN 'one plant under two companies that nothing on record ties together: which it belongs to is for a person to say'
          WHEN 'same name, different street addresses' THEN 'the same name at two street addresses'
          ELSE v->>'reason' END),
      (v->>'metres')::integer, p_external_id, v_keep,
      jsonb_strip_nulls(jsonb_build_object('other', v_other, 'source', p_source, 'externalId', p_external_id, 'reason', v->>'reason',
        'rule', v->>'rule', 'twoCompanies', v->'twoCompanies'))
    FROM factories k WHERE k.id = v_keep;
END $f$;

-- The whole cleanup. Safe to run again: a second run finds nothing to merge
-- and says nothing new. Returns what it did as jsonb.
CREATE OR REPLACE FUNCTION pg_temp.pd_run(p_load text DEFAULT 'plant-duplicates') RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE
  r record;
  g record;
  v jsonb;
  v_first bigint;
  v_survivors uuid[];
  v_id uuid;
  v_s uuid;
  v_kept uuid;
  v_done boolean;
  v_named boolean;
  v_plants_before integer;
  v_companies_before integer;
  v_shared_before integer;
  v_pass integer := 0;
  v_merges integer;
  v_summary jsonb;
BEGIN
  -- "Table does not exist, skipping" is not news; the statements are long and their tables small (see el_load).
  PERFORM set_config('client_min_messages', 'warning', true);
  PERFORM set_config('jit', 'off', true);
  PERFORM set_config('el.load', p_load, true);
  SELECT coalesce(max(id), 0) INTO v_first FROM load_log;
  SELECT count(*) INTO v_plants_before FROM factories;
  SELECT count(*) INTO v_companies_before FROM companies c WHERE EXISTS (SELECT 1 FROM factories f WHERE f.company_id = c.id);

  -- 1. References to a plant that no longer exists. One that was merged away is followed to the plant it became;
  --    the rest are removed. Then an id whose first row went is no duplicate on the row that is left.
  FOR r IN
    SELECT x.id, x.source, x.external_id, x.url, x.entity_id, (SELECT f.id FROM factories f WHERE f.id = record_now('factory', x.entity_id)) AS now_id
    FROM external_references x
    WHERE x.entity_type = 'factories' AND NOT EXISTS (SELECT 1 FROM factories f WHERE f.id = x.entity_id)
    ORDER BY x.source, x.external_id, x.id
  LOOP
    IF r.now_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM external_references y WHERE y.entity_type = 'factories' AND y.entity_id = r.now_id AND y.source = r.source
           AND CASE WHEN r.source = 'CURATED' THEN y.url IS NOT DISTINCT FROM r.url ELSE y.external_id = r.external_id END) THEN
      UPDATE external_references SET entity_id = r.now_id,
        duplicate = duplicate OR (source <> 'CURATED' AND EXISTS (SELECT 1 FROM external_references y WHERE y.entity_type = 'factories' AND y.source = r.source
                                   AND y.external_id = r.external_id AND y.id <> r.id AND NOT y.duplicate))
        WHERE id = r.id;
      INSERT INTO load_log (load, kind, action, look, plant, detail, source_id, entity_id)
        VALUES (p_load, 'reference', 'moved', false, (SELECT name FROM factories WHERE id = r.now_id),
                format('%s pointed at a plant that was merged into this one', r.source), CASE WHEN r.source <> 'CURATED' THEN r.external_id END, r.now_id);
    ELSE
      DELETE FROM external_references WHERE id = r.id;
      INSERT INTO load_log (load, kind, action, look, detail, source_id, entity_id)
        VALUES (p_load, 'reference', 'removed', false, format('%s pointed at a plant that no longer exists', r.source),
                CASE WHEN r.source <> 'CURATED' THEN r.external_id END, r.entity_id);
    END IF;
  END LOOP;
  UPDATE external_references x SET duplicate = false
  FROM (SELECT DISTINCT ON (y.source, y.external_id) y.id
        FROM external_references y
        WHERE y.entity_type = 'factories' AND y.source <> 'CURATED' AND y.duplicate
          AND NOT EXISTS (SELECT 1 FROM external_references z WHERE z.entity_type = 'factories' AND z.source = y.source
                          AND z.external_id = y.external_id AND NOT z.duplicate)
        ORDER BY y.source, y.external_id, y.created_at, y.id) first
  WHERE x.id = first.id;

  SELECT count(*) INTO v_shared_before FROM (
    SELECT 1 FROM external_references x JOIN factories f ON f.id = x.entity_id
    WHERE x.entity_type = 'factories' AND x.source <> 'CURATED' GROUP BY x.source, x.external_id HAVING count(DISTINCT x.entity_id) > 1) s;

  -- Steps 2 and 3 are repeated until a pass merges nothing: a merge on a spot can leave a row carrying an id
  -- another row carries, and a merge on an id can move a row beside its twin. Twice is the rule; five is the limit.
  LOOP
    v_pass := v_pass + 1;
    v_merges := 0;

    -- 2. Ids carried by more than one live plant. The row plant_keeps would keep of them all is tried first; a row
    --    that is certainly the same plant as one already standing is merged into it, any other stands beside it and
    --    the pair is left for a person.
    FOR g IN
      SELECT x.source, x.external_id, array_agg(DISTINCT x.entity_id) AS plants
      FROM external_references x JOIN factories f ON f.id = x.entity_id
      WHERE x.entity_type = 'factories' AND x.source <> 'CURATED'
      GROUP BY x.source, x.external_id HAVING count(DISTINCT x.entity_id) > 1
      ORDER BY x.source, x.external_id
    LOOP
      v_kept := g.plants[1];
      FOREACH v_id IN ARRAY g.plants LOOP v_kept := plant_keeps(v_kept, v_id); END LOOP;
      v_survivors := ARRAY[v_kept];
      FOR v_id IN SELECT p FROM unnest(g.plants) p WHERE p <> v_kept ORDER BY p LOOP
        -- A row merged away earlier in this run, as one of another id's pair.
        CONTINUE WHEN NOT EXISTS (SELECT 1 FROM factories f WHERE f.id = v_id);
        v_done := false;
        FOREACH v_s IN ARRAY v_survivors LOOP
          v := pg_temp.pd_verdict(v_s, v_id);
          IF v->>'decision' = 'merge' THEN
            v_kept := pg_temp.pd_merge(v_s, v_id, v, p_load, jsonb_build_object('source', g.source, 'externalId', g.external_id, 'by', 'id'));
            v_merges := v_merges + 1;
            v_survivors := array_replace(v_survivors, v_s, v_kept);
            v_done := true;
            EXIT;
          END IF;
        END LOOP;
        IF NOT v_done THEN
          v := pg_temp.pd_verdict(v_survivors[1], v_id);
          IF v->>'decision' = 'review' THEN PERFORM pg_temp.pd_leave(v_survivors[1], v_id, v, p_load, g.source, g.external_id); END IF;
          v_survivors := v_survivors || v_id;
        END IF;
      END LOOP;
    END LOOP;

    -- 3. Plants of one company on one spot under one name, with no id in common (those were decided above).
    FOR g IN
      WITH spots AS (
        SELECT company_id, round(lat::numeric, 3) AS rlat, round(lng::numeric, 3) AS rlng
        FROM factories WHERE company_id IS NOT NULL AND lat IS NOT NULL AND lng IS NOT NULL
        GROUP BY 1, 2, 3 HAVING count(*) > 1)
      SELECT f.company_id, s.rlat, s.rlng, array_agg(f.id ORDER BY f.id) AS plants, count(DISTINCT pg_temp.el_bare(f.name)) AS names
      FROM spots s JOIN factories f ON f.company_id = s.company_id AND round(f.lat::numeric, 3) = s.rlat AND round(f.lng::numeric, 3) = s.rlng
      GROUP BY f.company_id, s.rlat, s.rlng
      ORDER BY f.company_id, s.rlat, s.rlng
    LOOP
      v_kept := g.plants[1];
      FOREACH v_id IN ARRAY g.plants LOOP v_kept := plant_keeps(v_kept, v_id); END LOOP;
      v_survivors := ARRAY[v_kept];
      v_named := false;
      FOR v_id IN SELECT p FROM unnest(g.plants) p WHERE p <> v_kept ORDER BY p LOOP
        v_done := false;
        FOREACH v_s IN ARRAY v_survivors LOOP
          -- Two rows that share an id were decided as that id's pair.
          CONTINUE WHEN EXISTS (SELECT 1 FROM external_references x JOIN external_references y ON y.source = x.source AND y.external_id = x.external_id
                                WHERE x.entity_type = 'factories' AND y.entity_type = 'factories' AND x.source <> 'CURATED' AND x.entity_id = v_s AND y.entity_id = v_id);
          v := pg_temp.pd_spot_verdict(v_s, v_id);
          IF v->>'decision' = 'merge' THEN
            v_kept := pg_temp.pd_merge(v_s, v_id, v, p_load, jsonb_build_object('by', 'spot'));
            v_merges := v_merges + 1;
            v_survivors := array_replace(v_survivors, v_s, v_kept);
            v_done := true;
            EXIT;
          ELSIF v->>'decision' = 'review' AND v->>'reason' = 'different names' THEN
            v_named := true;
          ELSIF v->>'decision' = 'review' THEN
            -- The same name on one spot, and still not certain: a person should look.
            PERFORM pg_temp.pd_leave(v_s, v_id, v, p_load, NULL, NULL);
          END IF;
        END LOOP;
        IF NOT v_done THEN v_survivors := v_survivors || v_id; END IF;
      END LOOP;
      -- Rows that stand side by side under different names are two rows on purpose (two buildings of one site): said once.
      IF v_named AND NOT EXISTS (
           SELECT 1 FROM load_log l WHERE l.load = p_load AND l.action = 'left apart' AND l.entity_id = v_survivors[1]
             AND l.evidence->'plants' = to_jsonb(v_survivors)) THEN
        INSERT INTO load_log (load, kind, action, look, company, plant, detail, entity_id, evidence)
          SELECT p_load, 'plant', 'left apart', false, (SELECT c.name FROM companies c WHERE c.id = k.company_id), k.name,
                 format('%s rows of the company stand on this spot under different names and stay separate rows: %s',
                        cardinality(v_survivors), (SELECT string_agg('"' || f.name || '"', '; ' ORDER BY f.name) FROM factories f WHERE f.id = ANY (v_survivors))),
                 k.id, jsonb_build_object('plants', to_jsonb(v_survivors), 'by', 'spot')
          FROM factories k WHERE k.id = v_survivors[1];
      END IF;
    END LOOP;

    EXIT WHEN v_merges = 0 OR v_pass >= 5;
  END LOOP;

  -- What this run did, from its own lines.
  SELECT jsonb_build_object(
    'plantsBefore', v_plants_before,
    'plantsAfter', (SELECT count(*) FROM factories),
    'listedCompaniesBefore', v_companies_before,
    'listedCompaniesAfter', (SELECT count(*) FROM companies c WHERE EXISTS (SELECT 1 FROM factories f WHERE f.company_id = c.id)),
    'idsSharedBefore', v_shared_before,
    'idsSharedAfter', (SELECT count(*) FROM (
       SELECT 1 FROM external_references x JOIN factories f ON f.id = x.entity_id
       WHERE x.entity_type = 'factories' AND x.source <> 'CURATED' GROUP BY x.source, x.external_id HAVING count(DISTINCT x.entity_id) > 1) s),
    'mergedById', count(*) FILTER (WHERE l.action = 'merged' AND l.kind = 'plant' AND l.evidence->>'by' = 'id'),
    'mergedBySpot', count(*) FILTER (WHERE l.action = 'merged' AND l.kind = 'plant' AND l.evidence->>'by' = 'spot'),
    'leftForReview', count(*) FILTER (WHERE l.action = 'left for review'),
    'passes', v_pass,
    'companiesMerged', count(*) FILTER (WHERE l.kind = 'company' AND l.action = 'merged'),
    'companiesLeftWithoutPlants', count(*) FILTER (WHERE l.kind = 'company' AND l.action = 'left without plants'),
    'referencesRemoved', count(*) FILTER (WHERE l.kind = 'reference' AND l.action = 'removed'),
    'referencesMoved', count(*) FILTER (WHERE l.kind = 'reference' AND l.action = 'moved'),
    'byRule', coalesce((SELECT jsonb_object_agg(rule, n) FROM (SELECT m.evidence->>'rule' AS rule, count(*) AS n FROM load_log m
                         WHERE m.id > v_first AND m.load = p_load AND m.kind = 'plant' AND m.action = 'merged' GROUP BY 1) t), '{}'::jsonb),
    'byCompany', coalesce((SELECT jsonb_object_agg(company, n) FROM (SELECT m.evidence->>'company' AS company, count(*) AS n FROM load_log m
                         WHERE m.id > v_first AND m.load = p_load AND m.kind = 'plant' AND m.action = 'merged' GROUP BY 1) t), '{}'::jsonb),
    'byReason', coalesce((SELECT jsonb_object_agg(reason, n) FROM (SELECT m.evidence->>'reason' AS reason, count(*) AS n FROM load_log m
                         WHERE m.id > v_first AND m.load = p_load AND m.action = 'left for review' GROUP BY 1) t), '{}'::jsonb))
    INTO v_summary
  FROM load_log l WHERE l.id > v_first AND l.load = p_load;

  -- The summary is a line of its own only when the run did something.
  IF EXISTS (SELECT 1 FROM load_log l WHERE l.id > v_first AND l.load = p_load) THEN
    INSERT INTO load_log (load, kind, action, look, detail, evidence)
      VALUES (p_load, 'run', 'summary', true,
              format('%s plants before, %s after. %s ids were carried by more than one plant; %s pairs merged on an id, %s on a spot and a name; %s pairs left for a person; %s company rows merged; %s references to plants that no longer exist removed.',
                     v_summary->>'plantsBefore', v_summary->>'plantsAfter', v_summary->>'idsSharedBefore', v_summary->>'mergedById', v_summary->>'mergedBySpot',
                     v_summary->>'leftForReview', v_summary->>'companiesMerged', v_summary->>'referencesRemoved'),
              v_summary);
  END IF;
  RETURN v_summary;
END $f$;

-- A rehearsal: runs the whole cleanup, reads what it decided, then undoes it
-- (the employer loader's way: the work is done in a block that ends by
-- raising an error, and the report rides out in the error). `schema_sql` is
-- scripts/plant-merge.sql, for a copy that does not have it yet. With
-- `everything` every line is returned, not only the ones marked for a look.
CREATE OR REPLACE FUNCTION pg_temp.pd_rehearse(schema_sql text, everything boolean) RETURNS SETOF text LANGUAGE plpgsql AS $f$
DECLARE
  v_report text;
  v_first bigint;
  v_summary jsonb;
BEGIN
  BEGIN
    IF schema_sql IS NOT NULL THEN EXECUTE schema_sql; END IF;
    SELECT coalesce(max(id), 0) INTO v_first FROM load_log;
    v_summary := pg_temp.pd_run('plant-duplicates');
    SELECT jsonb_pretty(v_summary) || E'\n' || coalesce(string_agg(
             format('%s%s %s | %s%s%s', CASE WHEN l.look THEN '' ELSE '  ' END, l.kind, l.action, coalesce(l.company, ''),
                    coalesce(' / ' || l.plant, ''), coalesce(' | ' || l.detail, '')), E'\n' ORDER BY l.id), '')
      INTO v_report
    FROM load_log l WHERE l.id > v_first AND l.load = 'plant-duplicates' AND (l.look OR everything) AND l.action <> 'summary';
    RAISE EXCEPTION USING ERRCODE = 'PD001', MESSAGE = coalesce(v_report, 'nothing to do');
  EXCEPTION WHEN SQLSTATE 'PD001' THEN
    GET STACKED DIAGNOSTICS v_report = MESSAGE_TEXT;
  END;
  RETURN QUERY SELECT regexp_split_to_table(v_report, E'\n');
END $f$;
