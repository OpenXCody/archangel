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
# factories and jobs (named "Seeker Test ..."), written straight to the
# database. All of it is removed on exit, however the script ends. Never point
# it at production.
#   API=http://localhost:3000/api DB=postgresql://... bash tests/api/seeker.sh
# Needs a running dev API, and psql, curl and node on the PATH.
set -u
API=${API:-http://localhost:3000/api}
DB=${DB:-postgresql://postgres:postgres@127.0.0.1:5432/archangel}
case "$API" in http://localhost:*|http://127.0.0.1:*) ;; *) echo "Refusing to run against $API: local only."; exit 2;; esac
D=$(mktemp -d)
# A fresh address per run, so repeat runs do not trip the sign-in throttle.
RUN=$(date +%s)
fail=0
req() { # jar method path [json]  -> prints "status body"
  local jar=$1 m=$2 p=$3 d=${4:-}
  if [ -n "$d" ]; then curl -s -b "$D/$jar" -c "$D/$jar" -X "$m" -H 'Content-Type: application/json' -d "$d" -w '\n%{http_code}' "$API$p"
  else curl -s -b "$D/$jar" -c "$D/$jar" -X "$m" -w '\n%{http_code}' "$API$p"; fi
}
check() { # name expected-status actual-output [grep-pattern]
  local name=$1 want=$2 out=$3 pat=${4:-}
  local code; code=$(printf '%s' "$out" | tail -n1)
  local body; body=$(printf '%s' "$out" | sed '$d')
  if [ "$code" != "$want" ] || { [ -n "$pat" ] && ! printf '%s' "$body" | grep -q "$pat"; }; then
    echo "FAIL  $name: wanted $want ${pat:+matching /$pat/ }got $code $(printf '%s' "$body" | head -c 200)"; fail=1
  else echo "ok    $name"; fi
}
expect() { # name wanted got
  if [ "$2" = "$3" ]; then echo "ok    $1"; else echo "FAIL  $1: wanted $2 got $3"; fail=1; fi
}
sql() { psql "$DB" -qtAc "$1"; }
j() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s.split('\n').slice(0,-1).join('\n'));console.log(eval('o.'+process.argv[1]))})" "$1"; }

cleanup() {
  psql "$DB" -qtAc "DELETE FROM users WHERE email LIKE '%@seeker.test';
    DELETE FROM companies WHERE name LIKE 'Seeker Test %';
    DELETE FROM occupations WHERE title LIKE 'Seeker Test %';
    DELETE FROM skills WHERE name LIKE 'Seeker Test %'" >/dev/null
  rm -rf "$D"
}
trap cleanup EXIT
psql "$DB" -qtAc "DELETE FROM users WHERE email LIKE '%@seeker.test';
  DELETE FROM companies WHERE name LIKE 'Seeker Test %';
  DELETE FROM occupations WHERE title LIKE 'Seeker Test %';
  DELETE FROM skills WHERE name LIKE 'Seeker Test %'" >/dev/null

# --- Careers and skills of our own -------------------------------------------
# Twelve skills, S01..S12, and these careers (stage in brackets):
#   A         S01[1] S02[1] S03[2] S04[2] S05[3] S06[3]
#   B         S01[1] S02[1] S07[2] S08[2] S09[3] S10[3]
#   Short     S01[1] S02[1] S03[2] S04[3]              four skills: too short a path
#   Unstaged  S01    S02    S03    S04    S05    S06   no stages: not a path
#   Filler 1..8   S01[1] S11[1] S12[2] S08[2] S09[3] S10[3]
# Nobody else holds these skills and they are on no other career, so the list
# for a person who holds only these is exactly known.
P="Seeker Test $RUN"
psql "$DB" -q >/dev/null <<SQL
INSERT INTO skills (name) SELECT '$P S' || to_char(n, 'FM00') FROM generate_series(1, 12) n;
INSERT INTO occupations (title, path_status) VALUES ('$P A', 'draft'), ('$P B', 'draft'), ('$P Short', 'draft'), ('$P Unstaged', NULL);
INSERT INTO occupations (title, path_status) SELECT '$P Filler ' || n, 'draft' FROM generate_series(1, 8) n;
INSERT INTO occupation_skills (occupation_id, skill_id, stage)
SELECT o.id, s.id, p.stage
FROM (VALUES
  ('A', 1, 1), ('A', 2, 1), ('A', 3, 2), ('A', 4, 2), ('A', 5, 3), ('A', 6, 3),
  ('B', 1, 1), ('B', 2, 1), ('B', 7, 2), ('B', 8, 2), ('B', 9, 3), ('B', 10, 3),
  ('Short', 1, 1), ('Short', 2, 1), ('Short', 3, 2), ('Short', 4, 3),
  ('Unstaged', 1, NULL), ('Unstaged', 2, NULL), ('Unstaged', 3, NULL), ('Unstaged', 4, NULL), ('Unstaged', 5, NULL), ('Unstaged', 6, NULL)
) AS p(career, n, stage)
JOIN occupations o ON o.title = '$P ' || p.career
JOIN skills s ON s.name = '$P S' || to_char(p.n, 'FM00');
INSERT INTO occupation_skills (occupation_id, skill_id, stage)
SELECT o.id, s.id, p.stage
FROM occupations o
CROSS JOIN (VALUES (1, 1), (11, 1), (12, 2), (8, 2), (9, 3), (10, 3)) AS p(n, stage)
JOIN skills s ON s.name = '$P S' || to_char(p.n, 'FM00')
WHERE o.title LIKE '$P Filler %';
SQL
skill() { sql "SELECT id FROM skills WHERE name='$P S$1'"; }
career() { sql "SELECT id FROM occupations WHERE title='$P $1'"; }
for n in 01 02 03 04 05 06 07 08 09 10 11 12; do eval "S$n=$(skill $n)"; done
A=$(career A); B=$(career B); SHORT=$(career Short); UNSTAGED=$(career Unstaged)
expect "fixtures: twelve skills"     12 "$(sql "SELECT COUNT(*) FROM skills WHERE name LIKE '$P S%'")"
expect "fixtures: twelve careers"    12 "$(sql "SELECT COUNT(*) FROM occupations WHERE title LIKE '$P %'")"

