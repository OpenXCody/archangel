#!/usr/bin/env bash
# End-to-end check of the employer loader (scripts/build-employers-sql.mjs and
# scripts/employers-loader.sql): research files in, companies and plants out.
# It needs no server, only a database with the schema. Prints one line per
# check and exits non-zero if any fail.
#
# LOCAL ONLY: it creates companies named "E2E Loader ..." with plants in an
# empty part of Nevada (39.3 to 39.7 N, 117.1 to 116.7 W), loads two research
# files over them in both orders, and removes everything at the end.
#   DB=postgresql://... bash tests/api/loader.sh
# Needs psql and node on the PATH.
set -u
DB=${DB:-postgresql://postgres:postgres@127.0.0.1:5432/archangel}
case "$DB" in *@localhost[:/]*|*@127.0.0.1[:/]*) ;; *) echo "Refusing to run against that database: local only."; exit 2;; esac
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
D=$(mktemp -d)
fail=0
expect() { # name wanted got
  if [ "$2" = "$3" ]; then echo "ok    $1"; else echo "FAIL  $1: wanted [$2] got [$3]"; fail=1; fi
}
sql() { psql "$DB" -qtAc "$1"; }
IN_AREA="latitude::float8 BETWEEN 39.3 AND 39.7 AND longitude::float8 BETWEEN -117.1 AND -116.7"

cleanup() {
  psql "$DB" -qtAc "
    DELETE FROM external_references WHERE source = 'CURATED' AND external_id LIKE 'e2e-loader-%';
    DELETE FROM load_log WHERE load LIKE 'e2e-loader-%';
    DELETE FROM factories WHERE name LIKE 'E2E LOADER %' OR company_id IN (SELECT id FROM companies WHERE name LIKE 'E2E Loader %');
    DELETE FROM factories WHERE latitude ~ '^39[.][3-6]' AND longitude ~ '^-11[67][.]' AND $IN_AREA;
    DELETE FROM companies WHERE name LIKE 'E2E Loader %';" >/dev/null
}
trap 'cleanup; rm -rf "$D"' EXIT

# What production might hold before a load: the same company under three
# names, its plants a little way from where the research puts them, one of
# them filed under a stranger, a subsidiary's plants filed under its parent,
# and an unrelated company with the same name as one in the research.
fixture() {
  cleanup
  psql "$DB" -qtA -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
INSERT INTO companies (name, aliases, domain, featured, slug) VALUES
  ('E2E Loader Acme Corp', NULL, NULL, false, NULL),
  ('E2E Loader ACME HOLDINGS', NULL, 'acme-e2e.test', true, 'e2e-loader-acme'),
  ('E2E Loader Old Acme', ARRAY['E2E Loader Acme Works'], NULL, false, NULL),
  ('E2E Loader Parent', NULL, NULL, false, NULL),
  ('E2E Loader Stranger', NULL, NULL, false, NULL),
  ('E2E Loader Homonym', NULL, NULL, false, NULL);
INSERT INTO factories (company_id, name, latitude, longitude, city, state, workforce_size)
SELECT (SELECT id FROM companies WHERE name = c), n, lat, lng, 'AUSTIN', 'NV', w FROM (VALUES
  ('E2E Loader Acme Corp',     'E2E LOADER ACME CORP MAIN PLANT',  '39.5027', '-116.9000', NULL),   -- 300 m north of Main Plant
  ('E2E Loader Acme Corp',     'E2E LOADER ACME FOUNDRY WORKS',    '39.5000', '-116.8900', 77),     -- 860 m east: the Foundry
  ('E2E Loader ACME HOLDINGS', 'E2E LOADER ACME HOLDINGS DEPOT',   '39.6500', '-116.9000', NULL),   -- 16 km away: stays bare
  ('E2E Loader Old Acme',      'E2E LOADER OLD ACME',              '39.5200', '-116.9000', NULL),   -- 2.2 km from Main Plant: too far for an unnamed match
  ('E2E Loader Stranger',      'E2E LOADER ACME WAREHOUSE',        '39.4009', '-116.8000', NULL),   -- 100 m from Street Warehouse, names Acme
  ('E2E Loader Stranger',      'E2E LOADER UNRELATED WIDGETS',     '39.4504', '-116.8000', NULL),   -- 45 m from New Site, names nobody
  ('E2E Loader Parent',        'E2E LOADER KIDCO ASSEMBLY LINE',   '39.5536', '-116.7500', NULL),   -- 400 m from Kidco Assembly
  ('E2E Loader Parent',        'E2E LOADER KIDCO PLANT 2',         '39.6800', '-116.7500', NULL),   -- far away, but named for Kidco
  ('E2E Loader Parent',        'E2E LOADER PARENT HEAD WORKS',     '39.5540', '-116.7500', NULL),   -- beside it, not named for Kidco
  ('E2E Loader Homonym',       'E2E LOADER HOMONYM BOXES',         '39.3500', '-117.0000', NULL)
) AS t(c, n, lat, lng, w);
SQL
}

