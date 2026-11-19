#!/usr/bin/env bash
# End-to-end check of what a career seeker's skills turn into: careers within
# reach (GET /api/me/careers/reach), the next skills on their chosen careers
# (GET /api/me/goals) and the skills suggested to them
# (GET /api/me/skills/suggested); of the jobs list narrowed by place and by
# what was typed (GET /api/jobs?near=&within=&q=) and the open jobs on a map
# overview; and of a person's own account: changing their email
# (POST /api/auth/email) and deleting it (DELETE /api/me). Prints one line per
# check and exits non-zero if any fail.
#
# LOCAL ONLY: it creates and deletes users (emails ending @seeker.test) and,
# so the ranking can be checked exactly, its own careers, skills, company,
# factories and jobs (named "Seeker Test ..."), and a skill domain with two
# groups (slugs starting "seeker-test-"), written straight to the database. All of it is removed on exit, however the script ends. Never point
# it at production.
#   API=http://localhost:3000/api DB=postgresql://... bash tests/api/seeker.sh
# Needs a running dev API, and psql, curl and node on the PATH.
set -u
. "$(dirname "$0")/lib.sh"
D=$(mktemp -d)
# A fresh address per run, so repeat runs do not trip the sign-in throttle.
RUN=$(date +%s)

cleanup() {
  psql "$DB" -qtAc "DELETE FROM users WHERE email LIKE '%@seeker.test';
    DELETE FROM companies WHERE name LIKE 'Seeker Test %';
    DELETE FROM occupations WHERE title LIKE 'Seeker Test %';
    DELETE FROM skills WHERE name LIKE 'Seeker Test %';
    DELETE FROM skill_groups WHERE slug LIKE 'seeker-test-%';
    DELETE FROM skill_domains WHERE slug LIKE 'seeker-test-%'" >/dev/null
  rm -rf "$D"
}
trap cleanup EXIT
psql "$DB" -qtAc "DELETE FROM users WHERE email LIKE '%@seeker.test';
  DELETE FROM companies WHERE name LIKE 'Seeker Test %';
  DELETE FROM occupations WHERE title LIKE 'Seeker Test %';
  DELETE FROM skills WHERE name LIKE 'Seeker Test %';
  DELETE FROM skill_groups WHERE slug LIKE 'seeker-test-%';
  DELETE FROM skill_domains WHERE slug LIKE 'seeker-test-%'" >/dev/null

# --- Careers and skills of our own -------------------------------------------
# Twelve skills, S01..S12, each with one level (in brackets), the same in
# every career, and these careers:
#   A         S01[1] S02[1] S03[2] S04[2] S05[3] S06[3]
#   B         S01[1] S02[1] S07[2] S08[2] S09[3] S10[3]
#   Short     S01[1] S02[1] S03[2] S04[2]              four skills: too short a path
#   Unwritten S01    S02    S03    S04    S05    S06   no path written (path_status is null)
#   Filler 1..8   S01[1] S11[1] S12[2] S08[2] S09[3] S10[3]
# Nobody else holds these skills and they are on no other career, so the list
# for a person who holds only these is exactly known. A domain of our own
# (TD) has two groups: "one" holds S01 and S02, "two" holds S03, S04 and S05.
# The rows are written with stages that are wrong on purpose (every one 3, or
# none): the database makes a path row's stage its skill's level.
P="Seeker Test $RUN"
TD="seeker-test-$RUN"
psql "$DB" -q >/dev/null <<SQL
INSERT INTO skill_domains (slug, name, description, position) VALUES ('$TD', '$P Domain', 'A domain for the seeker suite.', 9001);
INSERT INTO skill_groups (slug, domain_slug, name, description, position) VALUES
  ('$TD-one', '$TD', '$P Group One', 'The first group of the seeker suite.', 9001),
  ('$TD-two', '$TD', '$P Group Two', 'The second group of the seeker suite.', 9002);
INSERT INTO skills (name, level, group_slug, group_position)
SELECT '$P S' || to_char(n, 'FM00'),
       CASE WHEN n IN (1, 2, 11) THEN 1 WHEN n IN (3, 4, 7, 8, 12) THEN 2 ELSE 3 END,
       CASE WHEN n IN (1, 2) THEN '$TD-one' WHEN n IN (3, 4, 5) THEN '$TD-two' END,
       -- Within group two the file's order is S04 before S03: position, not name, decides among equals.
       CASE n WHEN 4 THEN 1 WHEN 3 THEN 2 END
FROM generate_series(1, 12) n;
INSERT INTO occupations (title, path_status) VALUES ('$P A', 'draft'), ('$P B', 'draft'), ('$P Short', 'draft'), ('$P Unwritten', NULL);
INSERT INTO occupations (title, path_status) SELECT '$P Filler ' || n, 'draft' FROM generate_series(1, 8) n;
INSERT INTO occupation_skills (occupation_id, skill_id, stage)
SELECT o.id, s.id, p.stage
FROM (VALUES
  ('A', 1, 3), ('A', 2, 3), ('A', 3, 3), ('A', 4, 3), ('A', 5, 3), ('A', 6, 3),
  ('B', 1, 3), ('B', 2, 3), ('B', 7, 3), ('B', 8, 3), ('B', 9, 3), ('B', 10, 3),
  ('Short', 1, 3), ('Short', 2, 3), ('Short', 3, 3), ('Short', 4, 3),
  ('Unwritten', 1, NULL), ('Unwritten', 2, NULL), ('Unwritten', 3, NULL), ('Unwritten', 4, NULL), ('Unwritten', 5, NULL), ('Unwritten', 6, NULL)
) AS p(career, n, stage)
JOIN occupations o ON o.title = '$P ' || p.career
JOIN skills s ON s.name = '$P S' || to_char(p.n, 'FM00');
INSERT INTO occupation_skills (occupation_id, skill_id)
SELECT o.id, s.id
FROM occupations o
CROSS JOIN (VALUES (1), (11), (12), (8), (9), (10)) AS p(n)
JOIN skills s ON s.name = '$P S' || to_char(p.n, 'FM00')
WHERE o.title LIKE '$P Filler %';
SQL
skill() { sql "SELECT id FROM skills WHERE name='$P S$1'"; }
career() { sql "SELECT id FROM occupations WHERE title='$P $1'"; }
for n in 01 02 03 04 05 06 07 08 09 10 11 12; do eval "S$n=$(skill $n)"; done
A=$(career A); B=$(career B); SHORT=$(career Short); UNWRITTEN=$(career Unwritten)
expect "fixtures: twelve skills"     12 "$(sql "SELECT COUNT(*) FROM skills WHERE name LIKE '$P S%'")"
expect "fixtures: twelve careers"    12 "$(sql "SELECT COUNT(*) FROM occupations WHERE title LIKE '$P %'")"
expect "fixtures: every path row's stage is its skill's level, whatever was written" "70 0" "$(sql "SELECT COUNT(*) || ' ' || COUNT(*) FILTER (WHERE os.stage IS DISTINCT FROM s.level) FROM occupation_skills os JOIN skills s ON s.id=os.skill_id WHERE s.name LIKE '$P S%'")"

