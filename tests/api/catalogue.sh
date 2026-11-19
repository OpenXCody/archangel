#!/usr/bin/env bash
# End-to-end check of the careers catalogue's migration (scripts/build-careers-sql.mjs):
# a catalogue in, careers folded, renamed, created and removed out. It needs
# no server, only a database with the schema (migration 0046 applied, so the
# ladder's table is there). Prints one line per check and exits non-zero if
# any fail.
#
# LOCAL ONLY, and it leaves nothing behind: it generates a migration from a
# small catalogue of careers named "E2E Cat ...", lays out rows as production
# might hold them (goals, a job with an application, other names, industry
# links, links made by hand, a title in another letter case, a title that is
# missing), applies the migration twice and reads what it did, all inside one
# transaction that is rolled back.
#   DB=postgresql://... bash tests/api/catalogue.sh
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

cat > "$D/catalogue.json" <<'JSON'
{ "careers": [
  { "title": "E2E Cat Machinist", "home": "machining", "what": "Cuts metal.", "leadsTo": ["E2E Cat Fabricator", "E2E Cat Ghost"],
    "was": ["E2E Cat Mill Hand", "E2E Cat Lathe Hand"], "dropAliases": ["E2E Cat Oddjob"] },
  { "title": "E2E Cat Welder", "home": "fabrication", "what": "Joins metal.", "leadsTo": ["E2E Cat Fabricator"], "was": ["E2E Cat Certified Welder"] },
  { "title": "E2E Cat Fabricator", "home": "fabrication", "what": "Builds weldments.", "leadsTo": [], "was": ["E2E Cat Fab One", "E2E Cat Fab Two"] },
  { "title": "E2E Cat Painter", "home": "materials", "what": "Coats parts.", "leadsTo": [], "was": [] },
  { "title": "E2E Cat Inspector", "home": "quality", "what": "Checks parts.", "leadsTo": [], "was": ["E2E Cat Gone Title"] },
  { "title": "E2E Cat Ghost", "home": "quality", "what": "Stored nowhere.", "leadsTo": [], "was": ["E2E Cat Never Was"] }
], "removed": [ { "why": "Not careers.", "titles": ["E2E Cat Removed Plain", "E2E Cat Removed Applied", "E2E Cat Removed Goal", "E2E Cat Removed Missing"] } ] }
JSON
node "$ROOT/scripts/build-careers-sql.mjs" "$D/catalogue.json" "$ROOT/data/skills/taxonomy.json" "$D/migration.sql" > "$D/build.log" 2>&1
expect "the builder turns a catalogue into a migration" 0 "$?"

# What this run's fixture looks like afterwards, as `name|value` lines. Read twice: after the first application and after the second.
cat > "$D/read.sql" <<'SQL'
SELECT :'at' || ' state', md5(string_agg(x, '~' ORDER BY x)) FROM (
  SELECT 'o' || o.id || o.title || COALESCE(o.description, '') || COALESCE(o.home_domain, '') || COALESCE(o.path_status, '') AS x FROM occupations o WHERE o.title ILIKE 'e2e cat %'
  UNION ALL SELECT 's' || s.occupation_id || s.skill_id FROM occupation_skills s INNER JOIN occupations o ON o.id = s.occupation_id WHERE o.title ILIKE 'e2e cat %'
  UNION ALL SELECT 'a' || a.alias_text || a.canonical_occupation_id FROM occupation_aliases a WHERE a.alias_text ILIKE 'e2e cat %'
  UNION ALL SELECT 'l' || l.from_occupation_id || l.to_occupation_id || l.position FROM occupation_links l INNER JOIN occupations o ON o.id = l.from_occupation_id WHERE o.title ILIKE 'e2e cat %'
  UNION ALL SELECT 'g' || g.user_id || g.occupation_id FROM user_goals g INNER JOIN users u ON u.id = g.user_id WHERE u.email LIKE '%@catalogue.test'
  UNION ALL SELECT 'i' || i.industry || i.occupation_id FROM industry_occupations i INNER JOIN occupations o ON o.id = i.occupation_id WHERE o.title ILIKE 'e2e cat %'
  UNION ALL SELECT 'j' || j.id || j.occupation_id FROM jobs j WHERE j.title LIKE 'E2E Cat %') q;