mkdir -p "$D/data"
cat > "$D/data/e2e-loader-a.json" <<'JSON'
{ "brief": "e2e-loader-a", "retrieved": "2026-11-18", "companies": [
  { "name": "E2E Loader Acme",
    "alsoKnownAs": ["E2E Loader Acme Corp", "E2E Loader Acme Holdings", "E2E Loader Acme Works", "E2E Loader Parent", "E2E Loader Never Heard Of"],
    "parent": null, "domain": "https://www.Acme-E2E.test/about", "industry": "Widgets", "description": "Makes widgets.",
    "headquarters": { "city": "Austin", "state": "NV", "country": "US" },
    "stateEmployees": { "state": "NV", "count": 2500, "year": 2024, "source": "https://example.test/acme-nv", "note": null },
    "sources": ["https://example.test/acme"],
    "plants": [
      { "name": "Main Plant", "city": "Austin", "state": "NV", "address": "1 Main St", "zip": "89310", "latitude": 39.5, "longitude": -116.9,
        "subsector": "Machinery Manufacturing", "naics": "333111", "products": "Widgets", "employees": 1000, "employeesYear": 2023,
        "employeesSource": "https://example.test/main-2023", "employeesNote": null, "opened": 1990, "status": "operating", "sources": ["https://example.test/main"] },
      { "name": "Foundry", "city": "Austin", "state": "NV", "latitude": 39.5, "longitude": -116.889,
        "subsector": "Primary Metal Manufacturing", "naics": null, "products": null, "employees": null, "employeesYear": null,
        "employeesSource": null, "employeesNote": null, "opened": null, "status": "operating", "sources": [] },
      { "name": "Street Warehouse", "city": "Austin", "state": "NV", "latitude": 39.4, "longitude": -116.8,
        "subsector": "Machinery Manufacturing", "naics": null, "employees": 50, "employeesYear": 2024, "employeesSource": "https://example.test/wh", "status": "under construction", "sources": [] },
      { "name": "New Site", "city": "Austin", "state": "NV", "latitude": 39.45, "longitude": -116.8,
        "subsector": "Machinery Manufacturing", "naics": "999999", "employees": 10, "employeesYear": 2024, "employeesSource": null, "status": "operating", "sources": [] },
      { "name": "Old Site", "city": "Austin", "state": "NV", "latitude": 39.46, "longitude": -116.8, "subsector": "Machinery Manufacturing", "status": "closed" },
      { "name": "Planned Site", "city": "Austin", "state": "NV", "latitude": 39.47, "longitude": -116.8, "subsector": "Machinery Manufacturing", "status": "announced" },
      { "name": "Ready Mix Yard", "city": "Austin", "state": "NV", "latitude": 39.49, "longitude": -116.8, "subsector": "Nonmetallic Mineral Product Manufacturing", "naics": "327320", "status": "operating" },
      { "name": "Island Plant", "city": "Ponce", "state": "PR", "latitude": 18.0, "longitude": -66.6, "subsector": "Machinery Manufacturing", "status": "operating" },
      { "name": "Nowhere", "city": "Austin", "state": "NV", "latitude": 0, "longitude": 0, "subsector": "Machinery Manufacturing", "status": "operating" },
      { "name": "No Industry", "city": "Austin", "state": "NV", "latitude": 39.48, "longitude": -116.8, "subsector": "Widgets", "status": "operating" }
    ] },
  { "name": "E2E Loader Kidco", "alsoKnownAs": ["E2E Loader Kidco Inc"], "parent": "E2E Loader Parent", "domain": "kidco-e2e.test",
    "industry": "Gadgets", "description": "Makes gadgets.", "headquarters": null, "stateEmployees": null, "sources": [],
    "plants": [
      { "name": "Kidco Assembly", "city": "Austin", "state": "NV", "latitude": 39.55, "longitude": -116.75,
        "subsector": "Transportation Equipment Manufacturing", "naics": "336411", "employees": 400, "employeesYear": 2025,
        "employeesSource": "https://example.test/kidco", "status": "operating", "sources": [] } ] },
  { "name": "E2E Loader Plain", "alsoKnownAs": null, "parent": null, "domain": null, "industry": null, "description": null, "headquarters": null,
    "stateEmployees": null, "sources": null, "plants": [
      { "name": "Plain Works", "city": "Austin", "state": "NV", "latitude": 39.62, "longitude": -117.05, "subsector": "Food Manufacturing", "rank": 7,
        "employees": 320, "employeesYear": 2025, "employeesSource": "https://example.test/osha", "status": "operating", "sources": null } ] },
  { "name": "E2E Loader Homonym", "alsoKnownAs": [], "parent": "E2E Loader Brand New Parent", "domain": "homonym-e2e.test", "industry": "Gizmos",
    "description": "Makes gizmos.", "plants": [
      { "name": "Gizmo Works", "city": "Austin", "state": "NV", "latitude": 39.6, "longitude": -117.0, "subsector": "Miscellaneous Manufacturing", "status": "operating" } ] }
] }
JSON
# The second file describes the same Main Plant 80 m away under the same
# name with a newer headcount, and the Foundry more fully.
cat > "$D/data/e2e-loader-b.json" <<'JSON'
{ "brief": "e2e-loader-b", "retrieved": "2026-11-18", "companies": [
  { "name": "E2E Loader Acme", "alsoKnownAs": ["E2E Loader Acme Corp"], "parent": null, "domain": "acme-e2e.test", "industry": "Widgets and gears",
    "description": "Makes widgets and the gears inside them.", "stateEmployees": { "state": "NV", "count": 2400, "year": 2023, "source": "https://example.test/acme-nv-old" },
    "sources": ["https://example.test/acme", "https://example.test/acme-b"],
    "plants": [
      { "name": "Main Plant", "city": "Austin", "state": "NV", "latitude": 39.5007, "longitude": -116.9,
        "subsector": "Machinery Manufacturing", "naics": null, "products": "Widgets, gears and housings", "employees": 1200, "employeesYear": 2024,
        "employeesSource": "https://example.test/main-2024", "employeesNote": "includes contractors", "opened": 1988, "status": "operating", "sources": ["https://example.test/main-b"] },
      { "name": "Acme Foundry", "city": "Austin", "state": "NV", "address": "9 Foundry Rd", "latitude": 39.5001, "longitude": -116.889,
        "subsector": "Primary Metal Manufacturing", "naics": "331511", "products": "Iron castings", "employees": 300, "employeesYear": 2022,
        "employeesSource": "https://example.test/foundry", "opened": 1975, "status": "operating", "sources": [] } ] }
] }
JSON
cat > "$D/data/corrections.json" <<'JSON'
{ "companies": { "E2E Loader Homonym": { "why": "a different company",
  "setAside": [{ "name": "E2E Loader Homonym", "withPlant": "E2E LOADER HOMONYM BOXES", "renameTo": "E2E Loader Homonym Boxes" }] } } }