# What the list holds, as short strings to compare.
titles() { j "careers.map(c=>c.title.replace('$P ','')).join('|')"; }        # career order
figures() { j "careers.map(c=>c.held+'/'+c.total).join(' ')"; }              # held/total, in order
nextOf() { j "careers.find(c=>c.id==='$1').next.map(n=>n.name.replace('$P ','')+':'+n.level).join(' ')"; }

# --- Signed out, and with nothing held ---------------------------------------
check "reach requires sign-in"        401 "$(req anon GET /me/careers/reach)"
check "sign-up seeker"                201 "$(req s POST /auth/sign-up '{"email":"reach-'"$RUN"'@seeker.test","name":"Rae Reach","password":"correct horse"}')"
check "sign-up second seeker"         201 "$(req o POST /auth/sign-up '{"email":"other-'"$RUN"'@seeker.test","name":"Otis Other","password":"correct horse"}')"
check "no skills, no careers"         200 "$(req s GET /me/careers/reach)" '"careers":\[\]'
check "learning S03"                  200 "$(req s PUT /me/skills/$S03 '{"status":"learning"}')"
check "learning alone is not reach"   200 "$(req s GET /me/careers/reach)" '"careers":\[\]'
check "remove S03"                    200 "$(req s DELETE /me/skills/$S03)"

# --- One and two skills held --------------------------------------------------
check "hold S01"                      200 "$(req s PUT /me/skills/$S01 '{"status":"held"}')"
check "hold S02"                      200 "$(req s PUT /me/skills/$S02 '{"status":"held"}')"
OUT=$(req s GET /me/careers/reach)
check "reach lists careers"           200 "$OUT" "\"id\":\"$A\""
expect "at most eight"                8 "$(printf '%s' "$OUT" | j careers.length)"
expect "ranked by share, then title"  "A|B|Filler 1|Filler 2|Filler 3|Filler 4|Filler 5|Filler 6" "$(printf '%s' "$OUT" | titles)"
expect "held of total"                "2/6 2/6 1/6 1/6 1/6 1/6 1/6 1/6" "$(printf '%s' "$OUT" | figures)"
expect "short path left out"          false "$(printf '%s' "$OUT" | j "careers.some(c=>c.id==='$SHORT')")"
expect "a career with no path left out" false "$(printf '%s' "$OUT" | j "careers.some(c=>c.id==='$UNWRITTEN')")"
expect "next skills, lowest level first" "S03:2 S04:2 S05:3" "$(printf '%s' "$OUT" | nextOf $A)"
expect "next skills carry id, name, level" "id,level,name" "$(printf '%s' "$OUT" | j "careers[0].next.map(n=>Object.keys(n).sort().join(','))[0]")"
expect "career carries only what is shown" "held,id,next,title,total" "$(printf '%s' "$OUT" | j "careers.map(c=>Object.keys(c).sort().join(','))[0]")"
expect "the figure is the held skills on record" 2 "$(sql "SELECT COUNT(*) FROM occupation_skills os JOIN user_skills us ON us.skill_id=os.skill_id AND us.status='held' JOIN users u ON u.id=us.user_id WHERE os.occupation_id='$A' AND u.email='reach-$RUN@seeker.test'")"
check "another person's list is their own" 200 "$(req o GET /me/careers/reach)" '"careers":\[\]'

# --- Learning counts for the order, not for the figure -----------------------
check "learning S08"                  200 "$(req s PUT /me/skills/$S08 '{"status":"learning"}')"
OUT=$(req s GET /me/careers/reach)
expect "learning lifts a career"      "B|A|Filler 1|Filler 2|Filler 3|Filler 4|Filler 5|Filler 6" "$(printf '%s' "$OUT" | titles)"
expect "learning is not held"         "2/6 2/6 1/6 1/6 1/6 1/6 1/6 1/6" "$(printf '%s' "$OUT" | figures)"
expect "a skill being learned comes first in its level" "S08:2 S07:2 S09:3" "$(printf '%s' "$OUT" | nextOf $B)"
check "hold S03"                      200 "$(req s PUT /me/skills/$S03 '{"status":"held"}')"
OUT=$(req s GET /me/careers/reach)
expect "a held skill outranks one being learned" "A|B" "$(printf '%s' "$OUT" | j "careers.slice(0,2).map(c=>c.title.replace('$P ','')).join('|')")"
expect "held skill leaves next"       "S04:2 S05:3 S06:3" "$(printf '%s' "$OUT" | nextOf $A)"

# --- Chosen careers -----------------------------------------------------------
check "aim at A"                      200 "$(req s PUT /me/goals/$A)"
OUT=$(req s GET /me/careers/reach)
expect "a chosen career is not suggested" false "$(printf '%s' "$OUT" | j "careers.some(c=>c.id==='$A')")"
expect "the list fills up behind it"  "B|Filler 1|Filler 2|Filler 3|Filler 4|Filler 5|Filler 6|Filler 7" "$(printf '%s' "$OUT" | titles)"
OUT=$(req s GET /me/goals)
check "goal shows held skills"        200 "$OUT" '"heldSkills":3'
expect "goal shows its next skills"   "S04:2 S05:3 S06:3" "$(printf '%s' "$OUT" | j "goals.find(g=>g.occupationId==='$A').next.map(n=>n.name.replace('$P ','')+':'+n.level).join(' ')")"
# A goal carries the ids of every skill of its career: what Profile draws its small plate from.
expect "goal lists every skill of its career by id" "$(sql "SELECT string_agg(skill_id::text, ' ' ORDER BY skill_id) FROM occupation_skills WHERE occupation_id='$A'")" "$(printf '%s' "$OUT" | j "goals.find(g=>g.occupationId==='$A').skillIds.join(' ')")"
expect "as many ids as the goal counts skills" true "$(printf '%s' "$OUT" | j "goals.every(g=>g.skillIds.length===g.totalSkills)")"
check "aim at Unwritten"              200 "$(req s PUT /me/goals/$UNWRITTEN)"
expect "a goal with no path written still lists next skills, by level" "S04:2 S05:3 S06:3" "$(req s GET /me/goals | j "goals.find(g=>g.occupationId==='$UNWRITTEN').next.map(n=>n.name.replace('$P ','')+':'+n.level).join(' ')")"
check "stop aiming at A"              200 "$(req s DELETE /me/goals/$A)"
expect "an unchosen career is suggested again" true "$(req s GET /me/careers/reach | j "careers.some(c=>c.id==='$A')")"

