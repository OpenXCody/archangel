#!/usr/bin/env bash
# End-to-end check of "one row for one plant": the database's plant merge
# (plant_merge, plant_keeps: scripts/plant-merge.sql), the cleanup migration
# over rows shaped like production's (migrations/0051_plant_duplicates.sql),
# and the Admin Tools routes over them. Prints one line per check and exits
# non-zero if any fail.
#
# LOCAL ONLY: it creates companies named "E2E Dupes ..." with plants in an
# empty part of Nevada (39.2 to 39.9 N, 116.9 to 116.0 W), outside ids under
# the source "E2E_DUPES", an intake source "e2e-dupes", users at @dupes.test,
# and removes all of it at the end. The cleanup itself is tried inside a
# transaction that is rolled back.
#   API=http://localhost:3000/api DB=postgresql://... bash tests/api/dupes.sh
# Needs a running dev API on the same database, and psql, curl and node.
set -u
. "$(dirname "$0")/lib.sh"
case "$DB" in *@localhost[:/]*|*@127.0.0.1[:/]*) ;; *) echo "Refusing to run against that database: local only."; exit 2;; esac
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
D=$(mktemp -d)
RUN=$(date +%s)
CHECK_SHOWS=300
expect() { # name wanted got
  if [ "$2" = "$3" ]; then echo "ok    $1"; else echo "FAIL  $1: wanted [$2] got [$3]"; fail=1; fi
}
PW='"password":"correct horse"'
NOBODY=00000000-0000-4000-8000-000000000000

cleanup() {
  psql "$DB" -qtA >/dev/null 2>&1 <<'SQL'
DELETE FROM audit_log WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%@dupes.test') OR record_name ILIKE 'E2E Dupes %';
DELETE FROM load_log WHERE plant ILIKE 'E2E Dupes %' OR company LIKE 'E2E Dupes %' OR load = 'e2e-dupes';
DELETE FROM intake_sources WHERE slug = 'e2e-dupes';
DELETE FROM external_references WHERE source = 'E2E_DUPES' OR url LIKE 'https://dupes.test/%';
DELETE FROM jobs WHERE title LIKE 'E2E Dupes %';
DELETE FROM factories WHERE name ILIKE 'E2E Dupes %' OR company_id IN (SELECT id FROM companies WHERE name LIKE 'E2E Dupes %');
DELETE FROM record_merges WHERE from_name ILIKE 'E2E Dupes %';
DELETE FROM companies WHERE name LIKE 'E2E Dupes %';
DELETE FROM users WHERE email LIKE '%@dupes.test';
SQL
}
trap 'cleanup; rm -rf "$D"' EXIT
cleanup

plant() { sql "SELECT id FROM factories WHERE name = '$1'"; }
# One plant: company, name, latitude, longitude, then any columns as `col => value` SQL.
add() { # company name lat lng [extra columns] [extra values]
  sql "INSERT INTO factories (company_id, name, latitude, longitude, state${5:+, $5}) VALUES ((SELECT id FROM companies WHERE name = '$1'), '$2', '$3', '$4', 'NV'${6:+, $6}) RETURNING id" | head -n1
}
ref() { sql "INSERT INTO external_references (entity_type, entity_id, source, external_id, duplicate) VALUES ('factories', '$1', 'E2E_DUPES', '$2', ${3:-false})" >/dev/null; }
cite() { sql "INSERT INTO external_references (entity_type, entity_id, source, external_id, url) VALUES ('factories', '$1', 'CURATED', 'e2e', 'https://dupes.test/$2')" >/dev/null; }

# ---------------------------------------------------------------------------
# 1. plant_merge: what the kept row keeps, takes and gathers
# ---------------------------------------------------------------------------
sql "INSERT INTO companies (name) VALUES ('E2E Dupes Acme'), ('E2E Dupes Other')" >/dev/null
sql "INSERT INTO users (email, name, password_hash) VALUES ('poster@dupes.test', 'Pat Poster', 'x')" >/dev/null
CAREER=$(sql "SELECT id FROM occupations ORDER BY title LIMIT 1")
CAREER2=$(sql "SELECT id FROM occupations ORDER BY title OFFSET 1 LIMIT 1")
# KEEP has a name, an address and a place; its ZIP, industry, people and opening year are empty, and an admin emptied what it makes.
KEEP=$(add 'E2E Dupes Acme' 'E2E DUPES ACME MILL' 39.5000 -116.5000 'address, city' "'1 Mill Rd', 'ELKO'")
# GONE is the same mill from another list: another address, and the facts KEEP lacks.
GONE=$(add 'E2E Dupes Other' 'E2E DUPES ACME MILL CO' 39.5010 -116.5000 \
  'address, city, zip_code, primary_naics, primary_naics_description, workforce_size, workforce_year, workforce_source, products, opened_year' \
  "'9 Other St', 'CARLIN', '89801', '331110', 'Primary Metal Manufacturing', 120, 2023, 'https://dupes.test/people', 'Steel bar', 1999")
sql "INSERT INTO fact_sources (factory_id, fact, source, rank) VALUES ('$KEEP', 'products', 'admin', 100), ('$GONE', 'zip', 'e2e-dupes', 40)" >/dev/null
# Both carry one id (KEEP's row is the one marked duplicate); GONE carries another of its own.
ref "$KEEP" E2E-D-1 true; ref "$GONE" E2E-D-1; ref "$GONE" E2E-D-2
cite "$KEEP" one; cite "$GONE" one; cite "$GONE" two
sql "INSERT INTO jobs (company_id, factory_id, occupation_id, title, expires_at, created_by)
     VALUES ((SELECT id FROM companies WHERE name = 'E2E Dupes Other'), '$GONE', '$CAREER', 'E2E Dupes Welder', now() + interval '30 days', (SELECT id FROM users WHERE email = 'poster@dupes.test'))" >/dev/null