JSON

build() { (cd "$ROOT" && node scripts/build-employers-sql.mjs "$@") 2>"$D/build.log"; }
load() { # brief...
  local files=()
  for brief in "$@"; do files+=("$D/data/$brief.json"); done
  build --out "$D/load.sql" "${files[@]}" && psql "$DB" -q -v ON_ERROR_STOP=1 -1 -f "$D/load.sql" >/dev/null 2>"$D/psql.log" || { cat "$D/build.log" "$D/psql.log"; echo "FAIL  loading $*"; fail=1; }
}
# Everything the loader can change among this suite's rows, as one hash.
state() {
  sql "SELECT md5(string_agg(line, E'\n' ORDER BY line)) FROM (
    SELECT concat_ws('|', 'c', c.name, (SELECT string_agg(a, ',' ORDER BY a) FROM unnest(c.aliases) a), c.industry, c.description, c.domain, c.featured, c.slug,
                     c.headquarters_city, c.headquarters_state, (SELECT name FROM companies p WHERE p.id = c.parent_company_id)) AS line
      FROM companies c WHERE c.name LIKE 'E2E Loader %'
    UNION ALL
    SELECT concat_ws('|', 'f', (SELECT name FROM companies c WHERE c.id = f.company_id), f.name, f.latitude, f.longitude, f.address, f.city, f.state, f.zip_code,
                     f.primary_naics, f.primary_naics_description, f.workforce_size, f.workforce_year, f.workforce_source, f.workforce_note, f.products, f.opened_year, f.status, f.curated)
      FROM factories f WHERE $IN_AREA
    UNION ALL
    SELECT concat_ws('|', 'h', (SELECT name FROM companies c WHERE c.id = h.company_id), h.state, h.people, h.year, h.source)
      FROM company_state_headcounts h WHERE h.company_id IN (SELECT id FROM companies WHERE name LIKE 'E2E Loader %')
    UNION ALL
    SELECT concat_ws('|', 's', e.entity_type, e.url, coalesce((SELECT name FROM companies c WHERE c.id = e.entity_id), (SELECT name FROM factories f WHERE f.id = e.entity_id)))
      FROM external_references e WHERE e.source = 'CURATED' AND e.external_id LIKE 'e2e-loader-%') s"
}
plant() { # company plant column
  sql "SELECT $3 FROM factories f JOIN companies c ON c.id = f.company_id WHERE c.name = '$1' AND f.name = '$2'"
}

