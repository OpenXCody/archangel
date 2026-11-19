#!/usr/bin/env bash
# End-to-end check of jobs from employers' postings (scripts/ingest/run.mjs
# postings, migration 0054, and the routes over them): made-up employers'
# boards, served by a local server standing in for the feeds, are rehearsed,
# run, run again with nothing changed, run with postings gone, changed and
# added, and undone on this database, which must end exactly as it began; then
# a job that came from a posting is read as a visitor, a seeker, a member of
# its company and an admin, and the places that wait for a plant are decided.
# Prints one line per check and exits non-zero if any fail.
#
# LOCAL ONLY: it creates companies named "E2E Postings ..." with plants in an
# empty part of Nevada (40.2 to 40.8 N, 117.9 to 117.3 W), sources called
# "postings-e2e-...", users at @postings.test, and removes all of it at the end.
#   API=http://localhost:3000/api DB=postgresql://... bash tests/api/postings.sh
# Needs a running dev API on the same database, and psql, curl and node.
# FEEDS_PORT (5999) is where the stand-in for the feeds listens.
set -u
. "$(dirname "$0")/lib.sh"
case "$DB" in *@localhost[:/]*|*@127.0.0.1[:/]*) ;; *) echo "Refusing to run against that database: local only."; exit 2;; esac
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
D=$(mktemp -d)
RUN=$(date +%s)
CHECK_SHOWS=300
PW='"password":"correct horse"'
FEEDS_PORT=${FEEDS_PORT:-5999}
FEEDS="http://127.0.0.1:$FEEDS_PORT"
expect() { # name wanted got
  if [ "$2" = "$3" ]; then echo "ok    $1"; else echo "FAIL  $1: wanted [$2] got [$3]"; fail=1; fi
}
ingest() { DATABASE_URL="$DB" node "$ROOT/scripts/ingest/run.mjs" "$@" --registry "$ROOT/tests/api/postings/boards.json" --reader "$ROOT/tests/api/postings/reader.mjs" --feeds "$FEEDS" 2>&1; }
boards() { node "$ROOT/tests/api/postings/boards.mjs" "$D/feeds" "$1"; }
last_run() { sql "SELECT max(id) FROM intake_runs WHERE source = 'postings-e2e-$1'"; }
asked() { curl -s "$FEEDS/_requests" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).filter((r)=>r.host==='$1').length))"; }
job() { sql "SELECT $2 FROM jobs j JOIN factories f ON f.id = j.factory_id WHERE j.source = 'postings-e2e-acme' AND j.source_id = '$1' ORDER BY f.name LIMIT 1"; }

cleanup() {
  psql "$DB" -qtA >/dev/null 2>&1 <<'SQL'
DELETE FROM audit_log WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%@postings.test') OR record_name LIKE 'E2E Postings %' OR record_name LIKE 'E2E POSTINGS %';
DELETE FROM load_log WHERE load LIKE 'postings-e2e-%';
DELETE FROM intake_changes WHERE run_id IN (SELECT id FROM intake_runs WHERE source LIKE 'postings-e2e-%');
DELETE FROM external_references WHERE source LIKE 'POSTINGS_E2E_%';
DELETE FROM jobs WHERE source LIKE 'postings-e2e-%' OR company_id IN (SELECT id FROM companies WHERE name LIKE 'E2E Postings %');
DELETE FROM intake_sources WHERE slug LIKE 'postings-e2e-%';
DELETE FROM factories WHERE name LIKE 'E2E POSTINGS %' OR company_id IN (SELECT id FROM companies WHERE name LIKE 'E2E Postings %');
DELETE FROM companies WHERE name LIKE 'E2E Postings %' AND parent_company_id IS NOT NULL;
DELETE FROM companies WHERE name LIKE 'E2E Postings %';
DELETE FROM users WHERE email LIKE '%@postings.test';
SQL
}
trap 'cleanup; kill "$FEEDS_PID" 2>/dev/null; rm -rf "$D"' EXIT