# --- A finished path, and skills taken away ----------------------------------
for id in $S07 $S08 $S09 $S10; do req s PUT /me/skills/$id '{"status":"held"}' >/dev/null; done
OUT=$(req s GET /me/careers/reach)
expect "a finished path comes first"  "B 6/6" "$(printf '%s' "$OUT" | j "careers.slice(0,1).map(c=>c.title.replace('$P ','')+' '+c.held+'/'+c.total).join()")"
expect "a finished path has nothing next" 0 "$(printf '%s' "$OUT" | j "careers[0].next.length")"
expect "no more than three next skills" true "$(printf '%s' "$OUT" | j "careers.every(c=>c.next.length<=3)")"
for id in $S01 $S02 $S03 $S07 $S08 $S09 $S10; do req s DELETE /me/skills/$id >/dev/null; done
check "no skills again, no careers"   200 "$(req s GET /me/careers/reach)" '"careers":\[\]'
HDR=$(curl -s -D - -o /dev/null -b "$D/s" "$API/me/careers/reach" | tr -d '\r' | grep -i '^cache-control')
case "$HDR" in *no-store*) echo "ok    reach is not cacheable";; *) echo "FAIL  cache header: $HDR"; fail=1;; esac

# --- Suggested skills ---------------------------------------------------------
# A third person, starting from nothing. Suggestions are the skills of their
# goals (lowest level first), then of the careers within reach (the ones most
# of those careers share first), none of them on the person's list.
suggested() { j "skills.map(s=>s.name.replace('$P ','')).join(' ')"; }
check "suggested requires sign-in"    401 "$(req anon GET /me/skills/suggested)"
check "sign-up third seeker"          201 "$(req g POST /auth/sign-up '{"email":"goal-'"$RUN"'@seeker.test","name":"Gia Goal","password":"correct horse"}')"
check "nothing to go on, nothing suggested" 200 "$(req g GET /me/skills/suggested)" '"skills":\[\]'
check "aim at A"                      200 "$(req g PUT /me/goals/$A)"
OUT=$(req g GET /me/skills/suggested)
expect "a goal's skills, lowest level first" "S01 S02 S03 S04 S05 S06" "$(printf '%s' "$OUT" | suggested)"
expect "a suggestion carries what is shown" "career,careers,id,level,name" "$(printf '%s' "$OUT" | j "skills.map(s=>Object.keys(s).sort().join(','))[0]")"
expect "a suggestion names its career" "$P A" "$(printf '%s' "$OUT" | j "skills[0].career")"
check "hold S01"                      200 "$(req g PUT /me/skills/$S01 '{"status":"held"}')"
OUT=$(req g GET /me/skills/suggested)
expect "goal skills first, then careers within reach" "S02 S03 S04 S05 S06 S08 S09 S10 S11 S12 S07" "$(printf '%s' "$OUT" | suggested)"
expect "a held skill is not suggested" false "$(printf '%s' "$OUT" | j "skills.some(s=>s.id==='$S01')")"
expect "how many careers call for it" 8 "$(printf '%s' "$OUT" | j "skills.find(s=>s.id==='$S08').careers")"
check "learning S02"                  200 "$(req g PUT /me/skills/$S02 '{"status":"learning"}')"
expect "a skill being learned is not suggested" false "$(req g GET /me/skills/suggested | j "skills.some(s=>s.id==='$S02')")"
expect "limit is honoured"            3 "$(req g GET '/me/skills/suggested?limit=3' | j skills.length)"
# A limit is a whole number of rows: a fraction used to reach the database as one and answer 500.
expect "a limit with a fraction is its whole part" 2 "$(req g GET '/me/skills/suggested?limit=2.9' | j skills.length)"
check "another person's suggestions are their own" 200 "$(req o GET /me/skills/suggested)" '"skills":\[\]'
HDR=$(curl -s -D - -o /dev/null -b "$D/g" "$API/me/skills/suggested" | tr -d '\r' | grep -i '^cache-control')
case "$HDR" in *no-store*) echo "ok    suggestions are not cacheable";; *) echo "FAIL  cache header: $HDR"; fail=1;; esac

# --- Jobs near a place, and by what was typed --------------------------------
# A company of our own with four factories far from any other, and one open
# job at each:
#   Home    46.0, -100.0   ND   shift Nights
#   Town    46.3, -100.0   ND   city Seekerville   (20.7 miles north of Home)
#   Far     47.5, -100.0   ND                      (103.6 miles north of Home)
#   Nowhere coordinates that are not numbers, no state
psql "$DB" -q >/dev/null <<SQL
INSERT INTO companies (name) VALUES ('$P Works');
INSERT INTO factories (company_id, name, latitude, longitude, city, state)
SELECT c.id, '$P ' || f.name, f.lat, f.lng, f.city, f.state
FROM companies c, (VALUES
  ('Home', '46.0', '-100.0', NULL, 'ND'), ('Town', '46.3', '-100.0', 'Seekerville', 'ND'),
  ('Far', '47.5', '-100.0', NULL, 'ND'), ('Nowhere', 'n/a', '', NULL, NULL)
) AS f(name, lat, lng, city, state)
WHERE c.name = '$P Works';
INSERT INTO jobs (company_id, factory_id, occupation_id, title, shift, pay_min, pay_max, status, posted_at, expires_at)
SELECT f.company_id, f.id, o.id, '$P Fitter ' || replace(f.name, '$P ', ''),
       CASE WHEN f.name = '$P Home' THEN 'Nights' END, 2000, 3000, 'open',
       now() - (CASE replace(f.name, '$P ', '') WHEN 'Home' THEN 3 WHEN 'Town' THEN 2 WHEN 'Far' THEN 1 ELSE 0 END) * interval '1 hour',
       now() + interval '30 days'
