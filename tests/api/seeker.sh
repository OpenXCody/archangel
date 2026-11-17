#!/usr/bin/env bash
# End-to-end check of what a career seeker's skills turn into: careers within
# reach (GET /api/me/careers/reach) and the next skills on their chosen
# careers (GET /api/me/goals). Prints one line per check and exits non-zero if
# any fail.
#
# LOCAL ONLY: it creates and deletes users (emails ending @seeker.test) and,
# so the ranking can be checked exactly, its own careers and skills (named
# "Seeker Test ..."), written straight to the database. All of it is removed on
# exit, however the script ends. Never point it at production.
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
    DELETE FROM occupations WHERE title LIKE 'Seeker Test %';
    DELETE FROM skills WHERE name LIKE 'Seeker Test %'" >/dev/null
  rm -rf "$D"
}
trap cleanup EXIT
psql "$DB" -qtAc "DELETE FROM users WHERE email LIKE '%@seeker.test';
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

cleanup
expect "test accounts removed"        0 "$(sql "SELECT COUNT(*) FROM users WHERE email LIKE '%@seeker.test'")"
expect "test careers and skills removed" 0 "$(sql "SELECT (SELECT COUNT(*) FROM occupations WHERE title LIKE 'Seeker Test %') + (SELECT COUNT(*) FROM skills WHERE name LIKE 'Seeker Test %')")"
[ $fail -eq 0 ] && echo "ALL PASSED" || echo "SOME FAILED"
exit $fail