sql "INSERT INTO factory_occupations (factory_id, occupation_id, headcount) VALUES ('$KEEP', '$CAREER', 5), ('$GONE', '$CAREER', 9), ('$GONE', '$CAREER2', 3)" >/dev/null
# Intake: a staged record resolved to GONE, one that an admin said is not GONE, and a match waiting on GONE and KEEP.
sql "INSERT INTO intake_sources (slug, name, ref_source) VALUES ('e2e-dupes', 'E2E dupes', 'E2E_DUPES')" >/dev/null
sql "INSERT INTO intake_runs (source, state) VALUES ('e2e-dupes', 'applied')" >/dev/null
IRUN=$(sql "SELECT max(id) FROM intake_runs WHERE source = 'e2e-dupes'")
sql "INSERT INTO intake_records (source, source_id, first_run_id, changed_run_id, payload, facts, hash)
     SELECT 'e2e-dupes', s, $IRUN, $IRUN, '{}', '{}', 'h' FROM unnest(ARRAY['R1', 'R2', 'R3']) s" >/dev/null
sql "INSERT INTO intake_links (source, source_id, entity_id, resolution, resolved_run_id, not_ids) VALUES
       ('e2e-dupes', 'R1', '$GONE', 'id', $IRUN, '{}'), ('e2e-dupes', 'R2', NULL, 'held', $IRUN, ARRAY['$GONE']::uuid[]), ('e2e-dupes', 'R3', NULL, 'review', $IRUN, '{}')" >/dev/null
sql "INSERT INTO intake_review (source, source_id, run_id, reason, candidates)
     VALUES ('e2e-dupes', 'R3', $IRUN, 'two fit', jsonb_build_array(jsonb_build_object('id', '$GONE', 'rule', 'near'), jsonb_build_object('id', '$KEEP', 'rule', 'near')))" >/dev/null
# A run filled GONE's ZIP: its journal should follow the fact.
sql "INSERT INTO intake_changes (run_id, op, entity_id, fact, before, after) VALUES ($IRUN, 'fact', '$GONE', 'zip', '{\"zip_code\": null}', '{\"zip_code\": \"89801\"}')" >/dev/null

expect "the kept row would take what it lacks, and not what an admin emptied" 'zip,industry,headcount,opened' "$(sql "SELECT array_to_string(plant_merge_takes('$KEEP', '$GONE'), ',')")"
expect "a plant into itself is refused"       'PM400' "$(psql "$DB" -qtAc "SELECT plant_merge('$KEEP', '$KEEP')" 2>&1 >/dev/null | grep -c . >/dev/null; psql "$DB" -qtA -v VERBOSITY=sqlstate -c "SELECT plant_merge('$KEEP', '$KEEP')" 2>&1 | grep -o 'PM[0-9]*')"
expect "a plant that is not there is refused" 'PM404' "$(psql "$DB" -qtA -v VERBOSITY=sqlstate -c "SELECT plant_merge('$KEEP', '$NOBODY')" 2>&1 | grep -o 'PM[0-9]*')"
sql "UPDATE factories SET curated = true WHERE id = '$GONE'" >/dev/null
expect "a plant written from sources is not merged into one that was not" 'PM409' "$(psql "$DB" -qtA -v VERBOSITY=sqlstate -c "SELECT plant_merge('$KEEP', '$GONE')" 2>&1 | grep -o 'PM[0-9]*')"
expect "and a refusal changes nothing"        '2' "$(sql "SELECT count(*) FROM factories WHERE id IN ('$KEEP', '$GONE')")"
expect "of a curated row and a bare one, the curated one is kept" "$GONE" "$(sql "SELECT plant_keeps('$KEEP', '$GONE')")"
sql "UPDATE factories SET curated = false WHERE id = '$GONE'" >/dev/null
expect "else the one with a headcount"        "$GONE" "$(sql "SELECT plant_keeps('$KEEP', '$GONE')")"

OUT=$(sql "SELECT plant_merge('$KEEP', '$GONE', 'admin', NULL, 'plant-merge', 'the suite said so')")
expect "the merge answers with what it took"  'zip,industry,headcount,opened' "$(printf '%s' "$OUT" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).took.join(',')))")"
expect "the other row is gone"                '0' "$(sql "SELECT count(*) FROM factories WHERE id = '$GONE'")"
expect "the kept row keeps its name, company, address and city" 'E2E DUPES ACME MILL|E2E Dupes Acme|1 Mill Rd|ELKO' \
  "$(sql "SELECT f.name, c.name, f.address, f.city FROM factories f JOIN companies c ON c.id = f.company_id WHERE f.id = '$KEEP'")"
expect "it takes the ZIP, the industry with its code, the people with their year and source, and the year opened" \
  '89801|331110|Primary Metal Manufacturing|120|2023|https://dupes.test/people|1999' \
  "$(sql "SELECT zip_code, primary_naics, primary_naics_description, workforce_size, workforce_year, workforce_source, opened_year FROM factories WHERE id = '$KEEP'")"
expect "what an admin emptied stays empty"    '' "$(sql "SELECT products FROM factories WHERE id = '$KEEP'")"
expect "the clean code follows the code taken" '331110' "$(sql "SELECT naics FROM factories WHERE id = '$KEEP'")"
expect "where each fact came from follows it: the ZIP's source moved, the rest are marked merged" \
  'headcount merged 10 2023-12-31; industry merged 10 -; opened merged 10 -; products admin 100 -; zip e2e-dupes 40 -' \
  "$(sql "SELECT string_agg(fact || ' ' || source || ' ' || rank || ' ' || coalesce(as_of::text, '-'), '; ' ORDER BY fact) FROM fact_sources WHERE factory_id = '$KEEP'")"
expect "the job is at the kept plant, for its company" 'E2E Dupes Acme' "$(sql "SELECT c.name FROM jobs j JOIN companies c ON c.id = j.company_id WHERE j.title = 'E2E Dupes Welder' AND j.factory_id = '$KEEP'")"
expect "careers recorded at either plant are at the kept one, its own line standing" '5,3' \
  "$(sql "SELECT string_agg(headcount::text, ',' ORDER BY headcount DESC) FROM factory_occupations WHERE factory_id = '$KEEP'")"
