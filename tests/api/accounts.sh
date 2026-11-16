#!/usr/bin/env bash
# End-to-end check of accounts, memberships, jobs and applications, from
# sign-up through hiring, including the refusals. Prints one line per check
# and exits non-zero if any fail.
#
# LOCAL ONLY: it creates and deletes users (emails ending @e2e.test) and
# promotes one to admin directly in the database. Never point it at production.
#   API=http://localhost:3000/api DB=postgresql://... bash tests/api/accounts.sh
# Needs a running dev API with ADMIN_SECRET unset, seeded data that includes
# Texas and non-Texas factories, and psql, curl and node on the PATH.
set -u
API=${API:-http://localhost:3000/api}
DB=${DB:-postgresql://postgres:postgres@127.0.0.1:5432/archangel}
case "$API" in http://localhost:*|http://127.0.0.1:*) ;; *) echo "Refusing to run against $API: local only."; exit 2;; esac
D=$(mktemp -d)
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
j() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s.split('\n').slice(0,-1).join('\n'));console.log(eval('o.'+process.argv[1]))})" "$1"; }

psql "$DB" -qtAc "DELETE FROM users WHERE email LIKE '%@e2e.test'" >/dev/null
TXF=$(psql "$DB" -tAc "SELECT id FROM factories WHERE state='TX' AND company_id IS NOT NULL LIMIT 1")
TXC=$(psql "$DB" -tAc "SELECT company_id FROM factories WHERE id='$TXF'")
CAF=$(psql "$DB" -tAc "SELECT id FROM factories WHERE state='CA' AND company_id IS NOT NULL LIMIT 1")
CAC=$(psql "$DB" -tAc "SELECT company_id FROM factories WHERE id='$CAF'")
OCC=$(psql "$DB" -tAc "SELECT occupation_id FROM occupation_skills GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 1")
SK=$(psql "$DB" -tAc "SELECT skill_id FROM occupation_skills WHERE occupation_id='$OCC' AND stage IS DISTINCT FROM 3 ORDER BY skill_id LIMIT 1")

check "me when signed out"            200 "$(req anon GET /auth/me)" '"user":null'
check "sign-up rejects short password" 400 "$(req s POST /auth/sign-up '{"email":"seeker@e2e.test","name":"Sam Seeker","password":"short"}')"
check "sign-up seeker"                201 "$(req s POST /auth/sign-up '{"email":"Seeker@E2E.test","name":"Sam Seeker","password":"correct horse"}')" '"email":"seeker@e2e.test"'
check "sign-up duplicate"             409 "$(req x POST /auth/sign-up '{"email":"seeker@e2e.test","name":"Dup","password":"correct horse"}')"
check "sign-in wrong password"        401 "$(req x POST /auth/sign-in '{"email":"seeker@e2e.test","password":"wrong password"}')"
check "sign-in seeker (new jar)"      200 "$(req s2 POST /auth/sign-in '{"email":"seeker@e2e.test","password":"correct horse"}')" '"isEmployer":false'
check "me requires sign-in"           401 "$(req anon GET /me/skills)"
check "profile update"                200 "$(req s PATCH /me '{"homeZip":"78701","about":"Machinist in training"}')" '"homeZip":"78701"'
check "profile bad zip"               400 "$(req s PATCH /me '{"homeZip":"abc"}')"
check "mark skill held"               200 "$(req s PUT /me/skills/$SK '{"status":"held"}')" '"status":"held"'
check "bad skill status"              400 "$(req s PUT /me/skills/$SK '{"status":"expert"}')"
check "add goal"                      200 "$(req s PUT /me/goals/$OCC)"
check "goals show 1 held"             200 "$(req s GET /me/goals)" '"heldSkills":1'