# --- What the generator settles before any SQL runs --------------------------
build --check "$D/data/e2e-loader-a.json" "$D/data/e2e-loader-b.json"
expect "a closed and an announced plant are set aside, with a concrete plant and one in Puerto Rico" 1 "$(grep -c '4 not loaded (closed, announced, or not covered)' "$D/build.log")"
expect "coordinates outside the country are left out"    1 "$(grep -c 'Nowhere: coordinates' "$D/build.log")"
expect "an unknown subsector is left out"                1 "$(grep -c 'No Industry: subsector' "$D/build.log")"
expect "a NAICS code that is not manufacturing is dropped" 1 "$(grep -c 'New Site: NAICS' "$D/build.log")"
expect "a headcount with no source is dropped"           1 "$(grep -c 'New Site: has a headcount with no source' "$D/build.log")"
expect "a parent listed as another name is called out"   1 "$(grep -c '"E2E Loader Parent" is listed as another name' "$D/build.log")"
expect "the same plant in two files is called out"       1 "$(grep -c '78 m apart: .*Main Plant.*Main Plant' "$D/build.log")"
expect "the correction is applied"                       1 "$(grep -c '1 of 1 corrections applied' "$D/build.log")"

# --- A rehearsal changes nothing ---------------------------------------------
fixture
before=$(state)
build --rehearse --out "$D/rehearse.sql" "$D/data/e2e-loader-a.json"
psql "$DB" -qtA -v ON_ERROR_STOP=1 -f "$D/rehearse.sql" > "$D/rehearsal.txt" 2>"$D/psql.log" || { cat "$D/psql.log"; fail=1; }
expect "a rehearsal reports what it would do"            1 "$(grep -c '^e2e-loader-a: 4 companies (1 found, 3 created, 2 rows merged in' "$D/rehearsal.txt")"
expect "a rehearsal names each merge"                    2 "$(grep -c '^company merged | E2E Loader Acme' "$D/rehearsal.txt")"
expect "a rehearsal leaves every row as it was"          "$before" "$(state)"
expect "a rehearsal leaves no log"                       0 "$(sql "SELECT count(*) FROM load_log WHERE load LIKE 'e2e-loader-%'")"

# --- One file ------------------------------------------------------------------
load e2e-loader-a
expect "three names become one company"                  1 "$(sql "SELECT count(*) FROM companies WHERE name ILIKE 'E2E Loader Acme%' OR name = 'E2E Loader Old Acme'")"
expect "named as the file names it; the profile it had is kept" "E2E Loader Acme|acme-e2e.test|t|e2e-loader-acme|Widgets|Austin|NV" \
  "$(sql "SELECT concat_ws('|', name, domain, featured, slug, industry, headquarters_city, headquarters_state) FROM companies WHERE name = 'E2E Loader Acme'")"