# What the list holds, as short strings to compare.
titles() { j "careers.map(c=>c.title.replace('$P ','')).join('|')"; }        # career order
figures() { j "careers.map(c=>c.held+'/'+c.total).join(' ')"; }              # held/total, in order
nextOf() { j "careers.find(c=>c.id==='$1').next.map(n=>n.name.replace('$P ','')+':'+n.stage).join(' ')"; }

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
expect "unstaged career left out"     false "$(printf '%s' "$OUT" | j "careers.some(c=>c.id==='$UNSTAGED')")"
expect "next skills, earliest stage first" "S03:2 S04:2 S05:3" "$(printf '%s' "$OUT" | nextOf $A)"
expect "next skills carry id, name, stage" "id,name,stage" "$(printf '%s' "$OUT" | j "careers[0].next.map(n=>Object.keys(n).sort().join(','))[0]")"
expect "career carries only what is shown" "held,id,next,title,total" "$(printf '%s' "$OUT" | j "careers.map(c=>Object.keys(c).sort().join(','))[0]")"
expect "the figure is the held skills on record" 2 "$(sql "SELECT COUNT(*) FROM occupation_skills os JOIN user_skills us ON us.skill_id=os.skill_id AND us.status='held' JOIN users u ON u.id=us.user_id WHERE os.occupation_id='$A' AND u.email='reach-$RUN@seeker.test'")"
check "another person's list is their own" 200 "$(req o GET /me/careers/reach)" '"careers":\[\]'

# --- Learning counts for the order, not for the figure -----------------------
check "learning S08"                  200 "$(req s PUT /me/skills/$S08 '{"status":"learning"}')"
OUT=$(req s GET /me/careers/reach)
expect "learning lifts a career"      "B|A|Filler 1|Filler 2|Filler 3|Filler 4|Filler 5|Filler 6" "$(printf '%s' "$OUT" | titles)"
expect "learning is not held"         "2/6 2/6 1/6 1/6 1/6 1/6 1/6 1/6" "$(printf '%s' "$OUT" | figures)"
expect "a skill being learned comes first in its stage" "S08:2 S07:2 S09:3" "$(printf '%s' "$OUT" | nextOf $B)"
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
expect "goal shows its next skills"   "S04:2 S05:3 S06:3" "$(printf '%s' "$OUT" | j "goals.find(g=>g.occupationId==='$A').next.map(n=>n.name.replace('$P ','')+':'+n.stage).join(' ')")"
check "aim at Unstaged"               200 "$(req s PUT /me/goals/$UNSTAGED)"
expect "a goal without stages still lists next skills" "S04:null S05:null S06:null" "$(req s GET /me/goals | j "goals.find(g=>g.occupationId==='$UNSTAGED').next.map(n=>n.name.replace('$P ','')+':'+n.stage).join(' ')")"
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
# goals (earliest stage first), then of the careers within reach (the ones most
# of those careers share first), none of them on the person's list.
suggested() { j "skills.map(s=>s.name.replace('$P ','')).join(' ')"; }
check "suggested requires sign-in"    401 "$(req anon GET /me/skills/suggested)"
check "sign-up third seeker"          201 "$(req g POST /auth/sign-up '{"email":"goal-'"$RUN"'@seeker.test","name":"Gia Goal","password":"correct horse"}')"
check "nothing to go on, nothing suggested" 200 "$(req g GET /me/skills/suggested)" '"skills":\[\]'
check "aim at A"                      200 "$(req g PUT /me/goals/$A)"
OUT=$(req g GET /me/skills/suggested)
expect "a goal's skills, earliest stage first" "S01 S02 S03 S04 S05 S06" "$(printf '%s' "$OUT" | suggested)"
expect "a suggestion carries what is shown" "career,careers,id,name,stage" "$(printf '%s' "$OUT" | j "skills.map(s=>Object.keys(s).sort().join(','))[0]")"
expect "a suggestion names its career" "$P A" "$(printf '%s' "$OUT" | j "skills[0].career")"
check "hold S01"                      200 "$(req g PUT /me/skills/$S01 '{"status":"held"}')"
OUT=$(req g GET /me/skills/suggested)
expect "goal skills first, then careers within reach" "S02 S03 S04 S05 S06 S08 S09 S10 S11 S12 S07" "$(printf '%s' "$OUT" | suggested)"
expect "a held skill is not suggested" false "$(printf '%s' "$OUT" | j "skills.some(s=>s.id==='$S01')")"
expect "how many careers call for it" 8 "$(printf '%s' "$OUT" | j "skills.find(s=>s.id==='$S08').careers")"
check "learning S02"                  200 "$(req g PUT /me/skills/$S02 '{"status":"learning"}')"
expect "a skill being learned is not suggested" false "$(req g GET /me/skills/suggested | j "skills.some(s=>s.id==='$S02')")"
expect "limit is honoured"            3 "$(req g GET '/me/skills/suggested?limit=3' | j skills.length)"
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
[ $fail -eq 0 ] && echo "ALL PASSED" || echo "SOME FAILED"
exit $fail