# What the database holds before a run.
#   Acme (also known as Acme Corp, the name the registry uses) has two plants in Postville and a yard in Palisade Bend
#   Acme Castings, a part of Acme, has one plant in Castings Gap
#   Works has a plant in Carlin Flat, which gives that town a centre 7 km from Acme's yard
#   nobody has a plant in Nowhere Springs
fixture() {
  cleanup
  psql "$DB" -qtA -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
INSERT INTO companies (name, aliases) VALUES ('E2E Postings Acme', ARRAY['E2E Postings Acme Corp']), ('E2E Postings Works', NULL);
INSERT INTO companies (name, parent_company_id) SELECT 'E2E Postings Acme Castings', id FROM companies WHERE name = 'E2E Postings Acme';
INSERT INTO factories (company_id, name, latitude, longitude, city, state, address, workforce_size)
SELECT (SELECT id FROM companies WHERE name = c), n, lat, lng, city, 'NV', a, w FROM (VALUES
  ('E2E Postings Acme',          'E2E POSTINGS ACME POSTVILLE PLANT',   '40.5000', '-117.6000', 'POSTVILLE',     '100 Main St',     300),
  ('E2E Postings Acme',          'E2E POSTINGS ACME POSTVILLE FOUNDRY', '40.5100', '-117.6000', 'Postville',     '250 Foundry Rd',  120),
  ('E2E Postings Acme Castings', 'E2E POSTINGS ACME CASTINGS',          '40.3000', '-117.4000', 'Castings Gap',  NULL,              NULL::int),
  ('E2E Postings Works',         'E2E POSTINGS WORKS CARLIN FLAT',      '40.7000', '-117.8000', 'Carlin Flat',   '9 Works Way',     80),
  ('E2E Postings Acme',          'E2E POSTINGS ACME PALISADE YARD',     '40.6600', '-117.7300', 'Palisade Bend', NULL,              NULL)
) AS t(c, n, lat, lng, city, a, w);
SQL
}

# Every table of the database as one line each: its name and a hash of its rows.
# $1: tables to leave out, as a SQL list.
hashes() {
  psql "$DB" -qtA -v skip="${1:-''}" <<'SQL'
SELECT set_config('e2e.skip', :'skip', false) \gset
DO $$
DECLARE t text; h text;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS table_hashes (name text, hash text);
  TRUNCATE table_hashes;
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT tablename = ANY(string_to_array(current_setting('e2e.skip'), ',')) ORDER BY tablename LOOP
    EXECUTE format('SELECT md5(coalesce(string_agg(md5((to_jsonb(x) - ''updated_at'')::text), '''' ORDER BY md5((to_jsonb(x) - ''updated_at'')::text)), '''')) FROM %I x', t) INTO h;
    INSERT INTO table_hashes VALUES (t, h);
  END LOOP;
END $$;
SELECT name || ' ' || hash FROM table_hashes ORDER BY name;
SQL
}
# What a run always leaves: its own row, its lines, and its journal.
RUN_TABLES='intake_runs,load_log,intake_changes'

mkdir -p "$D/feeds"
boards one
node "$ROOT/tests/api/postings/feeds.mjs" --dir "$D/feeds" --port "$FEEDS_PORT" >/dev/null 2>&1 &
FEEDS_PID=$!
for _ in 1 2 3 4 5 6 7 8 9 10; do curl -s "$FEEDS/_requests" >/dev/null 2>&1 && break; sleep 0.3; done

# --- The registry and the runner's refusals -------------------------------------
OUT=$(node "$ROOT/scripts/ingest/run.mjs" postings --check 2>&1)
case "$OUT" in *"the registry is usable: "*" employers are read"*) echo "ok    the committed registry passes its check";; *) echo "FAIL  registry check: $OUT"; fail=1;; esac
printf '{"employers":[{"slug":"x","employer":"X","company":"X","system":"smartrecruiters","board":"x"}],"leftOut":[]}' > "$D/bad.json"
OUT=$(node "$ROOT/scripts/ingest/run.mjs" postings --check --registry "$D/bad.json" 2>&1)
case "$OUT" in *'no adapter reads the system "smartrecruiters"'*) echo "ok    a system no adapter reads fails the check";; *) echo "FAIL  bad registry: $OUT"; fail=1;; esac
OUT=$(DATABASE_URL='postgresql://u:p@db.example.com/x' node "$ROOT/scripts/ingest/run.mjs" postings 2>&1)
case "$OUT" in *'Refusing: the database is on "db.example.com"'*) echo "ok    a database that is not local is refused";; *) echo "FAIL  remote refusal: $OUT"; fail=1;; esac
OUT=$(DATABASE_URL="$DB" node "$ROOT/scripts/ingest/run.mjs" postings --registry "$ROOT/tests/api/postings/boards.json" --feeds https://feeds.example.com 2>&1)
case "$OUT" in *"--feeds names a server on this machine"*) echo "ok    the feeds can only be stood in for on this machine";; *) echo "FAIL  feeds elsewhere: $OUT"; fail=1;; esac

# --- A rehearsal leaves nothing ---------------------------------------------------
fixture
hashes > "$D/before.txt"
OUT=$(ingest rehearse postings-e2e-acme)
case "$OUT" in *"a rehearsal: nothing was kept"*"read: 9 postings listed; 1 not one of our careers, 0 outside the United States, 1 naming no place; kept 7"*"placed: 5 postings at a plant; 2 waiting on 1 places"*"jobs: 6 added"*) echo "ok    a rehearsal reports what it would do";; *) echo "FAIL  rehearsal report: $OUT"; fail=1;; esac
hashes > "$D/rehearsed.txt"
expect "a rehearsal leaves every table as it was" '' "$(diff "$D/before.txt" "$D/rehearsed.txt")"

