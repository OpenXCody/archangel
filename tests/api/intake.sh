#!/usr/bin/env bash
# End-to-end check of intake (scripts/ingest/run.mjs, migration 0043 and the
# Admin Tools routes over them): a made-up source is rehearsed, staged,
# resolved, applied and undone on this database, which must end exactly as it
# began; then its review queue is decided through the API. Prints one line per
# check and exits non-zero if any fail.
#
# LOCAL ONLY: it creates companies named "E2E Intake ..." with plants in an
# empty part of Nevada (41.2 to 41.8 N, 117.0 to 116.4 W), a source called
# "e2e-intake" (tests/api/intake/e2e-source.mjs), users at @intake.test, and
# removes all of it at the end.
#   API=http://localhost:3000/api DB=postgresql://... bash tests/api/intake.sh
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
ADAPTER="$ROOT/tests/api/intake/e2e-source.mjs"
ingest() { DATABASE_URL="$DB" node "$ROOT/scripts/ingest/run.mjs" "$@" --adapter "$ADAPTER" 2>&1; }
last_run() { sql "SELECT max(id) FROM intake_runs WHERE source = 'e2e-intake'"; }

cleanup() {
  psql "$DB" -qtA >/dev/null 2>&1 <<'SQL'
DELETE FROM audit_log WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%@intake.test') OR record_name LIKE 'E2E Intake %' OR record_name LIKE 'E2E INTAKE %';
DELETE FROM load_log WHERE load = 'e2e-intake';
DELETE FROM intake_changes WHERE run_id IN (SELECT id FROM intake_runs WHERE source = 'e2e-intake');
DELETE FROM intake_sources WHERE slug = 'e2e-intake';
DELETE FROM external_references WHERE source = 'E2E_INTAKE';
DELETE FROM factories WHERE name ILIKE 'E2E INTAKE %' OR company_id IN (SELECT id FROM companies WHERE name LIKE 'E2E Intake %');
DELETE FROM record_merges WHERE from_name LIKE 'E2E Intake %';
DELETE FROM companies WHERE name LIKE 'E2E Intake %';
DELETE FROM users WHERE email LIKE '%@intake.test';
SQL
}
trap 'cleanup; rm -rf "$D"' EXIT

# What the database might hold before a load.
#   MAIN PLANT   carries the source's id E2E-1; has no industry, address or ZIP
#   FOUNDRY      no id; the same plant as record E2E-2 (same name, 110 m off), with an older address and industry
#   WAREHOUSE    filed under a stranger, 100 m from record E2E-3 and named for Acme: a match to review
#   PLANT 4      carries E2E-4; its address was typed by an admin, its headcount is from 2020
#   TWIN INC/LLC two plants one name: record E2E-9 fits both equally
fixture() {
  cleanup
  psql "$DB" -qtA -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
INSERT INTO companies (name, aliases) VALUES
  ('E2E Intake Acme', ARRAY['E2E Intake Acme Corp']), ('E2E Intake Stranger', NULL), ('E2E Intake Old Name', NULL);
INSERT INTO factories (company_id, name, latitude, longitude, city, state, address, primary_naics, primary_naics_description, workforce_size, workforce_year)
SELECT (SELECT id FROM companies WHERE name = c), n, lat, lng, 'ELKO', 'NV', a, code, ind, w, wy FROM (VALUES
  ('E2E Intake Acme',     'E2E INTAKE ACME MAIN PLANT', '41.5000', '-116.7000', NULL, NULL, NULL, NULL::int, NULL::int),
  ('E2E Intake Acme',     'E2E INTAKE ACME FOUNDRY',    '41.5100', '-116.7000', '1 Old Rd', '331', 'Primary Metal Manufacturing', NULL, NULL),
  ('E2E Intake Stranger', 'E2E INTAKE ACME WAREHOUSE',  '41.4009', '-116.6000', NULL, NULL, NULL, NULL, NULL),
  ('E2E Intake Acme',     'E2E INTAKE ACME PLANT 4',    '41.6000', '-116.6000', '4 Admin Way', NULL, NULL, 50, 2020),
  ('E2E Intake Acme',     'E2E INTAKE ACME TWIN INC',   '41.3000', '-116.5000', NULL, NULL, NULL, NULL, NULL),
  ('E2E Intake Acme',     'E2E INTAKE ACME TWIN LLC',   '41.3010', '-116.5000', NULL, NULL, NULL, NULL, NULL)
) AS t(c, n, lat, lng, a, code, ind, w, wy);
INSERT INTO external_references (entity_type, entity_id, source, external_id)
SELECT 'factories', id, 'E2E_INTAKE', CASE name WHEN 'E2E INTAKE ACME MAIN PLANT' THEN 'E2E-1' ELSE 'E2E-4' END
FROM factories WHERE name IN ('E2E INTAKE ACME MAIN PLANT', 'E2E INTAKE ACME PLANT 4');
INSERT INTO fact_sources (factory_id, fact, source, rank) SELECT id, 'address', 'admin', 100 FROM factories WHERE name = 'E2E INTAKE ACME PLANT 4';
SQL
}