FROM factories f, occupations o
WHERE f.name LIKE '$P %' AND o.title = '$P A';
SQL
expect "fixtures: four open jobs"     4 "$(sql "SELECT COUNT(*) FROM jobs WHERE title LIKE '$P Fitter %'")"
jobTitles() { j "jobs.map(x=>x.title.replace('$P Fitter ','')).join('|')"; }
NEAR="near=46.0,-100.0"
OUT=$(req anon GET "/jobs?$NEAR")
check "jobs near a point"             200 "$OUT"
expect "within 50 miles unless said, nearest first" "Home|Town" "$(printf '%s' "$OUT" | jobTitles)"
expect "each says how far it is"      "0 20.7" "$(printf '%s' "$OUT" | j "jobs.map(x=>x.miles).join(' ')")"
expect "a smaller distance"           "Home" "$(req anon GET "/jobs?$NEAR&within=10" | jobTitles)"
expect "a larger distance; unusable coordinates never match" "Home|Town|Far" "$(req anon GET "/jobs?$NEAR&within=150" | jobTitles)"
expect "the distance is the great-circle one" "103.6" "$(req anon GET "/jobs?$NEAR&within=150" | j "jobs[2].miles")"
expect "near and a career filter together" "Home|Town" "$(req anon GET "/jobs?$NEAR&occupationId=$A" | jobTitles)"
expect "near and another career"      "" "$(req anon GET "/jobs?$NEAR&occupationId=$B" | jobTitles)"
check "near must be a point"          400 "$(req anon GET '/jobs?near=round+rock')"
check "latitude out of range"         400 "$(req anon GET '/jobs?near=91,0')"
check "within must be a distance"     400 "$(req anon GET "/jobs?$NEAR&within=0")"
expect "no distance without a place"  false "$(req anon GET "/jobs?q=$RUN+fitter" | j "jobs.some(x=>'miles' in x)")"
expect "without a place, newest first" "Nowhere|Far|Town|Home" "$(req anon GET "/jobs?q=$RUN+fitter" | jobTitles)"
expect "a limit with a fraction is its whole part" "Nowhere|Far" "$(req anon GET "/jobs?q=$RUN+fitter&limit=2.9" | jobTitles)"
expect "search finds the company"     4 "$(req anon GET "/jobs?q=$RUN+works" | j jobs.length)"
expect "search finds the career"      4 "$(req anon GET "/jobs?q=seeker+$RUN+a" | j jobs.length)"
expect "search finds the shift"       "Home" "$(req anon GET "/jobs?q=$RUN+night" | jobTitles)"
expect "search finds the town"        "Town" "$(req anon GET "/jobs?q=$RUN+seekerville" | jobTitles)"
expect "search finds the state by name" "Far|Town|Home" "$(req anon GET "/jobs?q=$RUN+jobs+in+north+dakota" | jobTitles)"
expect "every word must match"        0 "$(req anon GET "/jobs?q=$RUN+fitter+zzzz" | j jobs.length)"
expect "a longer form of a word still finds it" 4 "$(req anon GET "/jobs?q=$RUN+fitters" | j jobs.length)"
expect "a percent sign is only a character" 0 "$(req anon GET "/jobs?q=$RUN+%25%25%25" | j jobs.length)"

expect "the site search lists open jobs too" "$P Fitter Town|$P Works · Seekerville, ND" "$(req anon GET "/search?q=$RUN+seekerville" | j "results.jobs.items.map(x=>x.name+'|'+x.subtitle).join()")"
expect "a job result opens the job"   jobs "$(req anon GET "/search?q=$RUN+seekerville" | j "results.jobs.items[0].type")"
expect "the map's search asks for no jobs" 0 "$(req anon GET "/search?q=$RUN+seekerville&types=companies,factories,occupations,skills" | j "results.jobs.count")"

# The same jobs on the map's overviews: a box around Home and Town.
BOX="west=-100.1&south=45.9&east=-99.9&north=46.4"
OUT=$(req anon GET "/map/bounds/overview?$BOX")
check "a place's overview"            200 "$OUT"
expect "open jobs in the box"         2 "$(printf '%s' "$OUT" | j openJobs)"
expect "the newest first, with what a row shows" "$P Fitter Town|$P Works|2000" "$(printf '%s' "$OUT" | j "jobs.map(x=>[x.title,x.companyName,x.payMin].join('|'))[0]")"
expect "a state's overview lists its open jobs" true "$(req anon GET /map/states/ND/overview | j "jobs.some(x=>x.title==='$P Fitter Far')")"
sql "UPDATE jobs SET status='closed' WHERE title='$P Fitter Town'" >/dev/null
expect "a closed job is not counted"  1 "$(req anon GET "/map/bounds/overview?$BOX" | j openJobs)"
expect "nor listed near a place"      "Home" "$(req anon GET "/jobs?$NEAR" | jobTitles)"
expect "no jobs, no list"             "0" "$(req anon GET '/map/bounds/overview?west=-100.1&south=48.9&east=-99.9&north=49.0' | j "jobs.concat([o.openJobs]).join(' ')")"

# --- Skills: the page's one answer, the list, other names ----------------------
# With the fixtures above, S03 is on A, Short and Unwritten; the skills that
# share those paths are S04 (the same three careers), S02 (four careers, three
# shared), S05 and S06 (two careers, both shared) and S01 (twelve careers).
OUT=$(req anon GET /skills/$S03)
check "a skill's page in one answer"  200 "$OUT"
expect "it carries what the page shows" "true" "$(printf '%s' "$OUT" | j "name&&['description','howLearned','tools','level','group','domain','groupSkills','occupations','industries','everywhere','relatedSkills','jobs'].every(k=>k in o)")"
expect "its level, group and domain"  "2|$TD-two|$P Group Two|$TD|$P Domain" "$(printf '%s' "$OUT" | j "level+'|'+[o.group.slug, o.group.name, o.domain.slug, o.domain.name].join('|')")"
expect "the other skills of its group, by level and then the group's order" "S04:2 S05:3" "$(printf '%s' "$OUT" | j "groupSkills.map(g=>g.name.replace('$P ','')+':'+g.level).join(' ')")"
expect "each as id, name and level"   "id,level,name" "$(printf '%s' "$OUT" | j "groupSkills.map(g=>Object.keys(g).sort().join())[0]")"
expect "no category any more"         false "$(printf '%s' "$OUT" | j "hasOwnProperty('category')")"
expect "its careers, by title; none gives it a stage of its own" "A|Short|Unwritten" "$(printf '%s' "$OUT" | j "occupations.map(c=>c.title.replace('$P ','')+('stage' in c?':stage':'')).join('|')")"
expect "skills that go with it, the closest companions first" "S04 S02 S05 S06 S01" "$(printf '%s' "$OUT" | j "relatedSkills.map(r=>r.name.replace('$P ','')).join(' ')")"
expect "each with its level and group" "2:$TD-two 1:$TD-one 3:$TD-two 3:null 1:$TD-one" "$(printf '%s' "$OUT" | j "relatedSkills.map(r=>r.level+':'+(r.group&&r.group.slug)).join(' ')")"
# A career's page: every skill of its path with its level, group and domain, in path order.
OUT=$(req anon GET /occupations/$A)
expect "a career's path, by level and then by group as the taxonomy orders them" "S01:1 S02:1 S04:2 S03:2 S05:3 S06:3" "$(printf '%s' "$OUT" | j "skills.map(s=>s.name.replace('$P ','')+':'+s.level).join(' ')")"
expect "each skill carries its group and domain" "$TD-one|$P Group One|$TD|$P Domain" "$(printf '%s' "$OUT" | j "skills.slice(0,1).map(s=>[s.group.slug, s.group.name, s.domain.slug, s.domain.name].join('|'))[0]")"
expect "a skill no group holds says so with nulls" "S06:3:null:null" "$(printf '%s' "$OUT" | j "skills.filter(s=>!s.group).map(s=>[s.name.replace('$P ',''), s.level, String(s.group), String(s.domain)].join(':')).join()")"
expect "the careers list counts the skills at each level" "2,2,2" "$(req anon GET "/occupations?search=$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "$P A")&limit=1" | j "data[0].levelCounts.join()")"

