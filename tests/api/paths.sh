#!/usr/bin/env bash
# End-to-end check of the career paths' migration (scripts/build-career-paths-sql.mjs):
# a paths file in, each career's path made exactly the file's out. It needs no
# server, only a database with the schema (migrations through 0049 applied, so
# the skills have levels and the trigger that sets a path line's stage is
# there). Prints one line per check and exits non-zero if any fail.
#
# LOCAL ONLY, and it leaves nothing behind: it generates a migration from a
# small file of careers and skills named "E2E Path ...", lays out rows as
# production might hold them (a path a person approved, a path nobody wrote, a
# path already as the file has it, a skill renamed since the file was written,
# a skill that is gone, a career that is not stored, a career added by hand),
# applies the migration twice and reads what it did, all inside one
# transaction that is rolled back. The file's builder is also run over the
# real paths file, which must pass its check.
#   DB=postgresql://... bash tests/api/paths.sh
# Needs psql and node on the PATH.
set -u
LIB_NO_API=1
. "$(dirname "$0")/lib.sh"
case "$DB" in *@localhost[:/]*|*@127.0.0.1[:/]*) ;; *) echo "Refusing to run against that database: local only."; exit 2;; esac
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
D=$(mktemp -d)
trap 'rm -rf "$D"' EXIT
# This suite's expect puts each value in brackets: many of its values are lists, or empty.
expect() { # name wanted got
  if [ "$2" = "$3" ]; then echo "ok    $1"; else echo "FAIL  $1: wanted [$2] got [$3]"; fail=1; fi
}

# --- The real file ---------------------------------------------------------------
(cd "$ROOT" && node scripts/build-career-paths-sql.mjs --check) > "$D/check.log" 2>&1
expect "the paths file passes its check" 0 "$?"
expect "and the migration in the repository is what it generates" "" \
  "$(cd "$ROOT" && node scripts/build-career-paths-sql.mjs data/careers/paths.json data/careers/catalogue.json data/skills/catalogue.json data/skills/taxonomy.json "$D/real.sql" > /dev/null 2>&1; cmp -s "$D/real.sql" migrations/0094_career_paths_4.sql || echo stale)"

# --- A small file ------------------------------------------------------------------
# Twelve skills: S01-S04 at Fundamentals, S05-S09 at Intermediate, S10-S12 at Specialization.
cat > "$D/skills.json" <<'JSON'
{ "skills": [ {"name":"E2E Path S01"},{"name":"E2E Path S02"},{"name":"E2E Path S03"},{"name":"E2E Path S04"},{"name":"E2E Path S05"},{"name":"E2E Path S06"},
  {"name":"E2E Path S07"},{"name":"E2E Path S08"},{"name":"E2E Path S09"},{"name":"E2E Path S10"},{"name":"E2E Path S11"},{"name":"E2E Path S12"} ] }
JSON
cat > "$D/taxonomy.json" <<'JSON'
{ "domains": [ { "slug": "e2e", "name": "E2E", "groups": [ { "slug": "e2e-group", "name": "E2E group", "skills": [
  {"name":"E2E Path S01","level":1},{"name":"E2E Path S02","level":1},{"name":"E2E Path S03","level":1},{"name":"E2E Path S04","level":1},
  {"name":"E2E Path S05","level":2},{"name":"E2E Path S06","level":2},{"name":"E2E Path S07","level":2},{"name":"E2E Path S08","level":2},{"name":"E2E Path S09","level":2},
  {"name":"E2E Path S10","level":3},{"name":"E2E Path S11","level":3},{"name":"E2E Path S12","level":3} ] } ] } ] }
JSON
cat > "$D/careers.json" <<'JSON'
{ "careers": [
  { "title": "E2E Path Operator", "home": "e2e", "leadsTo": ["E2E Path Machinist"] },
  { "title": "E2E Path Machinist", "home": "e2e", "leadsTo": [] },
  { "title": "E2E Path Approved", "home": "e2e", "leadsTo": [] },
  { "title": "E2E Path Absent", "home": "e2e", "leadsTo": [] },
  { "title": "E2E Path Changed Names", "home": "e2e", "leadsTo": [] } ] }
JSON
cat > "$D/paths.json" <<'JSON'
{ "weakLinks": [], "careers": [
  { "title": "E2E Path Operator", "basis": "A fixture.", "skills": ["E2E Path S01","E2E Path S02","E2E Path S03","E2E Path S05","E2E Path S06","E2E Path S07","E2E Path S08","E2E Path S09"] },
  { "title": "E2E Path Machinist", "basis": "A fixture.", "skills": ["E2E Path S01","E2E Path S02","E2E Path S03","E2E Path S05","E2E Path S06","E2E Path S07","E2E Path S08","E2E Path S09",
      { "skill": "E2E Path S10", "why": "The specialisation." }] },
  { "title": "E2E Path Approved", "basis": "A fixture.", "skills": ["E2E Path S01","E2E Path S02","E2E Path S05","E2E Path S06","E2E Path S07","E2E Path S08","E2E Path S09","E2E Path S10"] },
  { "title": "E2E Path Absent", "basis": "A fixture.", "skills": ["E2E Path S01","E2E Path S02","E2E Path S05","E2E Path S06","E2E Path S07","E2E Path S08","E2E Path S09","E2E Path S10"] },
  { "title": "E2E Path Changed Names", "basis": "A fixture.", "skills": ["E2E Path S01","E2E Path S02","E2E Path S04","E2E Path S05","E2E Path S06","E2E Path S07","E2E Path S08","E2E Path S12"] } ] }