SELECT :'at' || ' careers', string_agg(o.title || ' ' || (SELECT COUNT(*) FROM occupation_skills s WHERE s.occupation_id = o.id) || ' ' || COALESCE(o.path_status, 'none') || ' ' || COALESCE(o.home_domain, 'none'), '; ' ORDER BY o.title COLLATE "C")
  FROM occupations o WHERE o.title ILIKE 'e2e cat %';
SELECT :'at' || ' folded lines', COUNT(*) FROM load_log WHERE load = 'careers-catalogue' AND run_at = now() AND action = 'folded' AND detail LIKE '%E2E Cat%';
SELECT :'at' || ' removed lines', COUNT(*) FROM load_log WHERE load = 'careers-catalogue' AND run_at = now() AND action = 'removed' AND detail LIKE '%E2E Cat%';
SQL

cat > "$D/run.sql" <<SQL
BEGIN;
INSERT INTO users (email, name, password_hash) VALUES ('ann@catalogue.test', 'Ann', 'x'), ('bo@catalogue.test', 'Bo', 'x');
INSERT INTO occupations (title, description, path_status) VALUES
  ('E2E Cat Machinist', 'Old words.', NULL), ('E2E Cat Mill Hand', 'Mills.', 'draft'), ('E2E Cat Lathe Hand', NULL, NULL),
  ('E2E Cat Welder', 'Welds.', 'approved'), ('E2E Cat Certified Welder', NULL, 'draft'),
  ('E2E Cat Fab One', NULL, NULL), ('E2E Cat Fab Two', NULL, 'draft'),
  ('e2e cat painter', NULL, NULL), ('E2E Cat Inspector', NULL, NULL),
  ('E2E Cat Removed Plain', NULL, NULL), ('E2E Cat Removed Applied', NULL, NULL), ('E2E Cat Removed Goal', NULL, NULL),
  ('E2E Cat By Hand', 'Left alone.', NULL), ('E2E Cat By Hand Two', NULL, NULL);
CREATE FUNCTION pg_temp.career(t text) RETURNS uuid LANGUAGE sql AS \$f\$ SELECT id FROM occupations WHERE title = t \$f\$;
-- A path of n skills, starting at the skill that is off-th by name: two careers given overlapping ranges share skills.
CREATE FUNCTION pg_temp.give(t text, n integer, off integer) RETURNS void LANGUAGE sql AS \$f\$
  INSERT INTO occupation_skills (occupation_id, skill_id) SELECT pg_temp.career(t), id FROM skills ORDER BY name OFFSET off LIMIT n \$f\$;
SELECT pg_temp.give('E2E Cat Machinist', 4, 0), pg_temp.give('E2E Cat Mill Hand', 12, 2), pg_temp.give('E2E Cat Lathe Hand', 6, 20),
       pg_temp.give('E2E Cat Welder', 11, 0), pg_temp.give('E2E Cat Certified Welder', 15, 5),
       pg_temp.give('E2E Cat Fab One', 3, 0), pg_temp.give('E2E Cat Fab Two', 7, 10);
SELECT 'mill hand skills', string_agg(skill_id::text, ',' ORDER BY skill_id) FROM occupation_skills WHERE occupation_id = pg_temp.career('E2E Cat Mill Hand');
SELECT 'ids before', concat_ws(' ', pg_temp.career('E2E Cat Machinist'), pg_temp.career('E2E Cat Fab Two'), pg_temp.career('e2e cat painter'));
-- Ann aims at three titles that become one career, and at one to be removed. Bo at two that fold into different careers.
INSERT INTO user_goals (user_id, occupation_id) SELECT u.id, pg_temp.career(t) FROM (VALUES
  ('ann@catalogue.test', 'E2E Cat Machinist'), ('ann@catalogue.test', 'E2E Cat Mill Hand'), ('ann@catalogue.test', 'E2E Cat Lathe Hand'), ('ann@catalogue.test', 'E2E Cat Removed Goal'),
  ('bo@catalogue.test', 'E2E Cat Lathe Hand'), ('bo@catalogue.test', 'E2E Cat Fab One')) v(email, t) INNER JOIN users u ON u.email = v.email;
INSERT INTO companies (name) VALUES ('E2E Cat Company');
INSERT INTO factories (company_id, name, latitude, longitude, state) SELECT id, 'E2E CAT PLANT', '39.5', '-116.9', 'NV' FROM companies WHERE name = 'E2E Cat Company';
INSERT INTO jobs (company_id, factory_id, occupation_id, title, expires_at)
  SELECT c.id, f.id, pg_temp.career(t), 'E2E Cat job for ' || t, now() + interval '30 days'
  FROM companies c INNER JOIN factories f ON f.company_id = c.id, (VALUES ('E2E Cat Mill Hand'), ('E2E Cat Removed Applied'), ('E2E Cat Removed Plain')) v(t)
  WHERE c.name = 'E2E Cat Company';