expect "citations: one per source address"    'https://dupes.test/one,https://dupes.test/two' "$(sql "SELECT string_agg(url, ',' ORDER BY url) FROM external_references WHERE entity_id = '$KEEP' AND source = 'CURATED'")"
expect "the id both carried is held once and is no duplicate; the other id moved" 'E2E-D-1 false,E2E-D-2 false' \
  "$(sql "SELECT string_agg(external_id || ' ' || duplicate, ',' ORDER BY external_id) FROM external_references WHERE entity_id = '$KEEP' AND source = 'E2E_DUPES'")"
expect "no reference is left on the row that went" '0' "$(sql "SELECT count(*) FROM external_references WHERE entity_id = '$GONE'")"
expect "the staged record resolved to it is resolved to the kept plant" "$KEEP" "$(sql "SELECT entity_id FROM intake_links WHERE source = 'e2e-dupes' AND source_id = 'R1'")"
expect "what a record was said not to be follows too" "{$KEEP}" "$(sql "SELECT not_ids FROM intake_links WHERE source = 'e2e-dupes' AND source_id = 'R2'")"
expect "a waiting match names the kept plant once" "$KEEP" "$(sql "SELECT string_agg(c->>'id', ',') FROM intake_review q, jsonb_array_elements(q.candidates) c WHERE q.source = 'e2e-dupes'")"
expect "the run that filled the ZIP can still take it back" "$KEEP" "$(sql "SELECT entity_id FROM intake_changes WHERE run_id = $IRUN AND fact = 'zip'")"
expect "the merge is remembered"              "$KEEP admin E2E DUPES ACME MILL CO" "$(sql "SELECT into_id || ' ' || via || ' ' || from_name FROM record_merges WHERE kind = 'factory' AND from_id = '$GONE'")"
expect "and the old id leads to the kept plant" "$KEEP" "$(sql "SELECT record_now('factory', '$GONE')")"
expect "one line in the log says which row was kept, why, and what was taken" \
  'plant merged E2E Dupes Acme E2E DUPES ACME MILL 111 | kept, and "E2E DUPES ACME MILL CO" (filed under "E2E Dupes Other") merged into it: the suite said so. Taken from it: zip, industry, headcount, opened; 1 job moved; 1 career moved; 1 citation moved; 1 outside id moved; 1 shared id kept once.' \
  "$(sql "SELECT kind || ' ' || action || ' ' || company || ' ' || plant || ' ' || metres || ' | ' || detail FROM load_log WHERE load = 'plant-merge' AND entity_id = '$KEEP'")"
expect "with the row that went in its evidence" "$GONE" "$(sql "SELECT evidence->>'merged' FROM load_log WHERE load = 'plant-merge' AND entity_id = '$KEEP'")"

# Of two bare rows, the one placed in a county (its coordinates agree with its state) is kept before the one with more facts.
PLACED=$(add 'E2E Dupes Acme' 'E2E DUPES ACME PLACED' 39.7000 -116.5000 'county_fips' "(SELECT fips FROM counties ORDER BY fips LIMIT 1)")
FULLER=$(add 'E2E Dupes Acme' 'E2E DUPES ACME FULLER' 39.7000 -116.5000 'address, zip_code, primary_naics' "'1 Fuller Rd', '89801', '332710'")
expect "then the one placed in a county"      "$PLACED" "$(sql "SELECT plant_keeps('$FULLER', '$PLACED')")"
sql "UPDATE factories SET county_fips = NULL WHERE id = '$PLACED'" >/dev/null
expect "then the one with more facts"         "$FULLER" "$(sql "SELECT plant_keeps('$FULLER', '$PLACED')")"
sql "DELETE FROM factories WHERE id IN ('$PLACED', '$FULLER')" >/dev/null

# A post office box is not where a plant is.
BOX=$(add 'E2E Dupes Acme' 'E2E DUPES ACME BOX' 39.6000 -116.5000 'address' "'PO BOX 12'")
STREET=$(add 'E2E Dupes Acme' 'E2E DUPES ACME BOX INC' 39.6000 -116.5000 'address' "'77 Real St'")
sql "SELECT plant_merge('$BOX', '$STREET')" >/dev/null
expect "a street address is taken over a post office box" '77 Real St' "$(sql "SELECT address FROM factories WHERE id = '$BOX'")"

# ---------------------------------------------------------------------------
# 2. The cleanup migration, on rows shaped like production's, rolled back
# ---------------------------------------------------------------------------
# In each pair the row meant to be kept has a fact the other lacks, so the keeper rule never falls to the ids.
cat > "$D/fixture.sql" <<'SQL'
INSERT INTO companies (name, domain, parent_company_id) VALUES
  ('E2E Dupes Widget Prods', NULL, NULL), ('E2E Dupes Widget Products', NULL, NULL),
  ('E2E Dupes Gadget', 'gadget.dupes.test', NULL), ('E2E Dupes Gadget Coatings', NULL, NULL),
  ('E2E Dupes Landlord', NULL, NULL), ('E2E Dupes Tenant', NULL, NULL),
  ('E2E Dupes Namesake', NULL, NULL), ('E2E Dupes Holding', NULL, NULL),
  ('E2E Dupes Maker', 'maker.dupes.test', NULL), ('E2E Dupes Owner', 'owner.dupes.test', NULL),
  ('E2E Dupes Smith', NULL, NULL), ('E2E Dupes Capital', NULL, NULL),
  ('E2E Dupes Nearby', NULL, NULL), ('E2E Dupes Fund', NULL, NULL),
  ('E2E Dupes Brandname', NULL, NULL), ('E2E Dupes Parentco', 'parentco.dupes.test', NULL);