# The source's file: one line per record.
cat > "$D/one.jsonl" <<'EOF'
{"id":"E2E-1","name":"E2E Intake Acme Main Plant","company":"E2E Intake Acme","city":"Elko","state":"NV","latitude":"41.5001","longitude":"-116.7000","address":"1 Main St","zip":"89801","naics":"332710","industry":"Fabricated Metal Product Manufacturing","people":120,"peopleYear":2024,"peopleSource":"https://example.test/main"}
{"id":"E2E-2","name":"E2E Intake Acme Foundry","company":"E2E Intake Acme Corp","city":"Elko","state":"NV","latitude":"41.5110","longitude":"-116.7000","address":"2 Foundry Rd","naics":"331511","industry":"Primary Metal Manufacturing"}
{"id":"E2E-3","name":"E2E Intake Acme Street Depot","company":"E2E Intake Acme","city":"Elko","state":"NV","latitude":"41.4000","longitude":"-116.6000","address":"3 Depot St"}
{"id":"E2E-4","name":"E2E Intake Acme Plant 4","company":"E2E Intake Acme","city":"Elko","state":"NV","latitude":"41.6000","longitude":"-116.6000","address":"4 Source Blvd","people":80,"peopleYear":2024,"peopleSource":"https://example.test/four"}
{"id":"E2E-5","name":"E2E Intake Acme New Site","company":"E2E Intake Acme","city":"Elko","state":"NV","latitude":"41.4500","longitude":"-116.8000","naics":"333120","industry":"Machinery Manufacturing"}
{"id":"E2E-6","name":"E2E Intake Newco Works","company":"E2E Intake Newco","city":"Elko","state":"NV","latitude":"41.3500","longitude":"-116.9000"}
{"id":"E2E-7","name":"E2E Intake Nowhere","company":"E2E Intake Acme","city":"Elko","state":"NV"}
{"id":"E2E-8","name":"E2E Intake Acme Ready Mix","company":"E2E Intake Acme","city":"Elko","state":"NV","latitude":"41.7000","longitude":"-116.9000","naics":"327320"}
{"id":"E2E-9","name":"E2E Intake Acme Twin","company":"E2E Intake Acme","city":"Elko","state":"NV","latitude":"41.3005","longitude":"-116.5000","zip":"89815"}
EOF
# A later file: the first plant has a newer headcount, the new site is no longer listed.
sed -e 's/"people":120,"peopleYear":2024/"people":135,"peopleYear":2025/' -e '/"id":"E2E-5"/d' "$D/one.jsonl" > "$D/two.jsonl"

# Every table of the database as one line each: its name and a hash of its rows.
hashes() {
  psql "$DB" -qtA <<'SQL'
DO $$
DECLARE t text; h text;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS table_hashes (name text, hash text);
  TRUNCATE table_hashes;
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename LOOP
    -- Without updated_at: a plant that was changed and put back is the same plant.
    EXECUTE format('SELECT md5(coalesce(string_agg(md5((to_jsonb(x) - ''updated_at'')::text), '''' ORDER BY md5((to_jsonb(x) - ''updated_at'')::text)), '''')) FROM %I x', t) INTO h;
    INSERT INTO table_hashes VALUES (t, h);
  END LOOP;
END $$;
SELECT name || ' ' || hash FROM table_hashes ORDER BY name;
SQL
}
plant() { sql "SELECT $2 FROM factories WHERE name = '$1'"; }
origin() { sql "SELECT source || ' ' || rank || ' ' || coalesce(as_of::text, '-') FROM fact_sources s JOIN factories f ON f.id = s.factory_id WHERE f.name = '$1' AND s.fact = '$2'"; }

