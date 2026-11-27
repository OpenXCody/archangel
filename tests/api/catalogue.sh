#!/usr/bin/env bash
# End-to-end check of the careers catalogue's migration (scripts/build-careers-sql.mjs):
# a catalogue in, careers folded, renamed, created and removed out. It needs
# no server, only a database with the schema (migrations 0046, 0053 and 0054
# applied, so the ladder's table, a company's versions and the postings
# pipeline's tables are there). Prints one line per check and exits non-zero
# if any fail.
#
# LOCAL ONLY, and it leaves nothing behind: it generates a migration from a
# small catalogue of careers named "E2E Cat ...", lays out rows as production
# might hold them (goals, a job with an application, other names, industry
# links, links made by hand, a title in another letter case, a title that is
# missing, a removed career whose jobs came from a company's careers site with
# what the postings pipeline keeps of them, one a company has its own version
# of), applies the migration twice and reads what it did, all inside one
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
], "removed": [ { "why": "Not careers.", "titles": ["E2E Cat Removed Plain", "E2E Cat Removed Applied", "E2E Cat Removed Goal", "E2E Cat Removed Missing", "E2E Cat Removed Sourced", "E2E Cat Removed Versioned"] } ] }
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
  UNION ALL SELECT 'j' || j.id || j.occupation_id FROM jobs j WHERE j.title LIKE 'E2E Cat %'
  UNION ALL SELECT 'r' || r.source_id || COALESCE(r.gone_run_id::text, '') FROM intake_records r WHERE r.source = 'postings-e2e-cat'
  UNION ALL SELECT 'p' || p.place_key || p.status FROM posting_places p WHERE p.source = 'postings-e2e-cat'
  UNION ALL SELECT 'x' || x.external_id || x.entity_id FROM external_references x WHERE x.source = 'POSTINGS_E2E_CAT') q;
SELECT :'at' || ' careers', string_agg(o.title || ' ' || (SELECT COUNT(*) FROM occupation_skills s WHERE s.occupation_id = o.id) || ' ' || COALESCE(o.path_status, 'none') || ' ' || COALESCE(o.home_domain, 'none'), '; ' ORDER BY o.title COLLATE "C")
  FROM occupations o WHERE o.title ILIKE 'e2e cat %';
SELECT :'at' || ' folded lines', COUNT(*) FROM load_log WHERE load = 'careers-catalogue' AND run_at = now() AND action = 'folded' AND detail LIKE '%E2E Cat%';
SELECT :'at' || ' removed lines', COUNT(*) FROM load_log WHERE load = 'careers-catalogue' AND run_at = now() AND action IN ('removed', 'jobs removed', 'postings unstaged') AND detail LIKE '%E2E Cat%';
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
  ('E2E Cat Removed Sourced', NULL, NULL), ('E2E Cat Removed Versioned', NULL, NULL),
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
-- A career to remove that a company has written its own version of.
INSERT INTO company_careers (company_id, occupation_id) SELECT id, pg_temp.career('E2E Cat Removed Versioned') FROM companies WHERE name = 'E2E Cat Company';
-- A career to remove whose only jobs came from a company's careers site, and what the postings pipeline (0043, 0054) keeps
-- of them: two jobs with their outside ids, and the staged postings read as it, one of them already gone from the site.
INSERT INTO intake_sources (slug, name, kind, ref_source, system, company) VALUES ('postings-e2e-cat', 'E2E Cat job postings', 'job', 'POSTINGS_E2E_CAT', 'ashby', 'E2E Cat Company');
INSERT INTO intake_runs (source, state) VALUES ('postings-e2e-cat', 'applied');
INSERT INTO jobs (company_id, factory_id, occupation_id, title, expires_at, source, source_id)
  SELECT c.id, f.id, pg_temp.career('E2E Cat Removed Sourced'), 'E2E Cat sourced job ' || v.id, now() + interval '14 days', 'postings-e2e-cat', v.id
  FROM companies c INNER JOIN factories f ON f.company_id = c.id, (VALUES ('s1'), ('s6')) v(id) WHERE c.name = 'E2E Cat Company';