# --- A first run -------------------------------------------------------------------
OUT=$(ingest postings)
R1=$(last_run acme)
case "$OUT" in *"postings: 4 employers, "*" 1 refusal, 0 failed"*) echo "ok    every employer is run, and a refusal is not a failure";; *) echo "FAIL  first run: $OUT"; fail=1;; esac
expect "the run is applied and counts what it did" 'applied read 9 7 7 5 2 6' "$(sql "SELECT concat_ws(' ', state, counts->>'outcome', counts->>'read', counts->>'kept', counts->>'new', counts->>'placed', counts->>'waiting', counts->>'jobsAdded') FROM intake_runs WHERE id = $R1")"
expect "only postings that are a career at a US place are staged" '101 102 103 104 105 106 109' "$(sql "SELECT string_agg(source_id, ' ' ORDER BY source_id) FROM intake_records WHERE source = 'postings-e2e-acme'")"
expect "what is staged is facts and a link, never the text" 'f' "$(sql "SELECT bool_or(payload::text ~ 'About the role' OR facts::text ~ 'About the role') FROM intake_records WHERE source LIKE 'postings-e2e-%'")"
expect "the text is kept only as a hash"   't' "$(sql "SELECT bool_and(payload->>'text' ~ '^[0-9a-f]{32}\$') FROM intake_records WHERE source LIKE 'postings-e2e-%'")"
expect "a job has no description"          '0' "$(sql "SELECT count(*) FROM jobs WHERE source LIKE 'postings-e2e-%' AND description IS NOT NULL")"
expect "the registry's name finds the company by its other name" 'E2E Postings Acme' "$(job 101 "(SELECT name FROM companies WHERE id = j.company_id)")"
expect "of two plants in the city, the largest" 'E2E POSTINGS ACME POSTVILLE PLANT' "$(job 101 f.name)"
expect "unless the posting's words name one" 'E2E POSTINGS ACME POSTVILLE FOUNDRY' "$(job 102 f.name)"
expect "a plant of a part of the company, filed under that part" 'E2E POSTINGS ACME CASTINGS|E2E Postings Acme Castings' "$(job 103 "f.name || '|' || (SELECT name FROM companies WHERE id = j.company_id)")"
expect "no plant in the town: the company's nearest, by the town's own centre" 'E2E POSTINGS ACME PALISADE YARD' "$(job 104 f.name)"
expect "and the line says how far"          't' "$(sql "SELECT look AND detail LIKE '%no plant in that city: the nearest, 7.4 km from its centre' FROM load_log WHERE run_id = $R1 AND source_id = '104' AND action = 'added'")"
expect "a posting at two places is a job at each" '2' "$(sql "SELECT count(*) FROM jobs WHERE source = 'postings-e2e-acme' AND source_id = '106'")"
expect "a place with no plant makes no job" '0' "$(sql "SELECT count(*) FROM jobs WHERE source = 'postings-e2e-acme' AND source_id IN ('105', '109')")"
expect "it waits, with how many postings name it" 'Nowhere Springs|NV|waiting' "$(sql "SELECT concat_ws('|', city, state, status) FROM posting_places WHERE source = 'postings-e2e-acme'")"
expect "one outside id is one job"          '6 6' "$(sql "SELECT count(*) || ' ' || count(DISTINCT external_id) FROM external_references WHERE source = 'POSTINGS_E2E_ACME' AND entity_type = 'jobs'")"
expect "the id is the posting at its place" '106@castings gap|NV 106@postville|NV' "$(sql "SELECT string_agg(external_id, ' ' ORDER BY external_id) FROM external_references WHERE source = 'POSTINGS_E2E_ACME' AND external_id LIKE '106@%'")"
expect "a job carries what was read"        'Welder|II|2|2800|3400|hour|2nd shift|full-time|https://jobs.ashbyhq.com/e2e-acme/101' "$(job 101 "concat_ws('|', j.title, j.level_word, j.level_rank, j.pay_min, j.pay_max, j.pay_period, j.shift, j.employment_type, j.apply_url)")"
expect "its requirements as facts"          '{"yearsMax": 4, "yearsMin": 2, "education": "High school diploma", "citizenship": "US person", "certifications": ["AWS D1.1"]}' "$(job 101 j.requirements)"
expect "its skills, by their catalogue names" 'Flux-Cored Welding, MIG Welding' "$(job 101 "(SELECT string_agg(s.name, ', ' ORDER BY s.name) FROM job_skills js JOIN skills s ON s.id = js.skill_id WHERE js.job_id = j.id)")"
expect "a make brings its skill"            'CNC Control Operation, PLC Programming|Haas, Studio 5000' "$(job 102 "(SELECT string_agg(s.name, ', ' ORDER BY s.name) FROM job_skills js JOIN skills s ON s.id = js.skill_id WHERE js.job_id = j.id) || '|' || (SELECT string_agg(m.name, ', ' ORDER BY m.name) FROM job_makes jm JOIN skill_makes m ON m.id = jm.make_id WHERE jm.job_id = j.id)")"
expect "pay the text states, in cents a year" '6200000|8100000|year' "$(job 102 "concat_ws('|', j.pay_min, j.pay_max, j.pay_period)")"
expect "a job with no pay stated has none"  '|' "$(job 103 "coalesce(j.pay_min::text, '') || '|' || coalesce(j.pay_max::text, '')")"
expect "and is not called full-time unless the feed says so" 'full-time' "$(job 103 j.employment_type)"
expect "when it was posted is the posting's day" '2026-11-10 12:00:00' "$(job 103 j.posted_at)"
expect "it expires seven days after it was last seen" 't' "$(job 101 "j.created_by IS NULL AND j.last_seen_at > now() - interval '5 minutes' AND j.expires_at BETWEEN (now() AT TIME ZONE 'UTC') + interval '6 days 23 hours' AND (now() AT TIME ZONE 'UTC') + interval '7 days 1 hour'")"
expect "every job is journalled"            '6 6' "$(sql "SELECT count(*) FILTER (WHERE op = 'job') || ' ' || count(*) FILTER (WHERE op = 'id') FROM intake_changes WHERE run_id = $R1")"