# --- The rule for which value wins --------------------------------------------
# intake_fact_wins(fill, rank, as of, plant's is empty, who set it, their rank, their day)
wins() { sql "SELECT intake_fact_wins($1)"; }
expect "an empty fact is filled"                 t "$(wins "'empty', 40, '2026-01-01', true, NULL, NULL, NULL")"
expect "a filling source leaves a value alone"   f "$(wins "'empty', 40, '2026-01-01', false, NULL, 10, NULL")"
expect "a higher rank replaces a lower"          t "$(wins "'ranked', 60, '2020-01-01', false, 'old', 40, '2026-01-01'")"
expect "a lower rank does not replace a higher"  f "$(wins "'ranked', 40, '2026-01-01', false, 'curated', 80, '2020-01-01'")"
expect "the same rank: the newer value wins"     t "$(wins "'ranked', 60, '2025-12-31', false, 'osha', 60, '2024-12-31'")"
expect "the same rank: an older value does not"  f "$(wins "'ranked', 60, '2023-12-31', false, 'osha', 60, '2024-12-31'")"
expect "the same rank and day changes nothing"   f "$(wins "'ranked', 60, '2024-12-31', false, 'osha', 60, '2024-12-31'")"
expect "an admin's value is never replaced"      f "$(wins "'ranked', 99, '2026-01-01', false, 'admin', 100, NULL")"
expect "nor is what an admin emptied"            f "$(wins "'ranked', 99, '2026-01-01', true, 'admin', 100, NULL")"

# --- A source's id names one record -------------------------------------------
fixture
MAIN=$(plant 'E2E INTAKE ACME MAIN PLANT' id)
FOUNDRY=$(plant 'E2E INTAKE ACME FOUNDRY' id)
OUT=$(psql "$DB" -qtAc "INSERT INTO external_references (entity_type, entity_id, source, external_id) VALUES ('factories', '$FOUNDRY', 'E2E_INTAKE', 'E2E-1')" 2>&1)
case "$OUT" in *external_refs_identity_key*) echo "ok    one id cannot name two plants";; *) echo "FAIL  one id cannot name two plants: $OUT"; fail=1;; esac
sql "INSERT INTO external_references (entity_type, entity_id, source, external_id) VALUES ('factories', '$MAIN', 'E2E_INTAKE', 'E2E-1b')" >/dev/null
expect "a plant can carry two ids of one source" 2 "$(sql "SELECT count(*) FROM external_references WHERE source = 'E2E_INTAKE' AND entity_id = '$MAIN'")"
sql "DELETE FROM external_references WHERE source = 'E2E_INTAKE' AND external_id = 'E2E-1b'" >/dev/null
expect "a lookup by source and id has its index" 't' "$(sql "SELECT indexdef LIKE 'CREATE UNIQUE INDEX external_refs_identity_key ON public.external_references USING btree (source, entity_type, external_id) WHERE %' FROM pg_indexes WHERE indexname = 'external_refs_identity_key'")"
expect "and is read through an index"       0 "$(psql "$DB" -qtAc "EXPLAIN SELECT entity_id FROM external_references WHERE source = 'E2E_INTAKE' AND entity_type = 'factories' AND external_id = 'E2E-1' AND NOT duplicate" | grep -c 'Seq Scan')"

# --- A rehearsal leaves nothing ------------------------------------------------
hashes > "$D/before.txt"
OUT=$(ingest rehearse e2e-intake "$D/one.jsonl")
case "$OUT" in *"a rehearsal: nothing was kept"*"resolved: 2 by id, 1 by rule, 2 queued for review, 1 held, 3 to add"*) echo "ok    a rehearsal reports what it would do";; *) echo "FAIL  rehearsal report: $OUT"; fail=1;; esac
hashes > "$D/rehearsed.txt"
expect "a rehearsal leaves every table as it was" '' "$(diff "$D/before.txt" "$D/rehearsed.txt")"