# The taxonomy: every domain, group and skill in one answer.
OUT=$(req anon GET /skills/taxonomy)
check "the taxonomy in one answer"    200 "$OUT" '"levels":\[{"id":1,"name":"Fundamentals"},{"id":2,"name":"Intermediate"},{"id":3,"name":"Advanced"}\]'
expect "every domain, in the taxonomy's order" "$(sql "SELECT string_agg(slug, ',' ORDER BY position, slug) FROM skill_domains")" "$(printf '%s' "$OUT" | j "domains.map(d=>d.slug).join()")"
expect "every group"                  "$(sql "SELECT COUNT(*) FROM skill_groups")" "$(printf '%s' "$OUT" | j "domains.reduce((n,d)=>n+d.groups.length,0)")"
expect "every placed skill, once"     "$(sql "SELECT COUNT(DISTINCT id) || ' ' || COUNT(*) FROM skills WHERE group_slug IS NOT NULL AND level IS NOT NULL")" "$(printf '%s' "$OUT" | j "domains.flatMap(d=>d.groups.flatMap(g=>g.skills.map(s=>s.id))).reduce((seen,id)=>seen.add(id),new Set()).size+' '+o.domains.flatMap(d=>d.groups.flatMap(g=>g.skills)).length")"
expect "a domain carries what is drawn" "description,groups,name,slug|description,name,skills,slug|careers,id,level,makes,name" "$(printf '%s' "$OUT" | j "domains.filter(d=>d.slug==='$TD').flatMap(d=>[d, d.groups[0], d.groups[0].skills[0]]).map(x=>Object.keys(x).sort().join()).join('|')")"
expect "our domain: its groups, their skills by level then order, each with how many careers use it" "$TD-one=S01:1:12 S02:1:4|$TD-two=S04:2:3 S03:2:3 S05:3:2" "$(printf '%s' "$OUT" | j "domains.find(d=>d.slug==='$TD').groups.map(g=>g.slug+'='+g.skills.map(s=>[s.name.replace('$P ',''),s.level,s.careers].join(':')).join(' ')).join('|')")"
expect "every skill's level is 1, 2 or 3" true "$(printf '%s' "$OUT" | j "domains.every(d=>d.groups.every(g=>g.skills.every(s=>[1,2,3].includes(s.level)&&Number.isInteger(s.careers))))")"
expect "the parameter Vercel's rewrite adds changes nothing" "$(printf '%s' "$OUT" | sed '$d' | wc -c)" "$(req anon GET '/skills/taxonomy?path=skills/taxonomy' | sed '$d' | wc -c)"
HDR=$(curl -s -D - -o /dev/null "$API/skills/taxonomy" | tr -d '\r' | grep -i '^cache-control')
case "$HDR" in *public*s-maxage=*) echo "ok    the taxonomy is cached like the other public reads";; *) echo "FAIL  taxonomy cache header: $HDR"; fail=1;; esac
OUT=$(req anon GET /skills/$S03)
expect "no industries when its careers have none" "0 false" "$(printf '%s' "$OUT" | j "industries.length+' '+o.everywhere")"
expect "no jobs until one asks for it" 0 "$(printf '%s' "$OUT" | j jobs.length)"
sql "INSERT INTO job_skills (job_id, skill_id) SELECT id, '$S03' FROM jobs WHERE title IN ('$P Fitter Home', '$P Fitter Town')" >/dev/null
expect "open jobs that ask for it, not the closed one" "$P Fitter Home" "$(req anon GET /skills/$S03 | j "jobs.map(x=>x.title).join('|')")"
sql "INSERT INTO industry_occupations (industry, occupation_id, rank, common) VALUES ('$P Industry', '$A', 1, false), ('$P Industry', '$SHORT', 2, false), ('$P Other Industry', '$A', 1, false), ('$P Everywhere', '$UNWRITTEN', 9, true)" >/dev/null
expect "the industries its careers work in, most careers first" "$P Industry:2|$P Other Industry:1" "$(req anon GET /skills/$S03 | j "industries.map(i=>i.name+':'+i.careerCount).join('|')")"
expect "a skill only on careers found everywhere says so" "0 true" "$(sql "INSERT INTO skills (name) VALUES ('$P Common')" >/dev/null; sql "INSERT INTO occupation_skills (occupation_id, skill_id) SELECT '$UNWRITTEN', id FROM skills WHERE name='$P Common'" >/dev/null; req anon GET /skills/$(sql "SELECT id FROM skills WHERE name='$P Common'") | j "industries.length+' '+o.everywhere")"
sql "DELETE FROM industry_occupations WHERE industry LIKE '$P %'" >/dev/null
check "a skill that is not there"     404 "$(req anon GET /skills/00000000-0000-4000-8000-000000000000)"

