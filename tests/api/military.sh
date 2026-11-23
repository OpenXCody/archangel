#!/usr/bin/env bash
# End-to-end check of the military careers' data: the four services as employers
# (migration 0062, scripts/build-military-sql.mjs), as the database holds them and
# as the API serves them. Prints one line per check and exits non-zero if any fail.
#
# It reads the services the migration loaded (data/careers/military/employers.json:
# the database must have had 0061 and 0062 applied, as `scripts/create-db.mjs`
# leaves it), then lays out rows as production might hold them (a service stored
# in other letters and with plants, a company that carries a service under another
# name, a name that only resembles a service's, a slug another company has),
# applies a migration generated from a small file twice and reads what it did, all
# inside one transaction that is rolled back.
#
# LOCAL ONLY: it creates and deletes one user (an email ending @military.test) and
# leaves nothing else behind. Never point it at production.
#   API=http://localhost:3000/api DB=postgresql://... bash tests/api/military.sh
# Needs a running dev API, and psql, curl and node on the PATH.
set -u
. "$(dirname "$0")/lib.sh"
case "$DB" in *@localhost[:/]*|*@127.0.0.1[:/]*) ;; *) echo "Refusing to run against that database: local only."; exit 2;; esac
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
D=$(mktemp -d)
RUN=$(date +%s)
cleanup() { psql "$DB" -qtAc "DELETE FROM users WHERE email LIKE '%@military.test';" >/dev/null; }
cleanup
trap 'cleanup; rm -rf "$D"' EXIT
PW='"password":"correct horse"'
# This suite's expect puts each value in brackets: many of its values are lists, or empty.
expect() { # name wanted got
  if [ "$2" = "$3" ]; then echo "ok    $1"; else echo "FAIL  $1: wanted [$2] got [$3]"; fail=1; fi
}
# What the employers file says, to hold the API to: `emp <expression over the file's companies>`.
emp() { node -e "const companies=JSON.parse(require('fs').readFileSync('$ROOT/data/careers/military/employers.json','utf8')).companies;console.log(eval(process.argv[1]))" "$1"; }
enc() { node -e "console.log(encodeURIComponent(process.argv[1]))" "$1"; }

# --- The real files ----------------------------------------------------------------
(cd "$ROOT" && node scripts/build-military-sql.mjs --check) > "$D/check.log" 2>&1
expect "the military files pass their check" 0 "$?"
(cd "$ROOT" && node scripts/build-military-sql.mjs employers "$D/employers.sql") > /dev/null 2>&1
expect "the employers' migration in the repository is what the file generates" 0 "$(cmp -s "$D/employers.sql" "$ROOT/migrations/0062_military_employers.sql"; echo $?)"

# --- The four services are stored ----------------------------------------------------
expect "one company for each service"              "$(emp 'companies.map((c)=>c.service+"="+c.name).sort().join("|")')" "$(sql "SELECT string_agg(service || '=' || name, '|' ORDER BY service) FROM companies WHERE service IS NOT NULL")"
expect "none has a plant"                          0 "$(sql "SELECT COUNT(*) FROM factories f INNER JOIN companies c ON c.id = f.company_id WHERE c.service IS NOT NULL")"
expect "each has its slug, domain and headquarters" 4 "$(sql "SELECT COUNT(*) FROM companies WHERE service IS NOT NULL AND slug IS NOT NULL AND domain IS NOT NULL AND headquarters_city = 'Arlington' AND headquarters_state = 'VA' AND headquarters_country = 'US'")"
expect "none is a featured employer"               0 "$(sql "SELECT COUNT(*) FROM companies WHERE service IS NOT NULL AND featured")"
expect "the log has its summary"                   t "$(sql "SELECT COUNT(*) > 0 FROM load_log WHERE load = 'military-employers' AND action = 'summary'")"
NAVY=$(sql "SELECT id FROM companies WHERE service = 'navy'")

# --- A service is an employer, and is not browsed to as a manufacturer -------------
OUT=$(req anon GET /companies/us-navy)
check "a service's page, by its slug"              200 "$OUT" '"service":"navy"'
expect "it is the company the file names"          "$(emp 'companies.find((c)=>c.service==="navy").name')" "$(printf '%s' "$OUT" | j name)"
expect "with no plants, and nothing broken by that" "0 0 0 0" "$(printf '%s' "$OUT" | j 'factories.length + " " + o.factoryCount + " " + o.jobs.length + " " + o.occupations.length')"
expect "its headquarters"                          "Arlington, VA, US" "$(printf '%s' "$OUT" | j 'headquarters.city + ", " + o.headquarters.state + ", " + o.headquarters.country')"
check "by its id too"                              200 "$(req anon GET /companies/$NAVY)" '"slug":"us-navy"'
expect "a company that is not a service says so"   null "$(req anon GET "/companies/$(sql "SELECT id FROM companies WHERE service IS NULL ORDER BY name LIMIT 1")" | j service)"
expect "the Companies list leaves the services out" "$(sql "SELECT COUNT(*) FROM companies WHERE service IS NULL AND name ~ '[A-Za-z]{2,}' AND name !~ '^[#(]' AND name !~ '^\\d+\\s' AND name !~ '^\\d+/\\d'")" "$(req anon GET '/companies?limit=1' | j total)"
for NAME in 'U.S. Navy' 'U.S. Army' 'U.S. Air Force' 'U.S. Marine Corps'; do
  expect "the list does not find $NAME"            0 "$(req anon GET "/companies?search=$(enc "$NAME")" | j total)"