# --- Stage, resolve, apply -----------------------------------------------------
OUT=$(ingest stage e2e-intake "$D/one.jsonl")
R1=$(last_run)
expect "staging makes a run"                'staged 9' "$(sql "SELECT state || ' ' || (counts->>'staged') FROM intake_runs WHERE id = $R1")"
expect "the run records its file"           't t' "$(sql "SELECT (input = 'one.jsonl') || ' ' || (length(input_sha256) = 64) FROM intake_runs WHERE id = $R1" | sed 's/true/t/g')"
expect "staging keeps what the source said" 'E2E Intake Acme Main Plant' "$(sql "SELECT payload->>'name' FROM intake_records WHERE source = 'e2e-intake' AND source_id = 'E2E-1'")"
expect "staging touches no plant"           '' "$(plant 'E2E INTAKE ACME MAIN PLANT' "coalesce(address, '')")"
OUT=$(ingest resolve "$R1")
expect "by id, by rule, queued, to add, held" '2 1 2 3 1' "$(sql "SELECT concat_ws(' ', counts->>'byId', counts->>'byRule', counts->>'queued', counts->>'toAdd', counts->>'held') FROM intake_runs WHERE id = $R1")"
expect "an id match is the plant that carries the id" "$MAIN id" "$(sql "SELECT entity_id || ' ' || resolution FROM intake_links WHERE source_id = 'E2E-1' AND source = 'e2e-intake'")"
expect "a company's other name finds its plant" "$FOUNDRY matched" "$(sql "SELECT entity_id || ' ' || resolution FROM intake_links WHERE source_id = 'E2E-2' AND source = 'e2e-intake'")"
expect "the match says how it was made"     t "$(sql "SELECT detail LIKE 'same name: \"E2E INTAKE ACME FOUNDRY\" at % m' FROM load_log WHERE run_id = $R1 AND source_id = 'E2E-2' AND action = 'matched'")"
expect "a plant filed under a stranger is queued" 'the factory is filed under another company' "$(sql "SELECT reason FROM intake_review WHERE source = 'e2e-intake' AND source_id = 'E2E-3'")"
expect "two plants that fit equally are queued" '2 factories fit equally|2' "$(sql "SELECT reason || '|' || jsonb_array_length(candidates) FROM intake_review WHERE source = 'e2e-intake' AND source_id = 'E2E-9'")"
expect "a record with no place is held"     held "$(sql "SELECT resolution FROM intake_links WHERE source_id = 'E2E-7' AND source = 'e2e-intake'")"
expect "resolving touches no plant"         '' "$(plant 'E2E INTAKE ACME MAIN PLANT' "coalesce(address, '')")"
OUT=$(ingest apply "$R1")
expect "the run is applied"                 applied "$(sql "SELECT state FROM intake_runs WHERE id = $R1")"
expect "empty facts are filled"             '1 Main St|89801|332710|Fabricated Metal Product Manufacturing|120|2024' "$(plant 'E2E INTAKE ACME MAIN PLANT' "concat_ws('|', address, zip_code, primary_naics, primary_naics_description, workforce_size, workforce_year)")"
expect "a fact knows where it came from"    'e2e-intake 60 2026-01-15' "$(origin 'E2E INTAKE ACME MAIN PLANT' industry)"
expect "a headcount is as of its year"      'e2e-intake 70 2024-12-31' "$(origin 'E2E INTAKE ACME MAIN PLANT' headcount)"
expect "and which record said so"           "$R1 E2E-1" "$(sql "SELECT run_id || ' ' || source_id FROM fact_sources WHERE factory_id = '$MAIN' AND fact = 'zip'")"
expect "a ranked source replaces older values" '2 Foundry Rd|331511' "$(plant 'E2E INTAKE ACME FOUNDRY' "address || '|' || primary_naics")"
expect "a match by rule writes the id"      "$FOUNDRY" "$(sql "SELECT entity_id FROM external_references WHERE source = 'E2E_INTAKE' AND external_id = 'E2E-2'")"
expect "an admin's address stands"          '4 Admin Way' "$(plant 'E2E INTAKE ACME PLANT 4' address)"
expect "a newer headcount replaces an older" '80 2024' "$(plant 'E2E INTAKE ACME PLANT 4' "workforce_size || ' ' || workforce_year")"
expect "a record nobody fits is added"      'E2E Intake Acme|333120|added' "$(sql "SELECT c.name || '|' || f.primary_naics || '|' || r.resolution FROM factories f JOIN companies c ON c.id = f.company_id JOIN intake_links r ON r.entity_id = f.id WHERE f.name = 'E2E Intake Acme New Site'")"
expect "with its company when that is new"  1 "$(sql "SELECT count(*) FROM factories f JOIN companies c ON c.id = f.company_id WHERE c.name = 'E2E Intake Newco' AND f.name = 'E2E Intake Newco Works'")"
expect "construction materials are not added" 'held|not added: construction materials are not covered' "$(sql "SELECT r.resolution || '|' || l.detail FROM intake_links r JOIN load_log l ON l.source_id = r.source_id AND l.run_id = $R1 AND l.action = 'held' WHERE r.source = 'e2e-intake' AND r.source_id = 'E2E-8' ORDER BY l.id DESC LIMIT 1")"
expect "no plant is deleted by a run"       6 "$(sql "SELECT count(*) FROM factories WHERE name LIKE 'E2E INTAKE ACME %'")"
expect "every change is journalled"         t "$(sql "SELECT count(*) >= 12 FROM intake_changes WHERE run_id = $R1")"
expect "the run counts what it did"         '2 2' "$(sql "SELECT concat_ws(' ', counts->>'added', counts->>'queued') FROM intake_runs WHERE id = $R1")"