# Workday's shape: the text is asked for only where the title is kept.
RW=$(last_run works)
expect "a list and then a text: three listed, one abroad left out by the filter, one kept" 'read 2 1 1 1' "$(sql "SELECT concat_ws(' ', counts->>'outcome', counts->>'read', counts->>'notCareer', counts->>'texts', counts->>'jobsAdded') FROM intake_runs WHERE id = $RW")"
expect "robots, the list twice, one text"   4 "$(asked e2e.wd1.myworkdayjobs.com)"
expect "the day it was posted comes from the posting itself" '2026-11-16 00:00:00' "$(sql "SELECT posted_at FROM jobs WHERE source = 'postings-e2e-works'")"
# A company we do not list, and a site that says no.
expect "a company the registry names that we do not list is logged, and its board is not read" 'failed|not listed|0' "$(sql "SELECT concat_ws('|', state, counts->>'outcome', counts->>'requests') FROM intake_runs WHERE source = 'postings-e2e-ghost'")"
expect "the line says which"                't' "$(sql "SELECT look AND detail LIKE 'the registry names E2E Postings Nobody, which is not a company in our data%' FROM load_log WHERE load = 'postings-e2e-ghost' AND action = 'not listed'")"
expect "a refusal is recorded against the run" 'failed|refused|1|api.lever.co/robots.txt answered 403' "$(sql "SELECT concat_ws('|', state, counts->>'outcome', counts->>'requests', note) FROM intake_runs WHERE source = 'postings-e2e-refused'")"
expect "one request, and it was the robots file" 1 "$(asked api.lever.co)"

# --- The same boards again: nothing is written ------------------------------------
hashes "$RUN_TABLES" > "$D/after-first.txt"
BEFORE=$(asked e2e.wd1.myworkdayjobs.com)
OUT=$(ingest postings --only e2e-acme,e2e-works)
R2=$(last_run acme)
expect "the same board again: nothing is new" '0 0 7 0 0 0 0' "$(sql "SELECT concat_ws(' ', counts->>'new', counts->>'changed', counts->>'same', counts->>'gone', counts->>'jobsAdded', counts->>'jobsChanged', counts->>'jobsClosed') FROM intake_runs WHERE id = $R2")"
expect "and nothing is journalled"          0 "$(sql "SELECT count(*) FROM intake_changes WHERE run_id >= $R2")"
hashes "$RUN_TABLES" > "$D/after-second.txt"
expect "a run with nothing changed writes nothing but its own row" '' "$(diff "$D/after-first.txt" "$D/after-second.txt")"
expect "an unchanged listing costs no request for its text: robots and the list twice" 3 "$(( $(asked e2e.wd1.myworkdayjobs.com) - BEFORE ))"