done
expect "Explore's count of companies is the list's" "$(req anon GET '/companies?limit=1' | j total)" "$(req anon GET /stats/counts | j companies)"
OUT=$(req anon GET '/search?q=navy')
expect "search lists no service among the companies" 0 "$(printf '%s' "$OUT" | j 'results.companies.items.filter((c) => /^U\.S\. /.test(c.name)).length')"
expect "the overview's employers have plants, so no service" 0 "$(req anon GET /explore/overview | j 'employers.filter((c) => /^U\.S\. (Navy|Army|Air Force|Marine Corps)$/.test(c.name)).length')"
OUT=$(req anon GET "/factories/pins?company=$NAVY")
check "the map's pins for a service: none, and no error" 200 "$OUT" '"pins":\[\]'
check "sign-up"                                    201 "$(req p POST /auth/sign-up "{\"email\":\"person-$RUN@military.test\",\"name\":\"Pat Person\",\"purpose\":\"hire\",$PW}")"
OUT=$(req p GET '/employer/companies?q=U.S.%20Navy')
check "the employer's company finder answers"      200 "$OUT"
expect "and finds the service by its name"         "U.S. Navy" "$(printf '%s' "$OUT" | j 'companies[0].name')"

# --- The loader, on rows as production might hold them --------------------------------
cat > "$D/employers.json" <<'JSON'
{ "companies": [
  { "name": "E2E Mil Navy", "service": "navy", "slug": "e2e-mil-navy", "domain": "navy.e2e.test", "description": "A fixture.", "headquarters": { "city": "Arlington", "state": "VA", "country": "US" } },
  { "name": "E2E Mil Army", "service": "army", "slug": "e2e-mil-army", "domain": "army.e2e.test", "description": "A fixture.", "headquarters": { "city": "Arlington", "state": "VA", "country": "US" } },
  { "name": "E2E Mil Air Force", "service": "air-force", "slug": "e2e-mil-air-force", "domain": "af.e2e.test", "description": "A fixture.", "headquarters": { "city": "Arlington", "state": "VA", "country": "US" } },
  { "name": "E2E Mil Marine Corps", "service": "marine-corps", "slug": "e2e-mil-marine-corps", "domain": "marines.e2e.test", "description": "A fixture.", "headquarters": { "city": "Arlington", "state": "VA", "country": "US" } } ] }
JSON
cat > "$D/build.mjs" <<'JS'
// build.mjs <repository root> <employers file> <output>: the builder's own functions over a fixture.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const [root, input, output] = process.argv.slice(2);
const { employerProblems, employersSql } = await import(pathToFileURL(`${root}/scripts/build-military-sql.mjs`).href);
const file = JSON.parse(readFileSync(input, 'utf8'));
const problems = employerProblems(file);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
writeFileSync(output, employersSql(file, 'a fixture'));
JS
node "$D/build.mjs" "$ROOT" "$D/employers.json" "$D/migration.sql" > "$D/build.log" 2>&1
expect "the builder turns an employers file into a migration" 0 "$?"

cat > "$D/read.sql" <<'SQL'
SELECT :'at' || ' state', md5(string_agg(c::text, '~' ORDER BY c.id)) FROM companies c WHERE c.name ILIKE 'E2E Mil %' OR c.service IS NOT NULL;
SELECT :'at' || ' services', string_agg(c.service || '=' || c.name || ' (' || COALESCE(c.slug, 'no slug') || ', ' || COALESCE(c.domain, 'no domain') || ', ' || COALESCE(c.headquarters_city, 'no city') || ', ' || left(COALESCE(c.description, 'no description'), 12) || ')', '; ' ORDER BY c.service)
  FROM companies c WHERE c.service IS NOT NULL;