# --- Makes: the named equipment a skill is run on, and the ones a person has run ---
# S03 has two makes, stored out of order; S04 has one; the rest have none.
sql "INSERT INTO skill_makes (skill_id, name, position) VALUES ('$S03', '$P Haas', 2), ('$S03', '$P Fanuc', 1), ('$S04', '$P Okuma', 1)" >/dev/null
make() { sql "SELECT id FROM skill_makes WHERE name='$P $1'"; }
HAAS=$(make Haas); FANUC=$(make Fanuc); OKUMA=$(make Okuma)
mine() { req "$1" GET /me/skills | j "skills.filter(s=>s.skillId==='$2').map(s=>s.status+':'+s.makes.map(m=>m.name.replace('$P ','')).join('+'))[0]"; }
OUT=$(req anon GET /skills/$S03)
expect "a skill's makes, in their order, each with its id" "$FANUC:Fanuc|$HAAS:Haas" "$(printf '%s' "$OUT" | j "makes.map(m=>m.id+':'+m.name.replace('$P ','')).join('|')")"
expect "a make carries its id and name, nothing else" "id,name" "$(printf '%s' "$OUT" | j "makes.map(m=>Object.keys(m).sort().join())[0]")"
expect "a skill with none says so with an empty list" "0" "$(req anon GET /skills/$S01 | j makes.length)"
expect "the parameter Vercel's rewrite adds changes nothing here either" "2" "$(req anon GET "/skills/$S03?path=skills/$S03" | j makes.length)"
OUT=$(req anon GET /skills/taxonomy)
expect "the taxonomy carries each skill's makes by name" "S04=Okuma S03=Fanuc+Haas S05=" "$(printf '%s' "$OUT" | j "domains.find(d=>d.slug==='$TD').groups[1].skills.map(s=>s.name.replace('$P ','')+'='+s.makes.map(m=>m.replace('$P ','')).join('+')).join(' ')")"
expect "every skill of the taxonomy has a list of makes" true "$(printf '%s' "$OUT" | j "domains.every(d=>d.groups.every(g=>g.skills.every(s=>Array.isArray(s.makes)&&s.makes.every(m=>typeof m==='string'))))")"
expect "a search by a make finds the skills run on it" "S03" "$(req anon GET "/skills?search=$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "$P Haas")" | j "data.map(s=>s.name.replace('$P ','')).join()")"
expect "and so does the search across everything" "S03" "$(req anon GET "/search?q=$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "$P Haas")&types=skills" | j "results.skills.items.map(s=>s.name.replace('$P ','')).join()")"
check "sign-up a seeker for makes"    201 "$(req m POST /auth/sign-up '{"email":"makes-'"$RUN"'@seeker.test","name":"Mak Maker","password":"correct horse"}')"
MID=$(sql "SELECT id FROM users WHERE email='makes-$RUN@seeker.test'")
check "marking makes requires sign-in" 401 "$(req anon PUT /me/skills/$S03/makes "{\"makes\":[\"$HAAS\"]}")"
check "not for a skill off the list"  409 "$(req m PUT /me/skills/$S03/makes "{\"makes\":[\"$HAAS\"]}")" 'Add the skill to your list first'
check "hold S03"                      200 "$(req m PUT /me/skills/$S03 '{"status":"held"}')"
expect "a held skill starts with no makes" "held:" "$(mine m $S03)"
OUT=$(req m PUT /me/skills/$S03/makes "{\"makes\":[\"$HAAS\"]}")
check "mark one make"                 200 "$OUT" "\"skillId\":\"$S03\""
expect "the answer is the list as it now stands" "Haas" "$(printf '%s' "$OUT" | j "makes.map(m=>m.name.replace('$P ','')).join('+')")"
expect "the person's skills carry it" "held:Haas" "$(mine m $S03)"
check "mark both, sent out of order and twice" 200 "$(req m PUT /me/skills/$S03/makes "{\"makes\":[\"$HAAS\",\"$FANUC\",\"$HAAS\"]}")"
expect "listed once each, in the skill's order" "held:Fanuc+Haas" "$(mine m $S03)"
check "another skill's make is refused" 400 "$(req m PUT /me/skills/$S03/makes "{\"makes\":[\"$HAAS\",\"$OKUMA\"]}")" 'not a make of this skill'
check "a make that does not exist"    400 "$(req m PUT /me/skills/$S03/makes '{"makes":["00000000-0000-4000-8000-000000000000"]}')"
check "makes that are not a list"     400 "$(req m PUT /me/skills/$S03/makes "{\"makes\":\"$HAAS\"}")"
check "makes that are not ids"        400 "$(req m PUT /me/skills/$S03/makes '{"makes":["Haas"]}')"
check "no body at all"                400 "$(req m PUT /me/skills/$S03/makes)"
check "a skill id that is not one"    400 "$(req m PUT /me/skills/not-an-id/makes '{"makes":[]}')"
expect "the refusals changed nothing" "held:Fanuc+Haas" "$(mine m $S03)"
check "learning it instead"           200 "$(req m PUT /me/skills/$S03 '{"status":"learning"}')"
expect "a change of status keeps the makes" "learning:Fanuc+Haas" "$(mine m $S03)"
check "unmark one"                    200 "$(req m PUT /me/skills/$S03/makes "{\"makes\":[\"$FANUC\"]}")"
expect "the list is what was sent"    "learning:Fanuc" "$(mine m $S03)"
check "hold S04 and mark its make"    200 "$(req m PUT /me/skills/$S04 '{"status":"held"}')"
check "S04's make"                    200 "$(req m PUT /me/skills/$S04/makes "{\"makes\":[\"$OKUMA\"]}")"
expect "each skill keeps its own makes" "learning:Fanuc held:Okuma" "$(mine m $S03) $(mine m $S04)"
check "another person holds S03"      200 "$(req o PUT /me/skills/$S03 '{"status":"held"}')"
expect "and sees none of the first person's makes" "held:" "$(mine o $S03)"
check "taking the skill off the list" 200 "$(req m DELETE /me/skills/$S03)"
expect "takes its makes with it, and only its" "0 1" "$(sql "SELECT COUNT(*) FILTER (WHERE skill_id='$S03') || ' ' || COUNT(*) FILTER (WHERE skill_id='$S04') FROM user_skill_makes WHERE user_id='$MID'")"
check "back on the list"              200 "$(req m PUT /me/skills/$S03 '{"status":"held"}')"
expect "it starts again with none"    "held:" "$(mine m $S03)"
check "clearing a skill's makes"      200 "$(req m PUT /me/skills/$S04/makes '{"makes":[]}')" '"makes":\[\]'
expect "the database refuses a mark for a skill off the list" "refused" "$(psql "$DB" -qtAc "INSERT INTO user_skill_makes (user_id, skill_id, make_id) VALUES ('$MID', '$S05', '$HAAS')" 2>&1 | grep -q 'violates foreign key' && echo refused)"
expect "and a mark for another skill's make" "refused" "$(psql "$DB" -qtAc "INSERT INTO user_skill_makes (user_id, skill_id, make_id) VALUES ('$MID', '$S03', '$OKUMA')" 2>&1 | grep -q 'violates foreign key' && echo refused)"
check "mark again before the account goes" 200 "$(req m PUT /me/skills/$S03/makes "{\"makes\":[\"$HAAS\"]}")"
check "deleting the account"          200 "$(req m DELETE /me '{"password":"correct horse"}')"
expect "takes the person's makes"     0 "$(sql "SELECT COUNT(*) FROM user_skill_makes WHERE user_id='$MID'")"
check "the other person drops S03 again" 200 "$(req o DELETE /me/skills/$S03)"