expect "the other names are kept as aliases"             "E2E Loader ACME HOLDINGS,E2E Loader Acme Corp,E2E Loader Acme Works,E2E Loader Never Heard Of,E2E Loader Old Acme" \
  "$(sql "SELECT string_agg(a, ',' ORDER BY a) FROM companies, unnest(aliases) a WHERE name = 'E2E Loader Acme'")"
expect "a company the research names is never an alias"  1 "$(sql "SELECT count(*) FROM companies WHERE name = 'E2E Loader Parent'")"
expect "people in a state"                               "2500|2024" "$(sql "SELECT people || '|' || year FROM company_state_headcounts h JOIN companies c ON c.id = h.company_id WHERE c.name = 'E2E Loader Acme' AND h.state = 'NV'")"
expect "a plant of the company 300 m away is the plant"  "39.5|-116.9|1000|2023|333111|Machinery Manufacturing|1990|operating|t|1 Main St|89310" \
  "$(plant 'E2E Loader Acme' 'Main Plant' "concat_ws('|', latitude, longitude, workforce_size, workforce_year, primary_naics, primary_naics_description, opened_year, status, curated, address, zip_code)")"
expect "the old row is the same row, renamed"            0 "$(sql "SELECT count(*) FROM factories WHERE name = 'E2E LOADER ACME CORP MAIN PLANT'")"
expect "a shared word finds the right one of two"        "331|Primary Metal Manufacturing|77" "$(plant 'E2E Loader Acme' 'Foundry' "concat_ws('|', primary_naics, primary_naics_description, workforce_size)")"
expect "a plant 2 km off with no shared word is left"    "f" "$(plant 'E2E Loader Acme' 'E2E LOADER OLD ACME' curated)"
expect "a plant 16 km off is left"                       "f" "$(plant 'E2E Loader Acme' 'E2E LOADER ACME HOLDINGS DEPOT' curated)"
expect "a stranger's plant that names the company moves" "under construction|50" "$(plant 'E2E Loader Acme' 'Street Warehouse' "status || '|' || workforce_size")"
expect "and is no longer the stranger's"                 0 "$(sql "SELECT count(*) FROM factories WHERE name = 'E2E LOADER ACME WAREHOUSE'")"
expect "a stranger's plant that names nobody stays"      "E2E Loader Stranger" "$(sql "SELECT c.name FROM factories f JOIN companies c ON c.id = f.company_id WHERE f.name = 'E2E LOADER UNRELATED WIDGETS'")"
expect "so the plant beside it is new, with no headcount" "333||t" "$(plant 'E2E Loader Acme' 'New Site' "concat_ws('|', primary_naics, coalesce(workforce_size::text, ''), curated)")"
expect "closed, announced, uncovered and unusable plants are not loaded" 0 "$(sql "SELECT count(*) FROM factories WHERE name IN ('Old Site', 'Planned Site', 'Nowhere', 'No Industry', 'Ready Mix Yard', 'Island Plant')")"
expect "and the log says which, and why"                 "Island Plant (Puerto Rico)|Old Site (closed)|Planned Site (announced)|Ready Mix Yard (construction materials, NAICS 327320)" \
  "$(sql "SELECT string_agg(plant, '|' ORDER BY plant) FROM load_log WHERE load = 'e2e-loader-a' AND action = 'not loaded'")"