INSERT INTO external_references (entity_type, entity_id, source, external_id)
  SELECT 'jobs', j.id, 'POSTINGS_E2E_CAT', j.source_id || '@catville|NV' FROM jobs j WHERE j.source = 'postings-e2e-cat';
-- An outside id of a job that stays (its career folds into one of the file's): it is nobody's to delete.
INSERT INTO external_references (entity_type, entity_id, source, external_id)
  SELECT 'jobs', j.id, 'POSTINGS_E2E_CAT', 'kept@catville|NV' FROM jobs j WHERE j.title = 'E2E Cat job for E2E Cat Mill Hand';
CREATE FUNCTION pg_temp.staged(p_id text, p_career text, p_city text, p_gone boolean) RETURNS void LANGUAGE sql AS \$f\$
  INSERT INTO intake_records (source, source_id, first_run_id, changed_run_id, gone_run_id, payload, facts, hash)
    SELECT 'postings-e2e-cat', p_id, r.id, r.id, CASE WHEN p_gone THEN r.id END, '{}'::jsonb,
           jsonb_build_object('title', 'E2E Cat posting', 'reading', jsonb_build_object('career', jsonb_build_object('title', p_career),
             'places', jsonb_build_array(jsonb_build_object('city', p_city, 'state', 'NV')))), 'hash'
    FROM intake_runs r WHERE r.source = 'postings-e2e-cat';
  INSERT INTO intake_links (source, source_id) VALUES ('postings-e2e-cat', p_id) \$f\$;
SELECT pg_temp.staged('s1', 'E2E Cat Removed Sourced', 'Catville', false),   -- a job
       pg_temp.staged('s2', 'e2e cat removed sourced', 'Lonely', false),     -- read as it in another letter case, at a place that waits for it alone
       pg_temp.staged('s3', 'E2E Cat Removed Sourced', 'Shared', true),      -- gone from the site already
       pg_temp.staged('s4', 'E2E Cat Machinist', 'Shared', false),           -- a career that stays, at a place that waits
       pg_temp.staged('s5', 'E2E Cat Removed Missing', 'Nowhere', false),    -- read as a title to remove that is not stored
       pg_temp.staged('s6', 'E2E Cat Removed Sourced', 'Decided', false),    -- at a place a person set aside
       pg_temp.staged('s7', 'E2E Cat Removed Applied', 'Catville', false);   -- a career that is not removed
INSERT INTO posting_places (source, place_key, city, state, status)
  SELECT 'postings-e2e-cat', posting_place_key(v.city, 'NV'), v.city, 'NV', v.status
  FROM (VALUES ('Lonely', 'waiting'), ('Shared', 'waiting'), ('Nowhere', 'waiting'), ('Decided', 'left')) v(city, status);
INSERT INTO posting_passes (source, source_id, listing, read_on, run_id) SELECT 'postings-e2e-cat', 'p1', 'listing', current_date, r.id FROM intake_runs r WHERE r.source = 'postings-e2e-cat';
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
  (pg_temp.career('E2E Cat By Hand Two'), pg_temp.career('E2E Cat Mill Hand'), 1),
  -- Links an earlier catalogue made with titles this one removes, which the database has to keep (a goal, an application).
  (pg_temp.career('E2E Cat Welder'), pg_temp.career('E2E Cat Removed Goal'), 2),
  (pg_temp.career('E2E Cat Removed Applied'), pg_temp.career('E2E Cat Inspector'), 1),
  (pg_temp.career('E2E Cat By Hand'), pg_temp.career('E2E Cat Removed Goal'), 2);

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
SELECT 'sourced', concat_ws(' ', (SELECT COUNT(*) FROM occupations WHERE title = 'E2E Cat Removed Sourced'), (SELECT COUNT(*) FROM jobs WHERE source = 'postings-e2e-cat'));
SELECT 'ids', COALESCE(string_agg(external_id, '; ' ORDER BY external_id), '') FROM external_references WHERE source = 'POSTINGS_E2E_CAT';
SELECT 'staged', concat_ws(' / ', string_agg(source_id, ' ' ORDER BY source_id), (SELECT COUNT(*) FROM intake_links WHERE source = 'postings-e2e-cat')) FROM intake_records WHERE source = 'postings-e2e-cat';
SELECT 'places', string_agg(place_key || ' ' || status, '; ' ORDER BY place_key) FROM posting_places WHERE source = 'postings-e2e-cat';
SELECT 'passes', concat_ws(' ', (SELECT COUNT(*) FROM posting_passes WHERE source = 'postings-e2e-cat'), (SELECT COUNT(*) FROM intake_runs WHERE source = 'postings-e2e-cat'));
SELECT 'versions', COUNT(*) FROM company_careers v WHERE v.occupation_id = pg_temp.career('E2E Cat Removed Versioned');
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
  "E2E Cat By Hand 0 none none; E2E Cat By Hand Two 0 none none; E2E Cat Fabricator 7 draft fabrication; E2E Cat Ghost 0 none quality; E2E Cat Inspector 0 none quality; E2E Cat Machinist 12 draft machining; E2E Cat Painter 0 none materials; E2E Cat Removed Applied 0 none none; E2E Cat Removed Goal 0 none none; E2E Cat Removed Versioned 0 none none; E2E Cat Welder 11 approved fabrication" \
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
# A removed title that had to be kept is taken off the file's ladders (else "E2E Cat Welder" would lead to it beside
# what the file gives it); a link to it from a career the file does not name is not the file's to remove.
expect "links: the file's in order, one by hand moved with its folded title, two that closed a ladder gone, and none between the file's careers and a removed title that was kept" \
  "E2E Cat By Hand > E2E Cat Machinist 1; E2E Cat By Hand > E2E Cat Removed Goal 2; E2E Cat Machinist > E2E Cat Fabricator 1; E2E Cat Machinist > E2E Cat Ghost 2; E2E Cat Welder > E2E Cat Fabricator 1" "$(got links)"

# --- What is left alone, and what is said ---------------------------------------------
expect "a career the file does not name is as it was" "E2E Cat By Hand Left alone. none" "$(got 'by hand')"
expect "the lines to read" \
  "no path: E2E Cat Painter: none of its titles had a skill / not found: \"E2E Cat Gone Title\", to fold into \"E2E Cat Inspector\", is not stored. Kept as another name all the same / no path: E2E Cat Inspector: none of its titles had a skill / created: E2E Cat Ghost: neither its title nor one folded into it is stored. Created, with no path / no path: E2E Cat Ghost: none of its titles had a skill / jobs removed: \"E2E Cat Removed Plain\": 1 job went with it (0 from a company's careers site), with 0 outside ids, 0 postings read as it in staging, and 0 places stopped waiting / not removed: \"E2E Cat Removed Applied\" has a job with applications. Left as it is: close the job, then delete the career by hand / not removed: \"E2E Cat Removed Goal\" is the goal of 1 person. Left as it is, for an admin to delete or merge / not found: \"E2E Cat Removed Missing\", to remove, is not stored / postings unstaged: \"E2E Cat Removed Missing\" is not stored: 1 posting read as it went from staging, and 1 place stopped waiting / jobs removed: \"E2E Cat Removed Sourced\": 2 jobs went with it (2 from a company's careers site: postings-e2e-cat 2), with 2 outside ids, 4 postings read as it in staging, and 1 place stopped waiting / not removed: \"E2E Cat Removed Versioned\" has 1 row in company_careers, which would go with it. Left as it is, for an admin to delete or merge / not in the file: \"E2E Cat By Hand\" is not in the catalogue. Left as it is / not in the file: \"E2E Cat By Hand Two\" is not in the catalogue. Left as it is / link removed: \"E2E Cat Removed Applied\" leads to \"E2E Cat Inspector\": the catalogue removes \"E2E Cat Removed Applied\", which was left as it is / link removed: \"E2E Cat Welder\" leads to \"E2E Cat Removed Goal\": the catalogue removes \"E2E Cat Removed Goal\", which was left as it is / link removed: \"E2E Cat By Hand Two\" leads to \"E2E Cat Machinist\" closed a ladder on itself / link removed: \"E2E Cat Fabricator\" leads to \"E2E Cat By Hand Two\" closed a ladder on itself" \
  "$(got look | sed 's/link removed: "E2E Cat Fabricator" leads to "E2E Cat By Hand Two" closed a ladder on itself \/ link removed: "E2E Cat By Hand Two" leads to "E2E Cat Machinist" closed a ladder on itself/link removed: "E2E Cat By Hand Two" leads to "E2E Cat Machinist" closed a ladder on itself \/ link removed: "E2E Cat Fabricator" leads to "E2E Cat By Hand Two" closed a ladder on itself/')"
# Machinist takes a path, folds two rows and keeps its title; Welder folds one; Fabricator folds one and is the other, renamed; Painter is renamed to its letter case.
expect "the quiet lines: a path taken, rows folded, titles kept and renamed, two removed, the summary" \
  "path folded folded kept folded kept folded renamed renamed kept removed removed summary" "$(got quiet)"
expect "every other stored career is said to be outside this file, and none is touched" "$(got 'stored others')" "$(got others)"

# --- A removed career's jobs, and what the postings pipeline keeps of them --------------
expect "a removed career whose jobs came from a careers site goes, and its jobs with it" "0 0" "$(got sourced)"
expect "the outside ids of its jobs go; a job that stays keeps its own" "kept@catville|NV" "$(got ids)"
expect "the postings staged as it go, gone from the site or not, in any letter case, with their links; so does one staged as a removed title that is not stored; the rest stand" \
  "s4 s7 / 2" "$(got staged)"
expect "a place that waited for those postings alone waits no more; one another posting names, and one a person decided, stay" \
  "decided|NV left; shared|NV waiting" "$(got places)"
expect "the notes of postings read and not kept, and the runs, are not touched" "1 1" "$(got passes)"
expect "a removed career a company has its own version of stays, with the version" "1" "$(got versions)"

# --- A second application changes nothing ------------------------------------------
expect "applied again, the careers are the same" "$(got 'first state')" "$(got 'second state')"
expect "and nothing more is folded" "$(got 'first folded lines')" "$(got 'second folded lines')"
expect "nor removed"                 "$(got 'first removed lines')" "$(got 'second removed lines')"

# --- Nothing is left behind ----------------------------------------------------------
expect "the run was rolled back: no fixture rows" "0 0 0 0" "$(sql "SELECT (SELECT COUNT(*) FROM occupations WHERE title ILIKE 'e2e cat %') || ' ' || (SELECT COUNT(*) FROM users WHERE email LIKE '%@catalogue.test') || ' ' || (SELECT COUNT(*) FROM load_log WHERE detail LIKE '%E2E Cat%') || ' ' || (SELECT COUNT(*) FROM intake_sources WHERE slug = 'postings-e2e-cat')")"
expect "and the stored careers are untouched" "$OTHERS_BEFORE" "$(sql "SELECT md5(COALESCE(string_agg(o.id || o.title || COALESCE(o.description, '') || COALESCE(o.home_domain, '') || (SELECT COUNT(*) FROM occupation_skills s WHERE s.occupation_id = o.id) || (SELECT COUNT(*) FROM occupation_links l WHERE l.from_occupation_id = o.id), '~' ORDER BY o.id), '')) FROM occupations o")"
finish