check "sign-up employer"              201 "$(req e POST /auth/sign-up '{"email":"emp@e2e.test","name":"Erin Employer","password":"correct horse"}')"
check "sign-up admin"                 201 "$(req a POST /auth/sign-up '{"email":"admin@e2e.test","name":"Ada Admin","password":"correct horse"}')"
check "claim-admin without key"       403 "$(req a POST /auth/claim-admin)"
psql "$DB" -qtAc "UPDATE users SET is_admin=true WHERE email='admin@e2e.test'" >/dev/null
check "admin overview as admin"       200 "$(req a GET /admin/overview)" '"users":'
check "employer posts before joining" 403 "$(req e POST /jobs "{\"companyId\":\"$TXC\",\"factoryId\":\"$TXF\",\"occupationId\":\"$OCC\",\"payMin\":2400,\"payMax\":2900}")"
check "request membership"            201 "$(req e POST /employer/memberships "{\"companyId\":\"$TXC\"}")" '"status":"requested"'
check "still cannot post (requested)" 403 "$(req e POST /jobs "{\"companyId\":\"$TXC\",\"factoryId\":\"$TXF\",\"occupationId\":\"$OCC\",\"payMin\":2400,\"payMax\":2900}")"
EID=$(psql "$DB" -tAc "SELECT id FROM users WHERE email='emp@e2e.test'")
check "admin sees request"            200 "$(req a GET '/admin/memberships?status=requested')" 'emp@e2e.test'
check "admin approves"                200 "$(req a PATCH /admin/memberships "{\"companyId\":\"$TXC\",\"userId\":\"$EID\",\"decision\":\"approve\"}")" '"status":"active"'
check "me now employer"               200 "$(req e GET /auth/me)" '"isEmployer":true'
check "post without pay"              400 "$(req e POST /jobs "{\"companyId\":\"$TXC\",\"factoryId\":\"$TXF\",\"occupationId\":\"$OCC\"}")"
check "post with wrong factory"       400 "$(req e POST /jobs "{\"companyId\":\"$TXC\",\"factoryId\":\"$CAF\",\"occupationId\":\"$OCC\",\"payMin\":2400,\"payMax\":2900}")"
OUT=$(req e POST /jobs "{\"companyId\":\"$TXC\",\"factoryId\":\"$TXF\",\"occupationId\":\"$OCC\",\"payMin\":2400,\"payMax\":2900,\"shift\":\"2nd\"}")
check "post job"                      201 "$OUT" '"serial":'
JOB=$(printf '%s' "$OUT" | j id)
check "employer dashboard lists job"  200 "$(req e GET /employer)" "\"id\":\"$JOB\""
check "public job list"               200 "$(req anon GET /jobs)" "\"id\":\"$JOB\""
check "public job detail, skills"     200 "$(req anon GET /jobs/$JOB)" '"required":true'
check "job detail shows held skill"   200 "$(req s GET /jobs/$JOB)" '"held":true'
check "apply signed out"              401 "$(req anon POST /jobs/$JOB/apply '{}')"
OUT=$(req s POST /jobs/$JOB/apply '{"note":"Available now"}')
check "apply"                         201 "$OUT" '"status":"applied"'
APP=$(printf '%s' "$OUT" | j id)
check "apply twice"                   409 "$(req s POST /jobs/$JOB/apply '{}')"
check "seeker cannot read applicants" 403 "$(req s GET /jobs/$JOB/applications)"
check "employer reads ranked list"    200 "$(req e GET /jobs/$JOB/applications)" '"heldRequired":1'
check "seeker cannot advance"         403 "$(req s PATCH /jobs/applications/$APP '{"status":"interview"}')"
check "employer advances"             200 "$(req e PATCH /jobs/applications/$APP '{"status":"interview","employerNote":"Call Tuesday"}')" '"status":"interview"'
check "seeker sees interview"         200 "$(req s GET /me/applications)" '"status":"interview"'
check "seeker withdraws"              200 "$(req s PATCH /jobs/applications/$APP '{"status":"withdrawn"}')" '"status":"withdrawn"'
check "no change after withdrawn"     409 "$(req e PATCH /jobs/applications/$APP '{"status":"offer"}')"
check "close job"                     200 "$(req e PATCH /jobs/$JOB '{"status":"closed","closedReason":"filled"}')"
check "closed job hidden from public" 404 "$(req anon GET /jobs/$JOB)"
check "closed job visible to applicant" 200 "$(req s GET /jobs/$JOB)" '"isOpen":false'
check "sign-out"                      200 "$(req s POST /auth/sign-out)"
check "me after sign-out"             200 "$(req s GET /auth/me)" '"user":null'
HDR=$(curl -s -D - -o /dev/null "$API/auth/me" | tr -d '\r' | grep -i '^cache-control' )
case "$HDR" in *no-store*) echo "ok    auth responses are not cacheable";; *) echo "FAIL  cache header: $HDR"; fail=1;; esac
CK=$(grep -c HttpOnly "$D/e" || true); [ "$CK" -ge 1 ] && echo "ok    session cookie is HttpOnly" || { echo "FAIL  cookie not HttpOnly"; fail=1; }
psql "$DB" -qtAc "DELETE FROM users WHERE email LIKE '%@e2e.test'" >/dev/null
rm -rf "$D"
[ $fail -eq 0 ] && echo "ALL PASSED" || echo "SOME FAILED"
exit $fail