# --- The same file again; then a later file -------------------------------------
OUT=$(ingest load e2e-intake "$D/one.jsonl")
R2=$(last_run)
expect "the same file again: nothing is new" '0 0 9 0' "$(sql "SELECT concat_ws(' ', counts->>'new', counts->>'changed', counts->>'same', counts->>'gone') FROM intake_runs WHERE id = $R2")"
expect "and nothing changes"                0 "$(sql "SELECT count(*) FROM intake_changes WHERE run_id = $R2")"
OUT=$(ingest load e2e-intake "$D/two.jsonl")
R3=$(last_run)
expect "a later file: changed and gone"     '0 1 7 1' "$(sql "SELECT concat_ws(' ', counts->>'new', counts->>'changed', counts->>'same', counts->>'gone') FROM intake_runs WHERE id = $R3")"
expect "the change says what changed"       'people, peopleYear' "$(sql "SELECT (SELECT string_agg(k, ', ' ORDER BY k) FROM jsonb_object_keys(evidence) k) FROM load_log WHERE run_id = $R3 AND action = 'changed'")"
expect "a newer value of the same source wins" '135 2025' "$(plant 'E2E INTAKE ACME MAIN PLANT' "workforce_size || ' ' || workforce_year")"
expect "a record gone from the source keeps its plant" "1 $R3" "$(sql "SELECT (SELECT count(*) FROM factories WHERE name = 'E2E Intake Acme New Site') || ' ' || gone_run_id FROM intake_records WHERE source = 'e2e-intake' AND source_id = 'E2E-5'")"