CREATE TEMP TABLE e2e (n text, co text, name text, lat text, lng text, addr text, st text, extra jsonb, id_ text, dup boolean) ON COMMIT DROP;
INSERT INTO e2e VALUES
  -- a: one company, one street address, 300 m apart
  ('a1', 'E2E Dupes Acme', 'E2E DUPES ACME FOUNDRY', '39.2000', '-116.9000', '100 Forge Road', 'NV', '{"naics": "331511"}', 'C-A', false),
  ('a2', 'E2E Dupes Acme', 'E2E DUPES ACME CASTINGS DIV', '39.2027', '-116.9000', '100 FORGE RD', 'NV', '{}', 'C-A', true),
  -- b: one company, 20 km apart, the same name and street address
  ('b1', 'E2E Dupes Acme', 'E2E DUPES ACME PRESS SHOP', '39.2000', '-116.7000', '5 Press St', 'NV', '{"naics": "332119"}', 'C-B', false),
  ('b2', 'E2E Dupes Acme', 'E2E DUPES ACME PRESS SHOP INC', '39.3800', '-116.7000', '5 PRESS STREET', 'NV', '{}', 'C-B', true),
  -- c: one company, 20 km apart, different names and addresses
  ('c1', 'E2E Dupes Acme', 'E2E DUPES ACME NORTH WORKS', '39.2000', '-116.5000', '1 North Rd', 'NV', '{"naics": "332312"}', 'C-C', false),
  ('c2', 'E2E Dupes Acme', 'E2E DUPES ACME SOUTH YARD', '39.3800', '-116.5000', '80 South Ave', 'NV', '{}', 'C-C', true),
  -- d: two company rows that are one name written twice; the smaller is left with nothing
  ('d1', 'E2E Dupes Widget Products', 'E2E DUPES WIDGET PRODUCTS', '39.2000', '-116.3000', '7 Widget Way', 'NV', '{"naics": "332999"}', 'C-D', false),
  ('d2', 'E2E Dupes Widget Prods', 'E2E DUPES WIDGET PRODS INC', '39.2010', '-116.3000', '7 WIDGET WAY', 'NV', '{}', 'C-D', true),
  ('d3', 'E2E Dupes Widget Products', 'E2E DUPES WIDGET PLANT 2', '39.7000', '-116.3000', NULL, 'NV', '{}', NULL, false),
  -- e: two companies nothing ties together, one street address
  ('e1', 'E2E Dupes Landlord', 'E2E DUPES LANDLORD PARK', '39.2000', '-116.1000', '9 Shared Dr', 'NV', '{"naics": "326199"}', 'C-E', false),
  ('e2', 'E2E Dupes Tenant', 'E2E DUPES TENANT MOULDING', '39.2005', '-116.1000', '9 SHARED DR', 'NV', '{}', 'C-E', true),
  -- f: a row written from sources beside a fuller bare row
  ('f1', 'E2E Dupes Acme', 'E2E DUPES ACME BARE BUT FULL', '39.4000', '-116.9000', '3 Curated Ct', 'NV', '{"naics": "333111", "zip": "89801", "people": 40}', 'C-F', false),
  ('f2', 'E2E Dupes Acme', 'E2E Dupes Acme Works', '39.4004', '-116.9000', '3 Curated Court', 'NV', '{"curated": true}', 'C-F', true),
  -- g: one row filed under another state
  ('g1', 'E2E Dupes Acme', 'E2E DUPES ACME BORDER', '39.4000', '-116.7000', '2 Border Rd', 'NV', '{}', 'C-G', false),
  ('g2', 'E2E Dupes Acme', 'E2E DUPES ACME BORDER', '39.4000', '-116.7000', '2 Border Rd', 'UT', '{}', 'C-G', true),
  -- h: a company and one whose name begins with its name; only one has a profile
  ('h1', 'E2E Dupes Gadget Coatings', 'E2E DUPES GADGET COATINGS', '39.4000', '-116.5000', '4 Paint Ln', 'NV', '{"naics": "325510"}', 'C-H', false),
  ('h2', 'E2E Dupes Gadget', 'E2E DUPES GADGET', '39.4003', '-116.5000', '4 PAINT LANE', 'NV', '{}', 'C-H', true),
  -- n: two companies nothing ties together, one address, and both rows named for one of them: the plant is that company's
  ('n1', 'E2E Dupes Namesake', 'E2E DUPES NAMESAKE INC', '39.2500', '-116.9000', '11 Name St', 'NV', '{"naics": "332999"}', 'C-N', false),
  ('n2', 'E2E Dupes Holding', 'E2E DUPES NAMESAKE - ELKO PLANT', '39.2505', '-116.9000', '11 NAME STREET', 'NV', '{}', 'C-N', true),
  -- p: the same, but both companies have a profile; q: the same, but a row written from sources stands under the other company
  ('p1', 'E2E Dupes Maker', 'E2E DUPES MAKER CORP', '39.2500', '-116.7000', '12 Maker St', 'NV', '{"naics": "332999"}', 'C-P', false),
  ('p2', 'E2E Dupes Owner', 'E2E DUPES MAKER', '39.2505', '-116.7000', '12 MAKER STREET', 'NV', '{}', 'C-P', true),
  ('q1', 'E2E Dupes Smith', 'E2E DUPES SMITH WORKS', '39.2500', '-116.5000', '13 Smith St', 'NV', '{"naics": "332999"}', 'C-Q', false),
  ('q2', 'E2E Dupes Capital', 'E2E Dupes Smith Works', '39.2505', '-116.5000', '13 Smith Street', 'NV', '{"curated": true}', 'C-Q', true),
  -- r: named for one of two companies, but one plant only by standing on one spot: no address, not one name
  ('r1', 'E2E Dupes Nearby', 'E2E DUPES NEARBY', '39.2500', '-116.3000', NULL, 'NV', '{"naics": "332999"}', 'C-R', false),
  ('r2', 'E2E Dupes Fund', 'E2E DUPES NEARBY PLANT', '39.2504', '-116.3000', NULL, 'NV', '{}', 'C-R', true),
  -- v: named for one of two companies, but the other has a profile and the named one has none
  ('v1', 'E2E Dupes Brandname', 'E2E DUPES BRANDNAME INC', '39.2500', '-116.1000', '14 Brand St', 'NV', '{"naics": "332999"}', 'C-V', false),
  ('v2', 'E2E Dupes Parentco', 'E2E DUPES BRANDNAME', '39.2505', '-116.1000', '14 BRAND STREET', 'NV', '{}', 'C-V', true),
  -- k: a pair an admin said are two plants
  ('k1', 'E2E Dupes Acme', 'E2E DUPES ACME LINE 1', '39.4000', '-116.3000', '6 Line Rd', 'NV', '{}', 'C-K', false),
  ('k2', 'E2E Dupes Acme', 'E2E DUPES ACME LINE 1 INC', '39.4000', '-116.3000', '6 Line Rd', 'NV', '{}', 'C-K', true),
  -- s: one company, one spot, one name, two ids; t: one spot, two names; u: one spot and name, two street addresses
  ('s1', 'E2E Dupes Acme', 'E2E DUPES ACME SPOT CO', '39.6000', '-116.9000', '8 Spot St', 'NV', '{"naics": "326199"}', 'C-S1', false),
  ('s2', 'E2E Dupes Acme', 'E2E DUPES ACME SPOT INC', '39.6001', '-116.9001', '8 Spot Street', 'NV', '{}', 'C-S2', false),
  ('t1', 'E2E Dupes Acme', 'E2E DUPES ACME BUILDING ONE', '39.6000', '-116.7000', NULL, 'NV', '{"naics": "332710"}', NULL, false),
  ('t2', 'E2E Dupes Acme', 'E2E DUPES ACME BUILDING TWO', '39.6001', '-116.7001', NULL, 'NV', '{}', NULL, false),
  ('u1', 'E2E Dupes Acme', 'E2E DUPES ACME ANNEX', '39.6000', '-116.3000', '10 First Ave', 'NV', '{"naics": "332710"}', NULL, false),
  ('u2', 'E2E Dupes Acme', 'E2E DUPES ACME ANNEX INC', '39.6001', '-116.3001', '99 Second Blvd', 'NV', '{}', NULL, false);