# --- A later board: gone, changed, moved, added ------------------------------------
boards two
hashes "$RUN_TABLES" > "$D/before-third.txt"
OUT=$(ingest load postings-e2e-acme)
R3=$(last_run acme)
expect "a later board: new, changed, the same, gone" '1 2 4 1' "$(sql "SELECT concat_ws(' ', counts->>'new', counts->>'changed', counts->>'same', counts->>'gone') FROM intake_runs WHERE id = $R3")"
expect "jobs added, changed, closed"        '2 1 1' "$(sql "SELECT concat_ws(' ', counts->>'jobsAdded', counts->>'jobsChanged', counts->>'jobsClosed') FROM intake_runs WHERE id = $R3")"
expect "a changed posting corrects its job" '3000|3600' "$(job 101 "j.pay_min || '|' || j.pay_max")"
expect "the line says what changed"         't' "$(sql "SELECT detail LIKE 'Welder, at Postville, NV: the posting changed: pay_max, pay_min' FROM load_log WHERE run_id = $R3 AND action = 'changed'")"
expect "a posting that moved: its old job is closed, a new one opened" 'closed:E2E POSTINGS ACME CASTINGS open:E2E POSTINGS ACME POSTVILLE PLANT' "$(sql "SELECT string_agg(j.status || ':' || f.name, ' ' ORDER BY f.name) FROM jobs j JOIN factories f ON f.id = j.factory_id WHERE j.source = 'postings-e2e-acme' AND j.source_id = '103'")"
expect "a posting gone for one run keeps its job open" 'open' "$(job 104 j.status)"
expect "a new posting is a new job"         'TIG Welder|2026-11-18 09:00:00' "$(job 110 "j.title || '|' || j.posted_at")"
OUT=$(ingest load postings-e2e-acme)
R4=$(last_run acme)
expect "gone for two runs running: closed, never deleted" "closed|No longer on the company's careers site" "$(job 104 "j.status || '|' || j.closed_reason")"
expect "the run says so"                    '0 0 1' "$(sql "SELECT concat_ws(' ', counts->>'jobsAdded', counts->>'jobsChanged', counts->>'jobsClosed') FROM intake_runs WHERE id = $R4")"
J104=$(job 104 j.id)
boards one
OUT=$(ingest load postings-e2e-acme)
R5=$(last_run acme)
expect "a posting that returns reopens its job" "open||$J104" "$(job 104 "j.status || '|' || coalesce(j.closed_reason, '') || '|' || j.id")"
expect "back, changed, gone; reopened"      '1 2 1 2' "$(sql "SELECT concat_ws(' ', counts->>'back', counts->>'changed', counts->>'gone', counts->>'jobsReopened') FROM intake_runs WHERE id = $R5")"
expect "no job was ever deleted by a run"   8 "$(sql "SELECT count(*) FROM jobs WHERE source = 'postings-e2e-acme'")"

# --- Undo, newest first, and the database is as it was -----------------------------
OUT=$(ingest undo "$R3")
case "$OUT" in *"Undo run $R5 first"*) echo "ok    an earlier run is not undone before a later one";; *) echo "FAIL  undo order: $OUT"; fail=1;; esac
ingest undo "$R5" >/dev/null
ingest undo "$R4" >/dev/null
ingest undo "$R3" >/dev/null
hashes "$RUN_TABLES" > "$D/after-undo.txt"
expect "undoing the later runs puts every table back as it was before them" '' "$(diff "$D/before-third.txt" "$D/after-undo.txt")"
expect "a job a run closed is open again, one it added is gone" 'open|0' "$(job 104 j.status)|$(sql "SELECT count(*) FROM jobs WHERE source = 'postings-e2e-acme' AND source_id = '110'")"
for run in $(sql "SELECT id FROM intake_runs WHERE source LIKE 'postings-e2e-%' AND state = 'applied' ORDER BY id DESC"); do ingest undo "$run" >/dev/null; done
expect "undoing every run removes every job, id and waiting place" '0 0 0 0' "$(sql "SELECT concat_ws(' ', (SELECT count(*) FROM jobs WHERE source LIKE 'postings-e2e-%'), (SELECT count(*) FROM external_references WHERE source LIKE 'POSTINGS_E2E_%'), (SELECT count(*) FROM posting_places WHERE source LIKE 'postings-e2e-%'), (SELECT count(*) FROM intake_records WHERE source LIKE 'postings-e2e-%'))")"
for slug in acme works ghost refused; do ingest forget "postings-e2e-$slug" >/dev/null; done
hashes > "$D/after.txt"
expect "after undo and forget every table is exactly as it was" '' "$(diff "$D/before.txt" "$D/after.txt")"