# --- Undo, newest first, and the database is as it was --------------------------
OUT=$(ingest undo "$R1")
case "$OUT" in *"Undo run $R3 first"*) echo "ok    an earlier run is not undone before a later one";; *) echo "FAIL  undo order: $OUT"; fail=1;; esac
OUT=$(ingest forget e2e-intake)
case "$OUT" in *"is applied. Undo it first"*) echo "ok    an applied source is not forgotten";; *) echo "FAIL  forget while applied: $OUT"; fail=1;; esac
ingest undo "$R3" >/dev/null
expect "undoing the later run restores the earlier value" '120 2024' "$(plant 'E2E INTAKE ACME MAIN PLANT' "workforce_size || ' ' || workforce_year")"
ingest undo "$R2" >/dev/null
ingest undo "$R1" >/dev/null
expect "what the run added is removed"      0 "$(sql "SELECT count(*) FROM factories WHERE name IN ('E2E Intake Acme New Site', 'E2E Intake Newco Works')")"
expect "and the company it added"           0 "$(sql "SELECT count(*) FROM companies WHERE name = 'E2E Intake Newco'")"
expect "the ids it wrote are taken back"    'E2E-1 E2E-4' "$(sql "SELECT string_agg(external_id, ' ' ORDER BY external_id) FROM external_references WHERE source = 'E2E_INTAKE'")"
expect "what it queued is withdrawn"        'withdrawn withdrawn' "$(sql "SELECT string_agg(status, ' ') FROM intake_review WHERE source = 'e2e-intake'")"
expect "the runs are kept, undone"          'undone undone undone' "$(sql "SELECT string_agg(state, ' ' ORDER BY id) FROM intake_runs WHERE source = 'e2e-intake'")"
ingest forget e2e-intake >/dev/null
hashes > "$D/after.txt"
expect "after undo and forget every table is exactly as it was" '' "$(diff "$D/before.txt" "$D/after.txt")"

# --- Admin Tools: the sources view and the review queue --------------------------
check "sign-up admin"                       201 "$(req a POST /auth/sign-up "{\"email\":\"admin-$RUN@intake.test\",\"name\":\"Ida Intake\",$PW}")"
check "sign-up person"                      201 "$(req p POST /auth/sign-up "{\"email\":\"person-$RUN@intake.test\",\"name\":\"Pat Person\",$PW}")"
DATABASE_URL="$DB" node "$ROOT/scripts/make-admin.mjs" "admin-$RUN@intake.test" >/dev/null 2>&1
for path in /admin/intake/sources /admin/intake/review; do
  check "401 GET $path"                     401 "$(req anon GET "$path")"
  check "403 GET $path"                     403 "$(req p GET "$path")"
done
check "401 deciding a match"                401 "$(req anon POST /admin/intake/review/1 '{"decision":"skip"}')"
check "403 deciding a match"                403 "$(req p POST /admin/intake/review/1 '{"decision":"skip"}')"
WAITING0=$(req a GET /admin/overview | j waitingMatches)

ingest load e2e-intake "$D/one.jsonl" >/dev/null
R4=$(last_run)
FOUNDRY=$(plant 'E2E INTAKE ACME FOUNDRY' id)
TWIN2=$(plant 'E2E INTAKE ACME TWIN LLC' id)
WAREHOUSE=$(plant 'E2E INTAKE ACME WAREHOUSE' id)
OUT=$(req a GET /admin/intake/sources)
check "the sources view"                    200 "$OUT" '"slug":"e2e-intake"'
expect "a source's latest run: matched, added, changed, queued" "$R4 applied 3 2 3 2" "$(printf '%s' "$OUT" | j "sources.find((s) => s.slug === 'e2e-intake').runs.slice(0, 1).map((r) => [r.id, r.state, r.matched, r.added, r.changed, r.queued].join(' '))[0]")"
expect "and what waits on it"               '9 2' "$(printf '%s' "$OUT" | j "sources.filter((s) => s.slug === 'e2e-intake').map((s) => s.staged + ' ' + s.waiting)[0]")"
expect "the overview counts matches waiting" 2 "$(( $(req a GET /admin/overview | j waitingMatches) - WAITING0 ))"
OUT=$(req a GET '/admin/intake/review?limit=50')
check "the queue"                           200 "$OUT" '"reason":"the factory is filed under another company"'
# A reason stored by a run before the screen said factory is restated when it is read; what is stored stays.
sql "UPDATE intake_review SET reason = '2 plants fit equally; the plant is filed under another company' WHERE source = 'e2e-intake' AND source_id = 'E2E-3'" >/dev/null
expect "an earlier run's reason is read in the screen's words" '2 factories fit equally; the factory is filed under another company' "$(req a GET '/admin/intake/review?limit=50' | j "items.find((i) => i.sourceId === 'E2E-3').reason")"
sql "UPDATE intake_review SET reason = 'the factory is filed under another company' WHERE source = 'e2e-intake' AND source_id = 'E2E-3'" >/dev/null
Q3=$(printf '%s' "$OUT" | j "items.find((i) => i.sourceId === 'E2E-3').id")
Q9=$(printf '%s' "$OUT" | j "items.find((i) => i.sourceId === 'E2E-9').id")
expect "a match sets the two records side by side" 'E2E Intake Acme Street Depot|3 Depot St|E2E INTAKE ACME WAREHOUSE|E2E Intake Stranger|near|100' "$(printf '%s' "$OUT" | j "items.filter((i) => i.id === $Q3).map((i) => [i.record.name, i.record.address, i.candidates[0].name, i.candidates[0].company, i.candidates[0].rule, i.candidates[0].metres].join('|'))[0]")"
expect "and says what Different would do"   add "$(printf '%s' "$OUT" | j "items.find((i) => i.id === $Q3).ifDifferent")"
expect "the first match waiting comes first" "$Q3" "$(printf '%s' "$OUT" | j "items.filter((i) => i.source === 'e2e-intake')[0].id")"