INSERT INTO applications (job_id, user_id) SELECT j.id, u.id FROM jobs j, users u
  WHERE j.title IN ('E2E Cat job for E2E Cat Mill Hand', 'E2E Cat job for E2E Cat Removed Applied') AND u.email = 'bo@catalogue.test';
INSERT INTO factory_occupations (factory_id, occupation_id, headcount) SELECT f.id, pg_temp.career('E2E Cat Mill Hand'), 5 FROM factories f WHERE f.name = 'E2E CAT PLANT';
INSERT INTO occupation_aliases (alias_text, canonical_occupation_id) VALUES
  ('e2e cat miller', pg_temp.career('E2E Cat Mill Hand')),
  ('e2e cat oddjob', pg_temp.career('E2E Cat Lathe Hand')),          -- must not follow Lathe Hand to Machinist
  ('E2E CAT FABRICATOR', pg_temp.career('E2E Cat Welder')),          -- becomes a career's own title, in another letter case
  ('E2E Cat Gone Title', pg_temp.career('E2E Cat By Hand'));         -- a folded title that today is another career's other name
INSERT INTO industry_occupations (industry, occupation_id, rank) VALUES
  ('Machinery Manufacturing', pg_temp.career('E2E Cat Lathe Hand'), 900), ('Machinery Manufacturing', pg_temp.career('E2E Cat Machinist'), 901),
  ('Primary Metal Manufacturing', pg_temp.career('E2E Cat Mill Hand'), 902);
-- Links made by hand before a catalogue is applied again: one to a title that folds, and two that will close a ladder with the file's.
INSERT INTO occupation_links (from_occupation_id, to_occupation_id, position) VALUES
  (pg_temp.career('E2E Cat By Hand'), pg_temp.career('E2E Cat Lathe Hand'), 1),
  (pg_temp.career('E2E Cat Fab Two'), pg_temp.career('E2E Cat By Hand Two'), 1),
  (pg_temp.career('E2E Cat By Hand Two'), pg_temp.career('E2E Cat Mill Hand'), 1);

\\i $D/migration.sql
\\set at first
\\i $D/read.sql

SELECT 'machinist', concat_ws(' ', o.id, o.title, o.description, o.home_domain, o.path_status) FROM occupations o WHERE o.title = 'E2E Cat Machinist';
SELECT 'machinist skills', string_agg(skill_id::text, ',' ORDER BY skill_id) FROM occupation_skills WHERE occupation_id = pg_temp.career('E2E Cat Machinist');
SELECT 'ids after', concat_ws(' ', pg_temp.career('E2E Cat Machinist'), pg_temp.career('E2E Cat Fabricator'), pg_temp.career('E2E Cat Painter'));
SELECT 'goals', string_agg(u.name || ':' || o.title, '; ' ORDER BY u.name, o.title) FROM user_goals g INNER JOIN users u ON u.id = g.user_id INNER JOIN occupations o ON o.id = g.occupation_id WHERE u.email LIKE '%@catalogue.test';
SELECT 'jobs', string_agg(j.title || ' > ' || o.title || ' (' || (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id) || ')', '; ' ORDER BY j.title) FROM jobs j INNER JOIN occupations o ON o.id = j.occupation_id WHERE j.title LIKE 'E2E Cat %';
SELECT 'names', string_agg(a.alias_text || ' > ' || o.title, '; ' ORDER BY a.alias_text COLLATE "C") FROM occupation_aliases a INNER JOIN occupations o ON o.id = a.canonical_occupation_id WHERE a.alias_text ILIKE 'e2e cat %';
SELECT 'industries', string_agg(i.industry || ' > ' || o.title, '; ' ORDER BY i.industry) FROM industry_occupations i INNER JOIN occupations o ON o.id = i.occupation_id WHERE o.title ILIKE 'e2e cat %';
SELECT 'plants', string_agg(o.title || ' ' || fo.headcount, '; ') FROM factory_occupations fo INNER JOIN occupations o ON o.id = fo.occupation_id INNER JOIN factories f ON f.id = fo.factory_id WHERE f.name = 'E2E CAT PLANT';
SELECT 'links', string_agg(f.title || ' > ' || t.title || ' ' || l.position, '; ' ORDER BY f.title, l.position) FROM occupation_links l INNER JOIN occupations f ON f.id = l.from_occupation_id INNER JOIN occupations t ON t.id = l.to_occupation_id WHERE f.title ILIKE 'e2e cat %';
SELECT 'by hand', concat_ws(' ', o.title, o.description, COALESCE(o.home_domain, 'none')) FROM occupations o WHERE o.title = 'E2E Cat By Hand';
SELECT 'look', string_agg(action || ': ' || detail, ' / ' ORDER BY id) FROM load_log WHERE load = 'careers-catalogue' AND run_at = now() AND look AND detail LIKE '%E2E Cat%';
SELECT 'quiet', string_agg(action, ' ' ORDER BY id) FROM load_log WHERE load = 'careers-catalogue' AND run_at = now() AND NOT look AND (detail LIKE '%E2E Cat%' OR action = 'summary');
SELECT 'others', COUNT(*) FROM load_log WHERE load = 'careers-catalogue' AND run_at = now() AND action = 'not in the file' AND detail NOT LIKE '%E2E Cat%';
SELECT 'stored others', COUNT(*) FROM occupations WHERE title NOT ILIKE 'e2e cat %';