# --- A job that came from a posting, as each person reads it ----------------------
fixture
boards one
ingest postings >/dev/null
RA=$(last_run acme)
J101=$(job 101 j.id)
J102=$(job 102 j.id)
ACME=$(sql "SELECT id FROM companies WHERE name = 'E2E Postings Acme'")
PLANT=$(sql "SELECT id FROM factories WHERE name = 'E2E POSTINGS ACME POSTVILLE PLANT'")
YARD=$(sql "SELECT id FROM factories WHERE name = 'E2E POSTINGS ACME PALISADE YARD'")
WELDER=$(sql "SELECT id FROM occupations WHERE title = 'Welder'")
MIG=$(sql "SELECT id FROM skills WHERE name = 'MIG Welding'")
uid() { sql "SELECT id FROM users WHERE email = '$1-$RUN@postings.test'"; }

# A visitor
OUT=$(req anon GET '/jobs?q=E2E+Postings&limit=3')
check "sourced jobs are in the jobs list"   200 "$OUT" '"companyName":"E2E Postings '
expect "the list says how many match in all, and gives a page" '7 3 0' "$(printf '%s' "$OUT" | j "total + ' ' + o.jobs.length + ' ' + o.offset")"
FIRST=$(printf '%s' "$OUT" | j "jobs.map((x) => x.id).join(' ')")
expect "the next page carries on where the first stopped" '3 0' "$(req anon GET '/jobs?q=E2E+Postings&limit=3&offset=3' | j "jobs.length + ' ' + o.jobs.filter((x) => '$FIRST'.includes(x.id)).length")"
expect "newest first"                       'true' "$(req anon GET '/jobs?q=E2E+Postings' | j "jobs.every((x, i, all) => i === 0 || all[i - 1].postedAt >= x.postedAt)")"
expect "what was typed narrows it: title, company and place" '2' "$(req anon GET '/jobs?q=welder+E2E+Postings+postville' | j total)"
expect "a state narrows it"                 'true' "$(req anon GET '/jobs?state=NV&q=E2E+Postings' | j "total === 7 && o.jobs.every((x) => x.state === 'NV')")"
expect "near a place, nearest first"        'E2E POSTINGS ACME POSTVILLE PLANT' "$(req anon GET '/jobs?near=40.5,-117.6&within=5&q=welder' | j "jobs[0].factoryName")"
check "what is open, and where"             200 "$(req anon GET /jobs/summary)" '"state":"NV"'
expect "the summary counts every open job"  'true' "$(req anon GET /jobs/summary | j "total >= 7 && o.states.find((x) => x.state === 'NV').jobs >= 7")"
OUT=$(req anon GET /jobs/$J101)
check "a sourced job's page"                200 "$OUT" '"fromSource":true'
expect "it carries facts and a link, no description" 'Welder||https://jobs.ashbyhq.com/e2e-acme/101|II|2|true|false' "$(printf '%s' "$OUT" | j "job && [o.job.title, o.job.description, o.job.applyUrl, o.job.levelWord, o.job.levelRank, o.job.isOpen, o.canManage].join('|')")"
expect "its requirements"                   '2|4|High school diploma|AWS D1.1|US person' "$(printf '%s' "$OUT" | j "job && [o.job.requirements.yearsMin, o.job.requirements.yearsMax, o.job.requirements.education, o.job.requirements.certifications[0], o.job.requirements.citizenship].join('|')")"
expect "its skills"                         'Flux-Cored Welding, MIG Welding' "$(printf '%s' "$OUT" | j "skills.map((x) => x.name).sort().join(', ')")"
expect "a make is under the skill it is a make of" 'CNC Control Operation: Haas; PLC Programming: Studio 5000' "$(req anon GET /jobs/$J102 | j "skills.map((x) => x.name + ': ' + x.makes.map((m) => m.name).join(', ')).sort().join('; ')")"
expect "the company's page lists its jobs"  'true' "$(req anon GET /companies/$ACME | j "jobs.some((x) => x.id === '$J101')")"
expect "the plant's page lists its jobs"    'true' "$(req anon GET /factories/$PLANT | j "jobs.some((x) => x.id === '$J101')")"
expect "the career's page lists them"       'true' "$(req anon GET /occupations/$WELDER | j "jobs.some((x) => x.id === '$J101')")"
expect "the skill's page lists the jobs that ask for it" 'true' "$(req anon GET /skills/$MIG | j "jobs.some((x) => x.id === '$J101')")"
expect "a page lists the newest few and says how many are open in all" '4 4' "$(req anon GET /companies/$ACME | j "jobs.length + ' ' + o.openJobCount")"
expect "the jobs list narrows to a company, a plant and a skill, as their pages link" '4 2 2' "$(req anon GET "/jobs?companyId=$ACME" | j total) $(req anon GET "/jobs?factoryId=$PLANT" | j total) $(req anon GET "/jobs?skillId=$MIG&q=E2E+Postings" | j total)"
expect "search finds it"                    'true' "$(req anon GET '/search?q=E2E+Postings+Acme' | j "results.jobs.count >= 1")"
expect "the map's pins count it"            'true' "$(req anon GET /factories/pins | j "pins.find((x) => x[0] === '$PLANT')[8] >= 1")"