INSERT INTO factories (company_id, name, latitude, longitude, address, state, primary_naics, zip_code, workforce_size, curated)
  SELECT (SELECT id FROM companies WHERE name = co), name, lat, lng, addr, st, extra->>'naics', extra->>'zip', (extra->>'people')::int, coalesce((extra->>'curated')::boolean, false) FROM e2e;
INSERT INTO external_references (entity_type, entity_id, source, external_id, duplicate)
  SELECT 'factories', f.id, 'E2E_DUPES', e.id_, e.dup FROM e2e e JOIN factories f ON f.name = e.name AND f.state = e.st WHERE e.id_ IS NOT NULL;
-- A reference to a plant that no longer exists, and one whose plant was merged into another.
INSERT INTO external_references (entity_type, entity_id, source, external_id) VALUES ('factories', '00000000-0000-4000-8000-00000000d0d0', 'E2E_DUPES', 'C-GONE');
INSERT INTO record_merges (kind, from_id, into_id, from_name, via) SELECT 'factory', '00000000-0000-4000-8000-00000000d0d1', id, 'E2E Dupes earlier', 'admin' FROM factories WHERE name = 'E2E DUPES ACME BUILDING ONE';
INSERT INTO external_references (entity_type, entity_id, source, external_id) VALUES ('factories', '00000000-0000-4000-8000-00000000d0d1', 'E2E_DUPES', 'C-MOVED');
INSERT INTO plants_apart (a_id, b_id) SELECT least(a.id, b.id), greatest(a.id, b.id) FROM factories a, factories b WHERE a.name = 'E2E DUPES ACME LINE 1' AND b.name = 'E2E DUPES ACME LINE 1 INC';
SQL
cat > "$D/read.sql" <<'SQL'
SELECT :'at' || ' state', md5(coalesce(string_agg(x, '~' ORDER BY x), '')) FROM (
  SELECT 'f' || row_to_json(f)::text AS x FROM factories f WHERE f.name ILIKE 'e2e dupes %'
  UNION ALL SELECT 'c' || row_to_json(c)::text FROM companies c WHERE c.name LIKE 'E2E Dupes %'
  UNION ALL SELECT 'x' || row_to_json(x)::text FROM external_references x WHERE x.source = 'E2E_DUPES'
  UNION ALL SELECT 'l' || row_to_json(l)::text FROM load_log l WHERE l.load = 'plant-duplicates'
  UNION ALL SELECT 'm' || row_to_json(m)::text FROM record_merges m) q;
SELECT :'at' || ' plants', string_agg(f.name || ' [' || c.name || ']', '; ' ORDER BY f.name COLLATE "C", f.state) FROM factories f JOIN companies c ON c.id = f.company_id WHERE f.name ILIKE 'e2e dupes %' AND f.name NOT LIKE '%MILL%' AND f.name NOT LIKE '%BOX%';
SELECT :'at' || ' merged', string_agg(l.plant || ' <' || (l.evidence->>'rule') || '/' || (l.evidence->>'company') || '/' || l.look || '>', '; ' ORDER BY l.plant COLLATE "C") FROM load_log l WHERE l.load = 'plant-duplicates' AND l.kind = 'plant' AND l.action = 'merged' AND l.plant ILIKE 'e2e dupes %';
SELECT :'at' || ' review', string_agg(l.plant || ' <' || (l.evidence->>'reason') || '>', '; ' ORDER BY l.plant COLLATE "C") FROM load_log l WHERE l.load = 'plant-duplicates' AND l.action = 'left for review' AND l.plant ILIKE 'e2e dupes %';
SELECT :'at' || ' companies', string_agg(l.action || ' ' || l.company, '; ' ORDER BY l.company) FROM load_log l WHERE l.load = 'plant-duplicates' AND l.kind = 'company' AND l.company LIKE 'E2E Dupes %';
SELECT :'at' || ' apart', string_agg(l.plant, '; ' ORDER BY l.plant) FROM load_log l WHERE l.load = 'plant-duplicates' AND l.action = 'left apart' AND l.plant ILIKE 'e2e dupes %';
SELECT :'at' || ' references', string_agg(l.action || ' ' || l.source_id, '; ' ORDER BY l.source_id) FROM load_log l WHERE l.load = 'plant-duplicates' AND l.kind = 'reference' AND l.source_id LIKE 'C-%';
SELECT :'at' || ' aliases', array_to_string(aliases, ',') FROM companies WHERE name = 'E2E Dupes Widget Products';
SELECT :'at' || ' named for', (SELECT c.name FROM factories f JOIN companies c ON c.id = f.company_id WHERE f.name = 'E2E DUPES NAMESAKE INC') || '|' ||
  (SELECT c.name || ' ' || (SELECT count(*) FROM factories f WHERE f.company_id = c.id) FROM companies c WHERE c.name = 'E2E Dupes Holding' AND c.aliases IS NULL);