\\i $D/migration.sql
\\set at second
\\i $D/read.sql
ROLLBACK;
SQL

OTHERS_BEFORE=$(sql "SELECT md5(COALESCE(string_agg(o.id || o.title || COALESCE(o.description, '') || COALESCE(o.home_domain, '') || (SELECT COUNT(*) FROM occupation_skills s WHERE s.occupation_id = o.id) || (SELECT COUNT(*) FROM occupation_links l WHERE l.from_occupation_id = o.id), '~' ORDER BY o.id), '')) FROM occupations o")
psql "$DB" -qAt -v ON_ERROR_STOP=1 -f "$D/run.sql" > "$D/out.txt" 2> "$D/err.txt"
expect "the fixture loads and the migration applies twice" 0 "$?"
grep -v 'NOTICE\|^$' "$D/err.txt" | head -n 5
got() { grep "^$1|" "$D/out.txt" | head -n 1 | cut -d'|' -f2-; }
word() { echo "$1" | cut -d' ' -f"$2"; }

# --- The row that stays, and its one path ------------------------------------------
expect "the row carrying the title stays, with the file's words and home" "$(word "$(got 'ids before')" 1) E2E Cat Machinist Cuts metal. machining draft" "$(got machinist)"
expect "its path is the fullest row's, whole, and not the two joined" "$(got 'mill hand skills')" "$(got 'machinist skills')"
expect "a new title goes to the folded row with the most skills" "$(word "$(got 'ids before')" 2)" "$(word "$(got 'ids after')" 2)"
expect "a title in another letter case is the same career" "$(word "$(got 'ids before')" 3)" "$(word "$(got 'ids after')" 3)"
expect "every career as the file leaves it: skills, path, home" \
  "E2E Cat By Hand 0 none none; E2E Cat By Hand Two 0 none none; E2E Cat Fabricator 7 draft fabrication; E2E Cat Ghost 0 none quality; E2E Cat Inspector 0 none quality; E2E Cat Machinist 12 draft machining; E2E Cat Painter 0 none materials; E2E Cat Removed Applied 0 none none; E2E Cat Removed Goal 0 none none; E2E Cat Welder 11 approved fabrication" \
  "$(got 'first careers')"

# --- What was attached moves; nothing is lost or made twice -------------------------
expect "goals: each person aims once at the career their titles became" "Ann:E2E Cat Machinist; Ann:E2E Cat Removed Goal; Bo:E2E Cat Fabricator; Bo:E2E Cat Machinist" "$(got goals)"
expect "jobs move with their applications; a removed career's unapplied job goes" "E2E Cat job for E2E Cat Mill Hand > E2E Cat Machinist (1); E2E Cat job for E2E Cat Removed Applied > E2E Cat Removed Applied (1)" "$(got jobs)"
expect "other names: folded titles kept, a dropped one gone, one that is now a title gone, one re-pointed" \
  "E2E Cat Certified Welder > E2E Cat Welder; E2E Cat Fab One > E2E Cat Fabricator; E2E Cat Fab Two > E2E Cat Fabricator; E2E Cat Gone Title > E2E Cat Inspector; E2E Cat Lathe Hand > E2E Cat Machinist; E2E Cat Mill Hand > E2E Cat Machinist; E2E Cat Never Was > E2E Cat Ghost; e2e cat miller > E2E Cat Machinist" \
  "$(got names)"