# The list: skills a career uses, the ones most careers use first.
ENC=$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "$P")
# Narrowed by group, by domain and by level. "Lone" is in group one and on no career.
sql "INSERT INTO skills (name, group_slug, level) VALUES ('$P Lone', '$TD-one', 2)" >/dev/null
names() { j "data.map(x=>x.name.replace('$P ','')).join('|')"; }
OUT=$(req anon GET "/skills?group=$TD-one")
expect "most careers first, a skill on no career left out" "S01|S02" "$(printf '%s' "$OUT" | names)"
expect "the total counts what is listed" 2 "$(printf '%s' "$OUT" | j total)"
expect "a row says how many careers use it" "12|4" "$(printf '%s' "$OUT" | j "data.map(x=>x.occupationCount).join('|')")"
expect "a row carries its level, group and domain" "1|$TD-one|$P Group One|$TD|$P Domain" "$(printf '%s' "$OUT" | j "data.map(x=>[x.level, x.group.slug, x.group.name, x.domain.slug, x.domain.name].join('|'))[0]")"
expect "and no category"              false "$(printf '%s' "$OUT" | j "data[0].hasOwnProperty('category')")"
expect "by name when asked"           "S02|S01" "$(req anon GET "/skills?group=$TD-one&sort=name&order=desc" | names)"
expect "a domain is all its groups"   "S01|S02|S03|S04|S05" "$(req anon GET "/skills?domain=$TD&sort=name" | names)"
expect "a domain and a level"         "S03|S04" "$(req anon GET "/skills?domain=$TD&level=2&sort=name" | names)"
expect "a group and a level"          "S05" "$(req anon GET "/skills?domain=$TD&group=$TD-two&level=3" | names)"
expect "a level alone"                true "$(req anon GET '/skills?level=3&limit=100' | j "data.length>0&&o.data.every(x=>x.level===3)")"
expect "a group of another domain matches nothing" 0 "$(req anon GET "/skills?domain=$TD&group=no-such-group" | j total)"
expect "a domain that is not one matches nothing" 0 "$(req anon GET '/skills?domain=no-such-domain' | j total)"
check "a level that is not one"       400 "$(req anon GET '/skills?level=4')"
expect "the old category filter is not read" "$(req anon GET '/skills?limit=1' | j total)" "$(req anon GET '/skills?category=Machining&limit=1' | j total)"
expect "the list opens on the skill most careers use" true "$(req anon GET '/skills?limit=3' | j "data.every((x,i,a)=>i===0||a[i-1].occupationCount>=x.occupationCount)")"
expect "nothing listed is on no career" 0 "$(req anon GET '/skills?limit=100' | j "data.filter(x=>!x.occupationCount).length")"
expect "the parameter Vercel's rewrite adds changes nothing" "S01|S02" "$(req anon GET "/skills?group=$TD-one&path=skills" | names)"
# Search: by name, by another name, by a tool; a skill on no career can still be found and picked.
expect "a search finds a skill no career uses yet" "Lone" "$(req anon GET "/skills?search=$ENC%20Lone" | names)"
expect "a search puts the most used of equal matches first" "S01|S08|S09" "$(req anon GET "/skills?search=$ENC%20S&limit=3" | names)"
expect "and an exact name before a longer one" "S01" "$(sql "INSERT INTO skills (name) VALUES ('$P S01 Extra')" >/dev/null; req anon GET "/skills?search=$ENC%20S01&limit=1" | names)"
sql "INSERT INTO skill_aliases (alias_text, canonical_skill_id) VALUES ('Oldname$RUN Welding', '$S05')" >/dev/null
sql "UPDATE skills SET tools = ARRAY['Wrench$RUN set', 'calipers'] WHERE id='$S06'" >/dev/null
expect "another name finds the skill" "S05" "$(req anon GET "/skills?search=oldname$RUN" | names)"
expect "from the start of a word, not the middle" "" "$(req anon GET "/skills?search=ldname$RUN" | names)"
expect "a tool finds the skill"       "S06" "$(req anon GET "/skills?search=wrench$RUN" | names)"
expect "a percent sign is only a character" 0 "$(req anon GET '/skills?search=%25%25%25' | j total)"
expect "the site search finds it by its other name and says so" "$P S05|Also called Oldname$RUN Welding" "$(req anon GET "/search?q=oldname$RUN&types=skills" | j "results.skills.items.map(x=>x.name+'|'+x.subtitle).join()")"
expect "and by a tool"                "$P S06" "$(req anon GET "/search?q=wrench$RUN&types=skills" | j "results.skills.items.map(x=>x.name).join()")"
expect "a skill found by its name says its group" "$P S01|$P Group One" "$(req anon GET "/search?q=$ENC%20S01&types=skills&limit=1" | j "results.skills.items.map(x=>x.name+'|'+x.subtitle).join()")"
expect "a group's name finds its skills" "Lone S01 S02" "$(req anon GET "/search?q=$ENC%20Group%20One&types=skills" | j "results.skills.items.map(x=>x.name.replace('$P ','')).sort().join(' ')")"