SELECT :'at' || ' curated kept', name || ' ' || curated || ' ' || primary_naics || ' ' || zip_code || ' ' || workforce_size || ' ' || address FROM factories WHERE name = 'E2E Dupes Acme Works';
SELECT :'at' || ' far kept', l.look || ' ' || l.metres FROM load_log l WHERE l.load = 'plant-duplicates' AND l.plant = 'E2E DUPES ACME PRESS SHOP' AND l.action = 'merged';
SELECT :'at' || ' moved reference', f.name FROM external_references x JOIN factories f ON f.id = x.entity_id WHERE x.source = 'E2E_DUPES' AND x.external_id = 'C-MOVED';
SELECT :'at' || ' two ids on one row', string_agg(x.external_id, ',' ORDER BY x.external_id) FROM external_references x JOIN factories f ON f.id = x.entity_id WHERE f.name = 'E2E DUPES ACME SPOT CO' AND x.source = 'E2E_DUPES';
SELECT :'at' || ' ids on two live rows', string_agg(DISTINCT x.external_id, ',' ORDER BY x.external_id) FROM external_references x JOIN factories f ON f.id = x.entity_id
  WHERE x.source = 'E2E_DUPES' AND EXISTS (SELECT 1 FROM external_references y JOIN factories g ON g.id = y.entity_id WHERE y.source = x.source AND y.external_id = x.external_id AND y.entity_id <> x.entity_id);
SELECT :'at' || ' dangling', count(*) FROM external_references x WHERE x.source = 'E2E_DUPES' AND NOT EXISTS (SELECT 1 FROM factories f WHERE f.id = x.entity_id);
SELECT :'at' || ' summary lines', count(*) FROM load_log WHERE load = 'plant-duplicates' AND action = 'summary' AND run_at = now();
SQL
{
  echo 'BEGIN;'
  cat "$D/fixture.sql"
  echo '\o /dev/null'
  echo "\\i $ROOT/migrations/0051_plant_duplicates.sql"
  echo '\o'
  echo '\set at first'
  cat "$D/read.sql"
  echo '\o /dev/null'
  echo "\\i $ROOT/migrations/0051_plant_duplicates.sql"
  echo '\o'
  echo '\set at second'
  cat "$D/read.sql"
  echo 'ROLLBACK;'
} > "$D/run.sql"
psql "$DB" -qtA -v ON_ERROR_STOP=1 -f "$D/run.sql" > "$D/out.txt" 2> "$D/err.txt"
expect "the migration applies twice to rows shaped like production's" 0 "$?"
[ -s "$D/err.txt" ] && grep -v NOTICE "$D/err.txt" | head -n 5
got() { grep "^$1|" "$D/out.txt" | cut -d'|' -f2-; }

expect "what is left: one row for each plant it was sure of, both rows where it was not" \
  'E2E DUPES ACME ANNEX [E2E Dupes Acme]; E2E DUPES ACME ANNEX INC [E2E Dupes Acme]; E2E DUPES ACME BORDER [E2E Dupes Acme]; E2E DUPES ACME BORDER [E2E Dupes Acme]; E2E DUPES ACME BUILDING ONE [E2E Dupes Acme]; E2E DUPES ACME BUILDING TWO [E2E Dupes Acme]; E2E DUPES ACME FOUNDRY [E2E Dupes Acme]; E2E DUPES ACME LINE 1 [E2E Dupes Acme]; E2E DUPES ACME LINE 1 INC [E2E Dupes Acme]; E2E DUPES ACME NORTH WORKS [E2E Dupes Acme]; E2E DUPES ACME PRESS SHOP [E2E Dupes Acme]; E2E DUPES ACME SOUTH YARD [E2E Dupes Acme]; E2E DUPES ACME SPOT CO [E2E Dupes Acme]; E2E DUPES BRANDNAME [E2E Dupes Parentco]; E2E DUPES BRANDNAME INC [E2E Dupes Brandname]; E2E DUPES GADGET COATINGS [E2E Dupes Gadget]; E2E DUPES LANDLORD PARK [E2E Dupes Landlord]; E2E DUPES MAKER [E2E Dupes Owner]; E2E DUPES MAKER CORP [E2E Dupes Maker]; E2E DUPES NAMESAKE INC [E2E Dupes Namesake]; E2E DUPES NEARBY [E2E Dupes Nearby]; E2E DUPES NEARBY PLANT [E2E Dupes Fund]; E2E DUPES SMITH WORKS [E2E Dupes Smith]; E2E DUPES TENANT MOULDING [E2E Dupes Tenant]; E2E DUPES WIDGET PLANT 2 [E2E Dupes Widget Products]; E2E DUPES WIDGET PRODUCTS [E2E Dupes Widget Products]; E2E Dupes Acme Works [E2E Dupes Acme]; E2E Dupes Smith Works [E2E Dupes Capital]' \
  "$(got 'first plants')"