expect "industry links move, once each" "Machinery Manufacturing > E2E Cat Machinist; Primary Metal Manufacturing > E2E Cat Machinist" "$(got industries)"
expect "a career recorded at a plant moves" "E2E Cat Machinist 5" "$(got plants)"

# --- The ladder ---------------------------------------------------------------------
expect "links: the file's in order, one by hand moved with its folded title, two that closed a ladder gone" \
  "E2E Cat By Hand > E2E Cat Machinist 1; E2E Cat Machinist > E2E Cat Fabricator 1; E2E Cat Machinist > E2E Cat Ghost 2; E2E Cat Welder > E2E Cat Fabricator 1" "$(got links)"

# --- What is left alone, and what is said ---------------------------------------------
expect "a career the file does not name is as it was" "E2E Cat By Hand Left alone. none" "$(got 'by hand')"
expect "the lines to read" \
  "no path: E2E Cat Painter: none of its titles had a skill / not found: \"E2E Cat Gone Title\", to fold into \"E2E Cat Inspector\", is not stored. Kept as another name all the same / no path: E2E Cat Inspector: none of its titles had a skill / created: E2E Cat Ghost: neither its title nor one folded into it is stored. Created, with no path / no path: E2E Cat Ghost: none of its titles had a skill / not removed: \"E2E Cat Removed Applied\" has a job with applications. Left as it is: close the job, then delete the career by hand / not removed: \"E2E Cat Removed Goal\" is the goal of 1 person. Left as it is, for an admin to delete or merge / not found: \"E2E Cat Removed Missing\", to remove, is not stored / not in the file: \"E2E Cat By Hand\" is not in the catalogue. Left as it is / not in the file: \"E2E Cat By Hand Two\" is not in the catalogue. Left as it is / link removed: \"E2E Cat By Hand Two\" leads to \"E2E Cat Machinist\" closed a ladder on itself / link removed: \"E2E Cat Fabricator\" leads to \"E2E Cat By Hand Two\" closed a ladder on itself" \
  "$(got look | sed 's/link removed: "E2E Cat Fabricator" leads to "E2E Cat By Hand Two" closed a ladder on itself \/ link removed: "E2E Cat By Hand Two" leads to "E2E Cat Machinist" closed a ladder on itself/link removed: "E2E Cat By Hand Two" leads to "E2E Cat Machinist" closed a ladder on itself \/ link removed: "E2E Cat Fabricator" leads to "E2E Cat By Hand Two" closed a ladder on itself/')"
# Machinist takes a path, folds two rows and keeps its title; Welder folds one; Fabricator folds one and is the other, renamed; Painter is renamed to its letter case.
expect "the quiet lines: a path taken, rows folded, titles kept and renamed, one removed, the summary" \
  "path folded folded kept folded kept folded renamed renamed kept removed summary" "$(got quiet)"
expect "every other stored career is said to be outside this file, and none is touched" "$(got 'stored others')" "$(got others)"

# --- A second application changes nothing ------------------------------------------
expect "applied again, the careers are the same" "$(got 'first state')" "$(got 'second state')"
expect "and nothing more is folded" "$(got 'first folded lines')" "$(got 'second folded lines')"
expect "nor removed"                 "$(got 'first removed lines')" "$(got 'second removed lines')"

# --- Nothing is left behind ----------------------------------------------------------
expect "the run was rolled back: no fixture rows" "0 0 0" "$(sql "SELECT (SELECT COUNT(*) FROM occupations WHERE title ILIKE 'e2e cat %') || ' ' || (SELECT COUNT(*) FROM users WHERE email LIKE '%@catalogue.test') || ' ' || (SELECT COUNT(*) FROM load_log WHERE detail LIKE '%E2E Cat%')")"
expect "and the stored careers are untouched" "$OTHERS_BEFORE" "$(sql "SELECT md5(COALESCE(string_agg(o.id || o.title || COALESCE(o.description, '') || COALESCE(o.home_domain, '') || (SELECT COUNT(*) FROM occupation_skills s WHERE s.occupation_id = o.id) || (SELECT COUNT(*) FROM occupation_links l WHERE l.from_occupation_id = o.id), '~' ORDER BY o.id), '')) FROM occupations o")"
finish