JSON
node "$ROOT/scripts/build-career-paths-sql.mjs" "$D/paths.json" "$D/careers.json" "$D/skills.json" "$D/taxonomy.json" "$D/migration.sql" > "$D/build.log" 2>&1
expect "the builder turns a paths file into a migration" 0 "$?"

# What this run's fixture looks like, as `name|value` lines. Read after each application.
cat > "$D/read.sql" <<'SQL'
SELECT :'at' || ' state', md5(string_agg(x, '~' ORDER BY x)) FROM (
  SELECT 'o' || o.id || o.title || COALESCE(o.path_status, '') AS x FROM occupations o WHERE o.title LIKE 'E2E Path %'
  UNION ALL SELECT 's' || s.occupation_id || s.skill_id || COALESCE(s.stage::text, '') || COALESCE(s.importance::text, '') FROM occupation_skills s INNER JOIN occupations o ON o.id = s.occupation_id WHERE o.title LIKE 'E2E Path %') q;
SELECT :'at' || ' careers', string_agg(o.title || ' ' || COALESCE(o.path_status, 'none') || ': ' || COALESCE((SELECT string_agg(right(s.name, 3) || '@' || os.stage, ' ' ORDER BY s.name)
    FROM occupation_skills os INNER JOIN skills s ON s.id = os.skill_id WHERE os.occupation_id = o.id), 'no skills'), '; ' ORDER BY o.title COLLATE "C")
  FROM occupations o WHERE o.title LIKE 'E2E Path %';
SELECT :'at' || ' look', string_agg(action || ': ' || detail, ' / ' ORDER BY id) FROM load_log WHERE load = 'career-paths' AND id > :mark AND look AND detail LIKE '%E2E Path%';
SELECT :'at' || ' quiet', string_agg(action || ': ' || detail, ' / ' ORDER BY id) FROM load_log WHERE load = 'career-paths' AND id > :mark AND NOT look;
SELECT :'at' || ' others', COUNT(*) FROM load_log WHERE load = 'career-paths' AND id > :mark AND action = 'not in the file' AND detail NOT LIKE '%E2E Path%';
SQL

cat > "$D/run.sql" <<SQL
BEGIN;
INSERT INTO skills (name, level) SELECT 'E2E Path S' || lpad(n::text, 2, '0'), CASE WHEN n <= 4 THEN 1 WHEN n <= 9 THEN 2 ELSE 3 END FROM generate_series(1, 11) n;
-- A skill renamed since the file was written: the old name is another name for it, in other letters.
UPDATE skills SET name = 'E2E Path S04 Renamed' WHERE name = 'E2E Path S04';
INSERT INTO skill_aliases (alias_text, canonical_skill_id) SELECT 'e2e path s04', id FROM skills WHERE name = 'E2E Path S04 Renamed';
INSERT INTO occupations (title, path_status) VALUES
  ('E2E Path Operator', NULL), ('E2E Path Machinist', 'draft'), ('E2E Path Approved', 'approved'), ('E2E Path Changed Names', NULL), ('E2E Path By Hand', 'draft');
CREATE FUNCTION pg_temp.give(t text, VARIADIC s text[]) RETURNS void LANGUAGE sql AS \$f\$
  INSERT INTO occupation_skills (occupation_id, skill_id) SELECT o.id, k.id FROM occupations o, skills k WHERE o.title = t AND k.name = ANY (SELECT 'E2E Path S' || x FROM unnest(s) x) \$f\$;
SELECT pg_temp.give('E2E Path Operator', '01', '11'),
       pg_temp.give('E2E Path Machinist', '01', '02', '03', '05', '06', '07', '08', '09', '10'),
       pg_temp.give('E2E Path Approved', '01', '11'),
       pg_temp.give('E2E Path By Hand', '03', '09');
SELECT 'approved before', string_agg(skill_id::text || stage || importance, ',' ORDER BY skill_id) FROM occupation_skills os INNER JOIN occupations o ON o.id = os.occupation_id WHERE o.title = 'E2E Path Approved';
SELECT COALESCE(MAX(id), 0) AS mark FROM load_log \\gset