expect "merged, each by its rule; a pair placed apart and a tie between companies by more than a legal ending are marked for a look" \
  'E2E DUPES ACME FOUNDRY <same address/one company/false>; E2E DUPES ACME PRESS SHOP <placed apart/one company/true>; E2E DUPES ACME SPOT CO <same spot and name/one company/false>; E2E DUPES GADGET COATINGS <same address/family/true>; E2E DUPES NAMESAKE INC <same address/named for/true>; E2E DUPES WIDGET PRODUCTS <same address/same name, written differently/true>; E2E Dupes Acme Works <same address/one company/false>' \
  "$(got 'first merged')"
# (Among them the four the named-for rule holds back: both companies have a profile; only the company that would be
# left has one; a row written from sources stands under the other company; one plant only by standing on one spot.)
expect "left for a person, each with its reason" \
  'E2E DUPES ACME ANNEX <same name, different street addresses>; E2E DUPES ACME BORDER <two states>; E2E DUPES ACME NORTH WORKS <far apart>; E2E DUPES BRANDNAME INC <two companies>; E2E DUPES LANDLORD PARK <two companies>; E2E DUPES MAKER CORP <two companies>; E2E DUPES NEARBY <two companies>; E2E Dupes Smith Works <two companies>' \
  "$(got 'first review')"
expect "a company row that is the same name and has nothing left is merged in; one of another name is left and said" \
  'left without plants E2E Dupes Gadget Coatings; left without plants E2E Dupes Holding; merged E2E Dupes Widget Products' "$(got 'first companies')"
expect "named for: the plant is filed under the company both rows are named for, and the other company row is left as it was" \
  'E2E Dupes Namesake|E2E Dupes Holding 0' "$(got 'first named for')"
expect "the merged company's name is kept as another name" 'E2E Dupes Widget Prods' "$(got 'first aliases')"
expect "the row written from sources is kept, with the bare row's facts" 'E2E Dupes Acme Works true 333111 89801 40 3 Curated Court' "$(got 'first curated kept')"
expect "a pair placed 20 km apart says so"    'true 20038' "$(got 'first far kept')"
expect "two buildings on one spot stay two rows, said once, and nothing else is" 'E2E DUPES ACME BUILDING ONE' "$(got 'first apart')"
expect "a reference to a plant that is gone is removed; one whose plant was merged follows it" 'removed C-GONE; moved C-MOVED' "$(got 'first references')"
expect "the reference that followed is on the plant kept" 'E2E DUPES ACME BUILDING ONE' "$(got 'first moved reference')"
expect "a row merged on its spot carries both ids" 'C-S1,C-S2' "$(got 'first two ids on one row')"
expect "no id is on two live rows but the pairs left for a person and the pair kept apart" 'C-C,C-E,C-G,C-K,C-P,C-Q,C-R,C-V' "$(got 'first ids on two live rows')"
expect "no reference points at a plant that is not there" '0' "$(got 'first dangling')"
expect "the pair an admin keeps apart is not touched and not said" '' "$(got 'first review' | grep -o 'LINE 1')"
expect "the first run writes its summary"     '1' "$(got 'first summary lines')"
expect "a second run changes nothing"         "$(got 'first state')" "$(got 'second state')"

# ---------------------------------------------------------------------------
# 3. Admin Tools
# ---------------------------------------------------------------------------
check "sign-up admin"                         201 "$(req a POST /auth/sign-up "{\"email\":\"admin-$RUN@dupes.test\",\"name\":\"Dee Dupes\",$PW}")"
check "sign-up person"                        201 "$(req p POST /auth/sign-up "{\"email\":\"person-$RUN@dupes.test\",\"name\":\"Pat Person\",$PW}")"
DATABASE_URL="$DB" node "$ROOT/scripts/make-admin.mjs" "admin-$RUN@dupes.test" >/dev/null 2>&1
for path in "/admin/plants/pairs?list=id" "/admin/plants/pair?a=$KEEP&b=$BOX" "/admin/plants/$KEEP/near"; do
  check "401 GET $path"                       401 "$(req anon GET "$path")"
  check "403 GET $path"                       403 "$(req p GET "$path")"
done
check "401 keeping two plants apart"          401 "$(req anon POST /admin/plants/apart "{\"a\":\"$KEEP\",\"b\":\"$BOX\"}")"
check "403 keeping two plants apart"          403 "$(req p POST /admin/plants/apart "{\"a\":\"$KEEP\",\"b\":\"$BOX\"}")"
check "403 merging two plants"                403 "$(req p POST "/admin/records/factory/$BOX/merge" "{\"into\":\"$KEEP\"}")"

# Two pairs: one that shares an id under two companies, one that shares a spot.
ONE=$(add 'E2E Dupes Acme' 'E2E DUPES ACME PAIR' 39.8000 -116.5000 'address, city, primary_naics, primary_naics_description' "'12 Pair Rd', 'ELKO', '332710', 'Fabricated Metal Product Manufacturing'")
TWO=$(add 'E2E Dupes Other' 'E2E DUPES ACME PAIR LLC' 39.8010 -116.5000 'address, zip_code' "'12 PAIR ROAD', '89801'")
ref "$ONE" E2E-P-1; ref "$TWO" E2E-P-1 true
SPOT1=$(add 'E2E Dupes Acme' 'E2E DUPES ACME SHED A' 39.8000 -116.2000)
SPOT2=$(add 'E2E Dupes Acme' 'E2E DUPES ACME SHED B' 39.8001 -116.2001)
DUPES0=$(req a GET /admin/quality | j "states.find(s => s.state === 'NV').duplicates")

LIST=$(req a GET "/admin/plants/pairs?list=id&state=NV&limit=50")
check "pairs that carry one id are listed"    200 "$LIST" 'E2E DUPES ACME PAIR LLC'
expect "with both rows, the row the rule keeps and what it would take" "true E2E-P-1 zip $ONE" \
  "$(printf '%s' "$LIST" | j "pairs.filter(p => p.shared === 'E2E_DUPES E2E-P-1').map(p => [p.by === 'id', p.shared.split(' ')[1], (p.a.id === '$ONE' ? p.a : p.b).takes.join(','), p.keep].join(' '))[0]")"