SELECT :'at' || ' look', string_agg(action || ': ' || detail, ' / ' ORDER BY id) FROM load_log WHERE load = 'military-employers' AND id > :mark AND look;
SELECT :'at' || ' quiet', string_agg(action || ': ' || detail, ' / ' ORDER BY id) FROM load_log WHERE load = 'military-employers' AND id > :mark AND NOT look;
SQL
cat > "$D/run.sql" <<SQL
BEGIN;
-- The real services stand aside for the fixture's: a service's key is one company's.
UPDATE companies SET service = NULL WHERE service IS NOT NULL;
-- The Navy is stored already, in other letters, with a plant and a description of its own.
INSERT INTO companies (name, description) VALUES ('e2e mil NAVY', 'Stored before.');
INSERT INTO factories (company_id, name, state, latitude, longitude) SELECT id, 'E2E Mil Yard', 'VA', '36.8', '-76.3' FROM companies WHERE name = 'e2e mil NAVY';
-- The Army is stored as the service already, under another name.
INSERT INTO companies (name, service) VALUES ('E2E Mil Department of the Army', 'army');
-- A company whose name only resembles the Marine Corps', and one that has the slug the Air Force would take.
INSERT INTO companies (name) VALUES ('E2E Mil Marine');
INSERT INTO companies (name, slug) VALUES ('E2E Mil Other', 'e2e-mil-air-force');
SELECT COALESCE(MAX(id), 0) AS mark FROM load_log \\gset

\\i $D/migration.sql
\\set at first
\\i $D/read.sql
SELECT 'others', string_agg(name || '=' || COALESCE(service, 'none'), '; ' ORDER BY name) FROM companies WHERE name IN ('E2E Mil Marine', 'E2E Mil Other');
SELECT 'plants', COUNT(*) FROM factories f INNER JOIN companies c ON c.id = f.company_id WHERE c.name ILIKE 'E2E Mil %';

SELECT COALESCE(MAX(id), 0) AS mark FROM load_log \\gset
\\i $D/migration.sql
\\set at second
\\i $D/read.sql

-- A company that carries another service under one of the file's names: neither is changed.
UPDATE companies SET service = NULL WHERE name = 'E2E Mil Marine Corps';
UPDATE companies SET service = NULL WHERE name = 'E2E Mil Air Force';
UPDATE companies SET service = 'marine-corps' WHERE name = 'E2E Mil Air Force';
SELECT COALESCE(MAX(id), 0) AS mark FROM load_log \\gset
\\i $D/migration.sql
\\set at third
\\i $D/read.sql
ROLLBACK;
SQL
psql "$DB" -qtA -v ON_ERROR_STOP=1 -f "$D/run.sql" > "$D/run.out" 2> "$D/run.err"
expect "the migration applies, three times over"   0 "$?"
got() { grep "^$1|" "$D/run.out" | head -n1 | cut -d'|' -f2-; }
expect "the services after the first run" \
  "air-force=E2E Mil Air Force (no slug, af.e2e.test, Arlington, A fixture.); army=E2E Mil Department of the Army (e2e-mil-army, army.e2e.test, Arlington, A fixture.); marine-corps=E2E Mil Marine Corps (e2e-mil-marine-corps, marines.e2e.test, Arlington, A fixture.); navy=e2e mil NAVY (e2e-mil-navy, navy.e2e.test, Arlington, Stored befor)" \
  "$(got 'first services')"
expect "what a person is asked to read" \
  "found: e2e mil NAVY was stored already, with 1 plants, which a service does not have. It is now the service \"navy\"; filled: slug, domain, headquarters" \
  "$(got 'first look')"
expect "what it did quietly" \
  "kept: E2E Mil Department of the Army is the service \"army\" (the file calls it E2E Mil Army; the stored name is kept); filled: slug, domain, description, headquarters / created: E2E Mil Air Force: no company has that name. Created as the service \"air-force\", with no plants / created: E2E Mil Marine Corps: no company has that name. Created as the service \"marine-corps\", with no plants / summary: 4 services of the file: 2 created, 1 found by name, 1 already stored as the service, 0 not set; companies that are a service: 4" \
  "$(got 'first quiet')"
expect "a name that only resembles a service's is left alone, and so is the company with its slug" "E2E Mil Marine=none; E2E Mil Other=none" "$(got others)"
expect "no plant was added or moved"               1 "$(got plants)"
expect "a second run changes nothing"              "$(got 'first state')" "$(got 'second state')"
expect "and asks nobody to look again"             "" "$(got 'second look')"
expect "its summary"                               "kept: E2E Mil Department of the Army is the service \"army\" (the file calls it E2E Mil Army; the stored name is kept) / summary: 4 services of the file: 0 created, 0 found by name, 4 already stored as the service, 0 not set; companies that are a service: 4" "$(got 'second quiet')"
expect "a name that carries another service is not given a second" \
  "not set: E2E Mil Air Force is stored as the service \"marine-corps\". It was not made \"air-force\", and no company is" \
  "$(got 'third look')"
expect "and no company is created beside it"       "3 already stored as the service, 1 not set; companies that are a service: 3" "$(got 'third quiet' | sed 's/.*found by name, //')"
expect "nothing of the fixture is left"            0 "$(sql "SELECT COUNT(*) FROM companies WHERE name ILIKE 'E2E Mil %'")"

cleanup
expect "nothing of this run is left behind"        0 "$(sql "SELECT COUNT(*) FROM users WHERE email LIKE '%@military.test'")"
finish