check "a decision that is not one"          400 "$(req a POST /admin/intake/review/$Q9 '{"decision":"maybe"}')" 'same, different or skip'
check "Same needs a plant"                  400 "$(req a POST /admin/intake/review/$Q9 '{"decision":"same"}')" 'Choose one of the factories shown'
check "Same with a plant that was not proposed" 400 "$(req a POST /admin/intake/review/$Q9 "{\"decision\":\"same\",\"plantId\":\"$FOUNDRY\"}")" 'Choose one of the factories shown'
check "a match that does not exist"         404 "$(req a POST /admin/intake/review/999999999 '{"decision":"skip"}')"
check "a match id that is not a number"     404 "$(req a POST /admin/intake/review/abc '{"decision":"skip"}')"

check "skip"                                200 "$(req a POST /admin/intake/review/$Q3 '{"decision":"skip"}')" '"status":"waiting"'
expect "a skipped match goes to the end"    "$Q9 $Q3" "$(req a GET '/admin/intake/review?limit=50' | j "items.filter((i) => i.source === 'e2e-intake').map((i) => i.id).join(' ')")"
expect "and still counts as waiting"        2 "$(( $(req a GET /admin/overview | j waitingMatches) - WAITING0 ))"

OUT=$(req a POST /admin/intake/review/$Q9 "{\"decision\":\"same\",\"plantId\":\"$TWIN2\"}")
check "same"                                200 "$OUT" '"status":"same"'
expect "Same writes the record's facts"     'city coordinates zip' "$(printf '%s' "$OUT" | j "filled.sort().join(' ')")"
expect "Same writes the id to the crosswalk" "$TWIN2" "$(sql "SELECT entity_id FROM external_references WHERE source = 'E2E_INTAKE' AND external_id = 'E2E-9' AND NOT duplicate")"
expect "Same applies the record's facts"    89815 "$(plant 'E2E INTAKE ACME TWIN LLC' zip_code)"
expect "the fact is the source's, set by the admin" 'e2e-intake t' "$(sql "SELECT source || ' ' || (set_by IS NOT NULL) FROM fact_sources WHERE factory_id = '$TWIN2' AND fact = 'zip'" | sed 's/true/t/')"
check "a match is decided once"             409 "$(req a POST /admin/intake/review/$Q9 "{\"decision\":\"same\",\"plantId\":\"$TWIN2\"}")" 'already been decided'
expect "one fewer waits"                    1 "$(( $(req a GET /admin/overview | j waitingMatches) - WAITING0 ))"