# --- Changing my email --------------------------------------------------------
E1="mail-$RUN@seeker.test"; E2="moved-$RUN@seeker.test"
check "email change requires sign-in" 401 "$(req anon POST /auth/email '{"email":"'"$E2"'","password":"correct horse"}')"
check "sign-up for the email change"  201 "$(req e POST /auth/sign-up '{"email":"'"$E1"'","name":"Em Mail","password":"correct horse"}')"
check "a second session of theirs"    200 "$(req e2 POST /auth/sign-in '{"email":"'"$E1"'","password":"correct horse"}')"
check "not an address"                400 "$(req e POST /auth/email '{"email":"nope","password":"correct horse"}')" '"field":"email"'
check "the address they already have" 400 "$(req e POST /auth/email '{"email":"'"$E1"'","password":"correct horse"}')" 'already your email'
check "no password"                   400 "$(req e POST /auth/email '{"email":"'"$E2"'"}')" '"field":"password"'
check "wrong password"                400 "$(req e POST /auth/email '{"email":"'"$E2"'","password":"wrong horse"}')" 'not your current password'
check "an address someone else has"   409 "$(req e POST /auth/email '{"email":"OTHER-'"$RUN"'@seeker.test","password":"correct horse"}')" 'already exists'
expect "nothing changed by the refusals" "$E1" "$(req e GET /auth/me | j user.email)"
check "email changed"                 200 "$(req e POST /auth/email '{"email":" Moved-'"$RUN"'@Seeker.Test ","password":"correct horse"}')" "\"email\":\"$E2\""
expect "this session carries on"      "$E2" "$(req e GET /auth/me | j user.email)"
expect "their other session ended"    null "$(req e2 GET /auth/me | j user)"
check "the old address no longer signs in" 401 "$(req e2 POST /auth/sign-in '{"email":"'"$E1"'","password":"correct horse"}')"
check "the new address does"          200 "$(req e2 POST /auth/sign-in '{"email":"'"$E2"'","password":"correct horse"}')"
expect "one account, not two"         1 "$(sql "SELECT COUNT(*) FROM users WHERE email IN ('$E1','$E2')")"
# The old address is told, when the API under test captures its email (OUTBOX is that file).
if [ -n "${OUTBOX:-}" ] && [ -f "$OUTBOX" ]; then
  expect "the old address is told"    1 "$(grep -c "\"kind\":\"email-changed\".*\"to\":\"$E1\"" "$OUTBOX")"
  expect "and is told the new one"    1 "$(grep "\"to\":\"$E1\"" "$OUTBOX" | grep -c "$E2")"
else echo "skip  email to the old address (set OUTBOX to the API's EMAIL_OUTBOX file to check it)"; fi

# --- Deleting my account ------------------------------------------------------
JOB=$(sql "SELECT id FROM jobs WHERE title='$P Fitter Home'")
check "sign-up for the deletion"      201 "$(req d POST /auth/sign-up '{"email":"gone-'"$RUN"'@seeker.test","name":"Dee Leet","password":"correct horse"}')"
DID=$(req d GET /auth/me | j user.id)
check "a skill"                       200 "$(req d PUT /me/skills/$S01 '{"status":"held"}')"
check "a goal"                        200 "$(req d PUT /me/goals/$A)"
check "an application"                201 "$(req d POST /jobs/$JOB/apply '{"note":"hello"}')"
# What the account is for changes the tools drawn, and nothing the person has.
expect "a new account is for work"    work "$(req d GET /auth/me | j user.purpose)"
check "set to hire"                   200 "$(req d PATCH /me '{"purpose":"hire"}')" '"purpose":"hire"'
expect "skill, goal and application are all still there" "1 1 1" "$(echo "$(req d GET /me/skills | j skills.length) $(req d GET /me/goals | j goals.length) $(req d GET /me/applications | j applications.length)")"
check "a seeker's routes still answer" 200 "$(req d GET /me/careers/reach)"
check "set back to work"              200 "$(req d PATCH /me '{"purpose":"work"}')" '"purpose":"work"'
sql "INSERT INTO company_members (company_id, user_id, role, status) SELECT id, '$DID', 'member', 'active' FROM companies WHERE name='$P Works'" >/dev/null
check "deletion requires sign-in"     401 "$(req anon DELETE /me '{"password":"correct horse"}')"
check "deletion needs the password"   400 "$(req d DELETE /me '{}')" 'Enter your password'
check "wrong password deletes nothing" 400 "$(req d DELETE /me '{"password":"wrong horse"}')" 'not your password'
expect "still there"                  1 "$(sql "SELECT COUNT(*) FROM users WHERE id='$DID'")"
check "account deleted"               200 "$(req d DELETE /me '{"password":"correct horse"}')"
expect "signed out by it"             null "$(req d GET /auth/me | j user)"
expect "the account and what hung on it are gone" "0 0 0 0 0 0" "$(sql "SELECT (SELECT COUNT(*) FROM users WHERE id='$DID') || ' ' || (SELECT COUNT(*) FROM user_skills WHERE user_id='$DID') || ' ' || (SELECT COUNT(*) FROM user_goals WHERE user_id='$DID') || ' ' || (SELECT COUNT(*) FROM applications WHERE user_id='$DID') || ' ' || (SELECT COUNT(*) FROM company_members WHERE user_id='$DID') || ' ' || (SELECT COUNT(*) FROM sessions WHERE user_id='$DID')")"
expect "the job they applied to stays" 1 "$(sql "SELECT COUNT(*) FROM jobs WHERE id='$JOB'")"
check "the address can be used again" 201 "$(req d POST /auth/sign-up '{"email":"gone-'"$RUN"'@seeker.test","name":"Dee Again","password":"correct horse"}')"
# The last admin cannot delete themselves. Checked only where this run's admin
# is the only one, which a database with other admins in it cannot show.
sql "UPDATE users SET is_admin=true WHERE email='gone-$RUN@seeker.test'" >/dev/null
if [ "$(sql "SELECT COUNT(*) FROM users WHERE is_admin")" = "1" ]; then
  check "the last admin cannot delete themselves" 409 "$(req d DELETE /me '{"password":"correct horse"}')" 'only admin'
  expect "and is still there"         1 "$(sql "SELECT COUNT(*) FROM users WHERE email='gone-$RUN@seeker.test'")"
else echo "skip  last admin (other admins exist in this database)"; fi
sql "UPDATE users SET is_admin=true WHERE email='other-$RUN@seeker.test'" >/dev/null
check "an admin who is not the last can" 200 "$(req d DELETE /me '{"password":"correct horse"}')"
expect "one admin left"               1 "$(sql "SELECT COUNT(*) FROM users WHERE is_admin AND email LIKE '%-$RUN@seeker.test'")"

cleanup
expect "test accounts removed"        0 "$(sql "SELECT COUNT(*) FROM users WHERE email LIKE '%@seeker.test'")"
expect "test careers and skills removed" 0 "$(sql "SELECT (SELECT COUNT(*) FROM occupations WHERE title LIKE 'Seeker Test %') + (SELECT COUNT(*) FROM skills WHERE name LIKE 'Seeker Test %')")"
expect "test company, factories and jobs removed" 0 "$(sql "SELECT (SELECT COUNT(*) FROM companies WHERE name LIKE 'Seeker Test %') + (SELECT COUNT(*) FROM factories WHERE name LIKE 'Seeker Test %') + (SELECT COUNT(*) FROM jobs WHERE title LIKE 'Seeker Test %')")"
finish