# A seeker
check "sign-up seeker"                      201 "$(req s POST /auth/sign-up "{\"email\":\"seeker-$RUN@postings.test\",\"name\":\"Sam Seeker\",$PW}")"
check "the seeker holds a skill"            200 "$(req s PUT /me/skills/$MIG '{"status":"held"}')"
expect "the job says which of its skills the person holds" 'Flux-Cored Welding:false MIG Welding:true' "$(req s GET /jobs/$J101 | j "skills.map((x) => x.name + ':' + x.held).sort().join(' ')")"
check "applying is on the company's own site" 400 "$(req s POST /jobs/$J101/apply '{}')" "own site"

# A member of the company
check "sign-up member"                      201 "$(req m POST /auth/sign-up "{\"email\":\"member-$RUN@postings.test\",\"name\":\"Mel Member\",\"purpose\":\"hire\",$PW}")"
sql "INSERT INTO company_members (company_id, user_id, role, status) VALUES ('$ACME', '$(uid member)', 'member', 'active')" >/dev/null
expect "a member can see it is the company's" 'true true' "$(req m GET /jobs/$J101 | j "canManage + ' ' + o.job.fromSource")"
check "a member cannot edit it"             409 "$(req m PATCH /jobs/$J101 '{"title":"Welder, edited"}')" "kept in step"
check "nor close it"                        409 "$(req m PATCH /jobs/$J101 '{"status":"closed"}')" "careers site"
check "nor delete it"                       409 "$(req m DELETE /jobs/$J101)" "careers site"
expect "it is as it was"                    'Welder|open' "$(job 101 "j.title || '|' || j.status")"
check "a stranger cannot either"            403 "$(req s PATCH /jobs/$J101 '{"title":"x"}')"
OUT=$(req m GET /employer)
expect "Your jobs lists what members posted, and counts the rest" '0 4' "$(printf '%s' "$OUT" | j "companies.filter((c) => c.companyId === '$ACME').map((c) => c.jobs.length + ' ' + c.listedJobs)[0]")"
check "nobody applied, so there is nothing to read" 200 "$(req m GET /jobs/$J101/applications)" '"applications":\[\]'

# --- Admin Tools: each employer's latest run, and the places that wait --------------
check "sign-up admin"                       201 "$(req a POST /auth/sign-up "{\"email\":\"admin-$RUN@postings.test\",\"name\":\"Ada Admin\",$PW}")"
DATABASE_URL="$DB" node "$ROOT/scripts/make-admin.mjs" "admin-$RUN@postings.test" >/dev/null 2>&1
for path in /admin/postings /admin/postings/places; do
  check "401 GET $path"                     401 "$(req anon GET "$path")"
  check "403 GET $path"                     403 "$(req s GET "$path")"