OUT=$(req a POST /admin/intake/review/$Q3 '{"decision":"different"}')
check "different"                           200 "$OUT" '"added":true'
expect "Different adds the record as its own plant" 'E2E Intake Acme|3 Depot St' "$(sql "SELECT c.name || '|' || f.address FROM factories f JOIN companies c ON c.id = f.company_id WHERE f.name = 'E2E Intake Acme Street Depot'")"
expect "and the plant it is not is remembered" "$WAREHOUSE" "$(sql "SELECT array_to_string(not_ids, ' ') FROM intake_links WHERE source = 'e2e-intake' AND source_id = 'E2E-3'")"
expect "the stranger's plant is left alone"  'E2E Intake Stranger' "$(sql "SELECT c.name FROM factories f JOIN companies c ON c.id = f.company_id WHERE f.id = '$WAREHOUSE'")"
expect "nothing waits"                      0 "$(( $(req a GET /admin/overview | j waitingMatches) - WAITING0 ))"
expect "every decision is on record"        'added from a source, match skipped, matched to a source' "$(req a GET '/admin/audit?kind=factory&limit=50' | j "entries.filter((e) => e.detail && e.detail.source === 'e2e-intake').map((e) => e.action).sort().join(', ')")"

# --- What an admin types is the admin's; a merge is remembered --------------------
check "an admin corrects a plant"           200 "$(req a PUT /factories/$FOUNDRY '{"address":"9 Typed By Hand"}')"
expect "the fact becomes the admin's"       'admin 100 -' "$(origin 'E2E INTAKE ACME FOUNDRY' address)"
DATABASE_URL="$DB" node "$ROOT/scripts/ingest/run.mjs" apply "$R4" --all --adapter "$ADAPTER" >/dev/null 2>&1
expect "no later load replaces it"          '9 Typed By Hand' "$(plant 'E2E INTAKE ACME FOUNDRY' address)"
OLD=$(sql "SELECT id FROM companies WHERE name = 'E2E Intake Old Name'")
ACME=$(sql "SELECT id FROM companies WHERE name = 'E2E Intake Acme'")
check "merge one company into another"      200 "$(req a POST /admin/records/company/$OLD/merge "{\"into\":\"$ACME\"}")"
expect "the merge is in the history"        "$ACME admin E2E Intake Old Name" "$(sql "SELECT into_id || ' ' || via || ' ' || from_name FROM record_merges WHERE kind = 'company' AND from_id = '$OLD'")"
expect "an id that pointed at the merged record still resolves" "$ACME" "$(sql "SELECT record_now('company', '$OLD')")"
expect "a record that was never merged is itself" "$ACME" "$(sql "SELECT record_now('company', '$ACME')")"

# --- The runner's own refusals ---------------------------------------------------
OUT=$(DATABASE_URL='postgresql://u:p@db.example.com/x' node "$ROOT/scripts/ingest/run.mjs" list 2>&1)
case "$OUT" in *'Refusing: the database is on "db.example.com"'*) echo "ok    a database that is not local is refused";; *) echo "FAIL  remote refusal: $OUT"; fail=1;; esac
OUT=$(DATABASE_URL='postgresql://u:p@db.example.com/x' node "$ROOT/scripts/ingest/run.mjs" list --yes-this-database other.example.com 2>&1)
case "$OUT" in *'names "other.example.com"'*) echo "ok    naming another host does not open it";; *) echo "FAIL  wrong host named: $OUT"; fail=1;; esac

# A value changed after a run is kept when the run is undone.
OUT=$(ingest undo "$R4")
case "$OUT" in *"1 left because they changed since"*) echo "ok    undo leaves what changed since the run";; *) echo "FAIL  undo with a later change: $OUT"; fail=1;; esac
expect "the admin's correction is kept"     '9 Typed By Hand' "$(plant 'E2E INTAKE ACME FOUNDRY' address)"
expect "the rest is put back"               '|' "$(plant 'E2E INTAKE ACME MAIN PLANT' "coalesce(address, '') || '|' || coalesce(primary_naics, '')")"
cleanup
expect "nothing of this run is left behind" '0 0 0 0 0 0' "$(sql "SELECT concat_ws(' ', (SELECT count(*) FROM users WHERE email LIKE '%@intake.test'), (SELECT count(*) FROM companies WHERE name LIKE 'E2E Intake %'), (SELECT count(*) FROM factories WHERE name ILIKE 'E2E INTAKE %'), (SELECT count(*) FROM intake_sources WHERE slug = 'e2e-intake'), (SELECT count(*) FROM external_references WHERE source = 'E2E_INTAKE'), (SELECT count(*) FROM audit_log WHERE record_name ILIKE 'E2E Intake %'))")"
finish