check "the address Vercel sends is read the same" 200 "$(req a GET "/admin/plants/pairs?list=id&state=NV&path=admin/plants/pairs")" 'E2E DUPES ACME PAIR'
check "a list that is not one is refused"     400 "$(req a GET "/admin/plants/pairs?list=everything")"
check "a state that is not one is refused"    400 "$(req a GET "/admin/plants/pairs?list=id&state=Nevada")"
check "plants on one spot are listed by state" 200 "$(req a GET "/admin/plants/pairs?list=spot&state=NV&limit=50")" 'E2E DUPES ACME SHED A'
check "two plants side by side"               200 "$(req a GET "/admin/plants/pair?a=$TWO&b=$ONE")" '"metres":111'
check "a pair with a plant that is not there" 404 "$(req a GET "/admin/plants/pair?a=$TWO&b=$NOBODY")"
NEAR=$(req a GET "/admin/plants/$TWO/near")
expect "the plants one could be merged with: the one carrying its id first" "$ONE" "$(printf '%s' "$NEAR" | j 'plants[0].id')"
check "and by name"                           200 "$(req a GET "/admin/plants/$ONE/near?q=shed")" 'E2E DUPES ACME SHED B'

# Two plants: remembered, not offered again, counted no more, and taken back.
check "these two are two plants"              200 "$(req a POST /admin/plants/apart "{\"a\":\"$SPOT1\",\"b\":\"$SPOT2\"}")" '"apart":true'
expect "they leave the list"                  'false' "$(req a GET "/admin/plants/pairs?list=spot&state=NV&limit=50" | j "pairs.some(p => p.a.id === '$SPOT1' || p.b.id === '$SPOT1')")"
expect "and the quality table's count"        "$((DUPES0 - 2))" "$(req a GET /admin/quality | j "states.find(s => s.state === 'NV').duplicates")"
expect "the decision is in the history"       'kept apart' "$(sql "SELECT action FROM audit_log WHERE kind = 'factory' AND record_id = '$SPOT1' ORDER BY at DESC LIMIT 1")"
check "taken back"                            200 "$(req a POST /admin/plants/apart "{\"a\":\"$SPOT1\",\"b\":\"$SPOT2\",\"apart\":false}")" '"apart":false'
expect "they are listed again"                'true' "$(req a GET "/admin/plants/pairs?list=spot&state=NV&limit=50" | j "pairs.some(p => p.a.id === '$SPOT1' || p.b.id === '$SPOT1')")"
check "a plant is not kept apart from itself" 400 "$(req a POST /admin/plants/apart "{\"a\":\"$SPOT1\",\"b\":\"$SPOT1\"}")"
check "nor from one that is not there"        404 "$(req a POST /admin/plants/apart "{\"a\":\"$SPOT1\",\"b\":\"$NOBODY\"}")"

# The merge.
check "a plant is not merged into itself"     400 "$(req a POST "/admin/records/factory/$ONE/merge" "{\"into\":\"$ONE\"}")"
check "nor into one that is not there"        404 "$(req a POST "/admin/records/factory/$ONE/merge" "{\"into\":\"$NOBODY\"}")"
sql "UPDATE factories SET curated = true WHERE id = '$TWO'" >/dev/null
check "a plant written from sources is not merged into one that was not" 409 "$(req a POST "/admin/records/factory/$TWO/merge" "{\"into\":\"$ONE\"}")" 'written from sources'
sql "UPDATE factories SET curated = false WHERE id = '$TWO'" >/dev/null
MERGED=$(req a POST "/admin/records/factory/$TWO/merge" "{\"into\":\"$ONE\"}")
check "an admin merges one into the other"    200 "$MERGED" '"took":\["zip"\]'
expect "the answer names the plant kept and its page" "E2E DUPES ACME PAIR /factories/$ONE" "$(printf '%s' "$MERGED" | j "kept.name + ' ' + o.kept.href")"
expect "the kept plant has the ZIP and holds the id once" '89801 1 false' \
  "$(sql "SELECT f.zip_code || ' ' || count(x.id) || ' ' || bool_or(x.duplicate) FROM factories f JOIN external_references x ON x.entity_id = f.id AND x.source = 'E2E_DUPES' WHERE f.id = '$ONE' GROUP BY f.zip_code")"
expect "the history has its line"             'merged E2E DUPES ACME PAIR LLC zip' \
  "$(sql "SELECT action || ' ' || (detail->'merged'->>'name') || ' ' || (detail->'took'->>0) FROM audit_log WHERE kind = 'factory' AND record_id = '$ONE' AND action = 'merged'")"
expect "the log says an admin did it"         't' "$(sql "SELECT detail LIKE '%an admin said they are one plant%' FROM load_log WHERE load = 'plant-merge' AND entity_id = '$ONE'")"
expect "the merge names its admin"            'admin true' "$(sql "SELECT via || ' ' || (actor_id IS NOT NULL) FROM record_merges WHERE from_id = '$TWO'")"
check "the pair is gone from the list"        200 "$(req a GET "/admin/plants/pairs?list=id&state=NV&limit=50")"
expect "(it is)"                              'false' "$(req a GET "/admin/plants/pairs?list=id&state=NV&limit=50" | j "pairs.some(p => p.shared === 'E2E_DUPES E2E-P-1')")"
check "the merged plant's editor says it is gone" 404 "$(req a GET "/admin/records/factory/$TWO")"

# The old address.
expect "the old address answers with a redirect to the plant kept" "301 /api/factories/$ONE" \
  "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$API/factories/$TWO" | sed "s#http://[^/]*##")"
expect "which a reader that follows it gets"  "$ONE" "$(curl -sL "$API/factories/$TWO" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).id))")"
expect "as Vercel sends it too"               "301" "$(curl -s -o /dev/null -w '%{http_code}' "$API/factories/$TWO?path=factories/$TWO")"
check "an id that was never a plant is still not found" 404 "$(req anon GET "/factories/$NOBODY")"

finish