done
check "401 deciding a place"                401 "$(req anon POST /admin/postings/places '{}')"
check "403 deciding a place"                403 "$(req m POST /admin/postings/places '{}')"
OUT=$(req a GET /admin/postings)
check "the employers' runs"                 200 "$OUT" '"slug":"postings-e2e-acme"'
expect "read, kept, added, changed, closed, waiting" 'read 9 7 6 0 0 2 1' "$(printf '%s' "$OUT" | j "sources.filter((x) => x.slug === 'postings-e2e-acme').map((x) => [x.run.outcome, x.run.read, x.run.kept, x.run.added, x.run.changed, x.run.closed, x.run.waiting, x.waitingPlaces].join(' '))[0]")"
expect "a refusal, with what refused"       'refused|api.lever.co/robots.txt answered 403' "$(printf '%s' "$OUT" | j "sources.filter((x) => x.slug === 'postings-e2e-refused').map((x) => x.run.outcome + '|' + x.run.why)[0]")"
expect "a company we do not list"           'not listed' "$(printf '%s' "$OUT" | j "sources.find((x) => x.slug === 'postings-e2e-ghost').run.outcome")"
expect "employers' postings are not among the sources of plants" 'undefined' "$(req a GET /admin/intake/sources | j "sources.find((x) => x.slug.startsWith('postings-'))")"
WAITING0=$(( $(req a GET /admin/overview | j waitingPlaces) ))
OUT=$(req a GET /admin/postings/places)
check "the places that wait"                200 "$OUT" '"city":"Nowhere Springs"'
expect "the employer, the place, how many postings and their titles" 'E2E Postings Acme|Nowhere Springs|NV|2|Manufacturing Engineer, Production Operator' "$(printf '%s' "$OUT" | j "places.filter((x) => x.source === 'postings-e2e-acme').map((x) => [x.employer, x.city, x.state, x.postings, x.titles.join(', ')].join('|'))[0]")"
expect "and the company's plants in that state to choose from" 'true' "$(printf '%s' "$OUT" | j "places.find((x) => x.source === 'postings-e2e-acme').plants.some((x) => x.id === '$YARD')")"
PLACE='{"source":"postings-e2e-acme","placeKey":"nowhere springs|NV"'
check "a decision that is not one"          400 "$(req a POST /admin/postings/places "$PLACE,\"decision\":\"maybe\"}")" 'point, leave or wait'
check "pointing needs a plant"              400 "$(req a POST /admin/postings/places "$PLACE,\"decision\":\"point\"}")" 'Choose a plant'
check "a place that is not on the list"     404 "$(req a POST /admin/postings/places '{"source":"postings-e2e-acme","placeKey":"atlantis|NV","decision":"leave"}')"
OUT=$(req a POST /admin/postings/places "$PLACE,\"decision\":\"point\",\"plantId\":\"$YARD\"}")
check "point the place at a plant"          200 "$OUT" '"status":"pointed"'
expect "every posting naming it follows, at once" '2' "$(printf '%s' "$OUT" | j jobs)"
expect "the jobs are at that plant"         'Manufacturing Engineer, Production Operator' "$(sql "SELECT string_agg(j.title, ', ' ORDER BY j.title) FROM jobs j WHERE j.source = 'postings-e2e-acme' AND j.source_id IN ('105', '109') AND j.factory_id = '$YARD' AND j.status = 'open'")"
expect "the place no longer waits"          "$(( WAITING0 - 1 ))" "$(req a GET /admin/overview | j waitingPlaces)"
expect "the act is on record"               'postings pointed here|Nowhere Springs, NV|2' "$(req a GET '/admin/audit?kind=factory&limit=20' | j "entries.filter((e) => e.recordId === '$YARD').map((e) => [e.action, e.detail.place, e.detail.jobs].join('|'))[0]")"
# The next run agrees with the admin: nothing changes.
ingest load postings-e2e-acme >/dev/null
expect "the next run leaves the admin's jobs as they are" '0 0 0' "$(sql "SELECT concat_ws(' ', counts->>'jobsAdded', counts->>'jobsChanged', counts->>'jobsClosed') FROM intake_runs WHERE id = $(last_run acme)")"
OUT=$(req a POST /admin/postings/places "$PLACE,\"decision\":\"wait\"}")
check "take it back"                        200 "$OUT" '"status":"waiting"'
expect "the jobs made by pointing are closed" '2 closed' "$(printf '%s' "$OUT" | j jobs) $(sql "SELECT DISTINCT status FROM jobs WHERE source = 'postings-e2e-acme' AND source_id IN ('105', '109')")"
check "leave the place"                     200 "$(req a POST /admin/postings/places "$PLACE,\"decision\":\"leave\"}")" '"status":"left"'
expect "a place that was left is not asked about again" 'undefined' "$(req a GET /admin/postings/places | j "places.find((x) => x.source === 'postings-e2e-acme')")"
ingest load postings-e2e-acme >/dev/null
expect "nor by the next run"                'left' "$(sql "SELECT status FROM posting_places WHERE source = 'postings-e2e-acme'")"
expect "leaving is on record too"           'postings place left, postings place waits again' "$(req a GET '/admin/audit?kind=company&limit=20' | j "entries.filter((e) => e.recordId === '$ACME').map((e) => e.action).sort().join(', ')")"

# A plant that goes takes its jobs' ids with it; the next run does not trip on them.
sql "DELETE FROM jobs WHERE id = '$J102'" >/dev/null
OUT=$(ingest load postings-e2e-acme)
expect "a job that was removed by hand is made again, once" '1 1' "$(sql "SELECT concat_ws(' ', (SELECT counts->>'jobsAdded' FROM intake_runs WHERE id = $(last_run acme)), (SELECT count(*) FROM external_references WHERE source = 'POSTINGS_E2E_ACME' AND external_id = '102@postville|NV'))")"

cleanup
expect "nothing of this run is left behind" '0 0 0 0 0 0 0' "$(sql "SELECT concat_ws(' ', (SELECT count(*) FROM users WHERE email LIKE '%@postings.test'), (SELECT count(*) FROM companies WHERE name LIKE 'E2E Postings %'), (SELECT count(*) FROM factories WHERE name LIKE 'E2E POSTINGS %'), (SELECT count(*) FROM intake_sources WHERE slug LIKE 'postings-e2e-%'), (SELECT count(*) FROM external_references WHERE source LIKE 'POSTINGS_E2E_%'), (SELECT count(*) FROM jobs WHERE source LIKE 'postings-e2e-%'), (SELECT count(*) FROM audit_log WHERE record_name ILIKE 'E2E Postings %'))")"
finish