\\i $D/migration.sql
\\set at first
\\i $D/read.sql
SELECT 'approved after', string_agg(skill_id::text || stage || importance, ',' ORDER BY skill_id) FROM occupation_skills os INNER JOIN occupations o ON o.id = os.occupation_id WHERE o.title = 'E2E Path Approved';
SELECT 'stored others', COUNT(*) FROM occupations WHERE title NOT LIKE 'E2E Path %';
SELECT 'levels', COUNT(*) FROM occupation_skills os INNER JOIN skills s ON s.id = os.skill_id WHERE os.stage IS DISTINCT FROM s.level;

SELECT COALESCE(MAX(id), 0) AS mark FROM load_log \\gset
\\i $D/migration.sql
\\set at second
\\i $D/read.sql
ROLLBACK;
SQL

OTHERS="SELECT md5(COALESCE(string_agg(o.id || o.title || COALESCE(o.path_status, '') || (SELECT COALESCE(string_agg(s.skill_id::text || COALESCE(s.stage::text, ''), ',' ORDER BY s.skill_id), '') FROM occupation_skills s WHERE s.occupation_id = o.id), '~' ORDER BY o.id), '')) FROM occupations o"
OTHERS_BEFORE=$(sql "$OTHERS")
psql "$DB" -qAt -v ON_ERROR_STOP=1 -f "$D/run.sql" > "$D/out.txt" 2> "$D/err.txt"
expect "the fixture loads and the migration applies twice" 0 "$?"
grep -v 'NOTICE\|^$' "$D/err.txt" | head -n 5
got() { grep "^$1|" "$D/out.txt" | head -n 1 | cut -d'|' -f2-; }

# --- Each path is exactly the file's -------------------------------------------------
expect "every career as the file leaves it: its state, and each skill at its own level" \
  "E2E Path Approved approved: S01@1 S11@3; E2E Path By Hand draft: S03@1 S09@2; E2E Path Changed Names draft: S01@1 S02@1 med@1 S05@2 S06@2 S07@2 S08@2; E2E Path Machinist draft: S01@1 S02@1 S03@1 S05@2 S06@2 S07@2 S08@2 S09@2 S10@3; E2E Path Operator draft: S01@1 S02@1 S03@1 S05@2 S06@2 S07@2 S08@2 S09@2" \
  "$(got 'first careers')"
expect "a line the file does not have goes, and the missing ones come: said in one line" \
  "written: E2E Path Operator: 8 skills (7 added, 1 taken off, of 2 before); now a draft / written: E2E Path Changed Names: 7 skills, its first path / summary: 5 careers of the file: 2 written, 1 already as the file has them, 1 approved and left, 1 not stored; skill names not found: 1; path lines now stored for the file's careers: 26; careers not in the file: $(( $(got 'stored others') + 1 ))" \
  "$(got 'first quiet')"
expect "no line of any path has a stage other than its skill's level" 0 "$(got levels)"

# --- What is left alone, and what is said ---------------------------------------------
expect "a path a person approved is exactly as it was" "$(got 'approved before')" "$(got 'approved after')"
expect "the lines to read: a name not found, a career not stored, the approved path and what the file would change, a career added by hand" \
  "skill not found: \"E2E Path S12\" is not a stored skill, nor another name for one. Left off 1 path: E2E Path Changed Names / approved, left: E2E Path Approved: a person approved this path, so it is left exactly as it is (2 skills). The file has 8; it would add E2E Path S02, E2E Path S05, E2E Path S06, E2E Path S07, E2E Path S08, E2E Path S09, E2E Path S10; it would take off E2E Path S11 / no career: \"E2E Path Absent\" is not stored under that title. Its path was not written / not in the file: \"E2E Path By Hand\" is not in the file. Its path (2 skills) is left as it is" \
  "$(got 'first look')"
expect "every other stored career is said to be outside this file" "$(got 'stored others')" "$(got 'first others')"

# --- A second application changes nothing ------------------------------------------
expect "applied again, the paths are the same" "$(got 'first state')" "$(got 'second state')"
expect "and nothing is written" \
  "summary: 5 careers of the file: 0 written, 3 already as the file has them, 1 approved and left, 1 not stored; skill names not found: 1; path lines now stored for the file's careers: 26; careers not in the file: $(( $(got 'stored others') + 1 ))" \
  "$(got 'second quiet')"

# --- Nothing is left behind ----------------------------------------------------------
expect "the run was rolled back: no fixture rows" "0 0 0" "$(sql "SELECT (SELECT COUNT(*) FROM occupations WHERE title LIKE 'E2E Path %') || ' ' || (SELECT COUNT(*) FROM skills WHERE name LIKE 'E2E Path %') || ' ' || (SELECT COUNT(*) FROM load_log WHERE detail LIKE '%E2E Path%')")"
expect "and the stored careers and their paths are untouched" "$OTHERS_BEFORE" "$(sql "$OTHERS")"

finish