expect "a subsidiary is created with its parent"         "E2E Loader Parent|true" "$(sql "SELECT p.name || '|' || c.featured FROM companies c JOIN companies p ON p.id = c.parent_company_id WHERE c.name = 'E2E Loader Kidco'")"
expect "the parent is not made a featured employer"      "f" "$(sql "SELECT featured FROM companies WHERE name = 'E2E Loader Parent'")"
expect "its plant filed under the parent moves to it"    "400|2025" "$(plant 'E2E Loader Kidco' 'Kidco Assembly' "workforce_size || '|' || workforce_year")"
expect "the parent's other plants named for it follow"   "E2E Loader Kidco" "$(sql "SELECT c.name FROM factories f JOIN companies c ON c.id = f.company_id WHERE f.name = 'E2E LOADER KIDCO PLANT 2'")"
expect "the parent keeps the plant that is its own"      "E2E Loader Parent" "$(sql "SELECT c.name FROM factories f JOIN companies c ON c.id = f.company_id WHERE f.name = 'E2E LOADER PARENT HEAD WORKS'")"
expect "a company with no profile in the file is loaded but not featured" "false|1" "$(sql "SELECT featured || '|' || (SELECT count(*) FROM factories f WHERE f.company_id = c.id AND f.curated) FROM companies c WHERE name = 'E2E Loader Plain'")"
expect "a missing parent is created bare"                "false|0" "$(sql "SELECT featured || '|' || (SELECT count(*) FROM factories f WHERE f.company_id = c.id) FROM companies c WHERE name = 'E2E Loader Brand New Parent'")"
expect "a different company with the same name stands aside" "E2E Loader Homonym Boxes" "$(sql "SELECT c.name FROM factories f JOIN companies c ON c.id = f.company_id WHERE f.name = 'E2E LOADER HOMONYM BOXES'")"
expect "and the researched one is new"                   "Gizmo Works" "$(sql "SELECT string_agg(f.name, ',') FROM factories f JOIN companies c ON c.id = f.company_id WHERE c.name = 'E2E Loader Homonym'")"
expect "sources are kept for the plant"                  "https://example.test/main,https://example.test/main-2023" \
  "$(sql "SELECT string_agg(e.url, ',' ORDER BY e.url) FROM external_references e JOIN factories f ON f.id = e.entity_id WHERE e.entity_type = 'factories' AND e.source = 'CURATED' AND f.name = 'Main Plant' AND $IN_AREA")"
expect "and for the company"                             "https://example.test/acme" \
  "$(sql "SELECT string_agg(e.url, ',' ORDER BY e.url) FROM external_references e JOIN companies c ON c.id = e.entity_id WHERE e.entity_type = 'companies' AND e.source = 'CURATED' AND c.name = 'E2E Loader Acme'")"
expect "every decision is in the log"                    "created 3|found 1|inserted 3|matched 2|merged 2|moved 2|not loaded 4|swept 1" \
  "$(sql "SELECT string_agg(action || ' ' || n, '|' ORDER BY action) FROM (SELECT action, count(*) AS n FROM load_log WHERE load = 'e2e-loader-a' AND action IN ('found', 'created', 'merged', 'matched', 'moved', 'inserted', 'swept', 'not loaded') GROUP BY action) s")"
once=$(state)
load e2e-loader-a
expect "loading the same file again changes nothing"     "$once" "$(state)"

# --- Two files that describe the same plant, in both orders --------------------
load e2e-loader-b
ab=$(state)
expect "the second file adds no plant"                   "1|1" "$(sql "SELECT (SELECT count(*) FROM factories WHERE name = 'Main Plant' AND $IN_AREA) || '|' || (SELECT count(*) FROM factories WHERE name ILIKE '%foundry%' AND $IN_AREA)")"
expect "the newer headcount wins, with its note"         "1200|2024|includes contractors|https://example.test/main-2024" "$(plant 'E2E Loader Acme' 'Main Plant' "concat_ws('|', workforce_size, workforce_year, workforce_note, workforce_source)")"
expect "the fuller text, the earlier opening, both codes" "Widgets, gears and housings|1988|333111|1 Main St" "$(plant 'E2E Loader Acme' 'Main Plant' "concat_ws('|', products, opened_year, primary_naics, address)")"
expect "a differently named plant with a shared word is the same plant" "Acme Foundry|300|2022|331511|Iron castings|1975|9 Foundry Rd" \
  "$(sql "SELECT concat_ws('|', name, workforce_size, workforce_year, primary_naics, products, opened_year, address) FROM factories WHERE name ILIKE '%foundry%' AND $IN_AREA")"
expect "the newer state figure is kept"                  "2500|2024" "$(sql "SELECT people || '|' || year FROM company_state_headcounts h JOIN companies c ON c.id = h.company_id WHERE c.name = 'E2E Loader Acme'")"
expect "the fuller description and industry"             "Makes widgets and the gears inside them.|Widgets and gears" "$(sql "SELECT description || '|' || industry FROM companies WHERE name = 'E2E Loader Acme'")"
load e2e-loader-a e2e-loader-b
expect "both again, in one migration: nothing changes"   "$ab" "$(state)"

fixture
load e2e-loader-b
load e2e-loader-a
expect "the other order leaves the same companies, plants and sources" "$ab" "$(state)"
load e2e-loader-b
load e2e-loader-a
expect "and again"                                       "$ab" "$(state)"

fixture
load e2e-loader-b e2e-loader-a
expect "both in one migration, second file first"        "$ab" "$(state)"

exit $fail
