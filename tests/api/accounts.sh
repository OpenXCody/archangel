#!/usr/bin/env bash
# End-to-end check of accounts, memberships, jobs and applications, from
# sign-up through hiring, including the refusals. Prints one line per check
# and exits non-zero if any fail.
#
# LOCAL ONLY: it creates and deletes users, invites and password reset links
# (emails ending @e2e.test) and promotes one to admin directly in the database. For the
# "last admin" check it takes the admin role from any other local admin for a
# moment, and it edits one company's domain and featured flag; both are put
# back on exit, however the script ends. Never point it at production.
#   API=http://localhost:3000/api DB=postgresql://... bash tests/api/accounts.sh
# Needs a running dev API with ADMIN_SECRET unset, seeded data that includes
# Texas and non-Texas factories, and psql, curl and node on the PATH.
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

psql "$DB" -qtAc "DELETE FROM users WHERE email LIKE '%@e2e.test'; DELETE FROM invites WHERE email LIKE '%@e2e.test'" >/dev/null
# Whatever this run borrows from the local database goes back on exit.
OTHER_ADMINS=''; PROFILE_ID=''; PROFILE_DOMAIN=''; PROFILE_FEATURED=''
restore_local() {
  [ -n "$OTHER_ADMINS" ] && psql "$DB" -qtAc "UPDATE users SET is_admin=true WHERE id IN ($OTHER_ADMINS)" >/dev/null
  [ -n "$PROFILE_ID" ] && psql "$DB" -qtAc "UPDATE companies SET domain=NULLIF('$PROFILE_DOMAIN',''), featured='$PROFILE_FEATURED' WHERE id='$PROFILE_ID'" >/dev/null
  return 0
}
trap restore_local EXIT
TXF=$(psql "$DB" -tAc "SELECT id FROM factories WHERE state='TX' AND company_id IS NOT NULL LIMIT 1")
TXC=$(psql "$DB" -tAc "SELECT company_id FROM factories WHERE id='$TXF'")
CAF=$(psql "$DB" -tAc "SELECT id FROM factories WHERE state='CA' AND company_id IS NOT NULL LIMIT 1")
CAC=$(psql "$DB" -tAc "SELECT company_id FROM factories WHERE id='$CAF'")
OCC=$(psql "$DB" -tAc "SELECT occupation_id FROM occupation_skills GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 1")
SK=$(psql "$DB" -tAc "SELECT skill_id FROM occupation_skills WHERE occupation_id='$OCC' AND stage IS DISTINCT FROM 3 ORDER BY skill_id LIMIT 1")

check "me when signed out"            200 "$(req anon GET /auth/me)" '"user":null'
check "sign-up rejects short password" 400 "$(req s POST /auth/sign-up '{"email":"seeker-'"$RUN"'@e2e.test","name":"Sam Seeker","password":"short"}')"
check "sign-up seeker"                201 "$(req s POST /auth/sign-up '{"email":"Seeker-'"$RUN"'@E2E.test","name":"Sam Seeker","password":"correct horse"}')" '"email":"seeker-'"$RUN"'@e2e.test"'
check "sign-up duplicate"             409 "$(req x POST /auth/sign-up '{"email":"seeker-'"$RUN"'@e2e.test","name":"Dup","password":"correct horse"}')"
check "sign-in wrong password"        401 "$(req x POST /auth/sign-in '{"email":"seeker-'"$RUN"'@e2e.test","password":"wrong password"}')"
check "sign-in seeker (new jar)"      200 "$(req s2 POST /auth/sign-in '{"email":"seeker-'"$RUN"'@e2e.test","password":"correct horse"}')" '"isEmployer":false'
check "me requires sign-in"           401 "$(req anon GET /me/skills)"
check "profile update"                200 "$(req s PATCH /me '{"homeZip":"78701","about":"Machinist in training"}')" '"homeZip":"78701"'
check "profile bad zip"               400 "$(req s PATCH /me '{"homeZip":"abc"}')"
check "mark skill held"               200 "$(req s PUT /me/skills/$SK '{"status":"held"}')" '"status":"held"'
check "bad skill status"              400 "$(req s PUT /me/skills/$SK '{"status":"expert"}')"
check "add goal"                      200 "$(req s PUT /me/goals/$OCC)"
check "goals show 1 held"             200 "$(req s GET /me/goals)" '"heldSkills":1'

check "sign-up employer"              201 "$(req e POST /auth/sign-up '{"email":"emp-'"$RUN"'@e2e.test","name":"Erin Employer","password":"correct horse"}')"
check "sign-up admin"                 201 "$(req a POST /auth/sign-up '{"email":"admin-'"$RUN"'@e2e.test","name":"Ada Admin","password":"correct horse"}')"
check "claim-admin without key"       403 "$(req a POST /auth/claim-admin)"
psql "$DB" -qtAc "UPDATE users SET is_admin=true WHERE email='admin-$RUN@e2e.test'" >/dev/null
check "admin overview as admin"       200 "$(req a GET /admin/overview)" '"users":'
check "employer posts before joining" 403 "$(req e POST /jobs "{\"companyId\":\"$TXC\",\"factoryId\":\"$TXF\",\"occupationId\":\"$OCC\",\"payMin\":2400,\"payMax\":2900}")"
check "request membership"            201 "$(req e POST /employer/memberships "{\"companyId\":\"$TXC\"}")" '"status":"requested"'
check "still cannot post (requested)" 403 "$(req e POST /jobs "{\"companyId\":\"$TXC\",\"factoryId\":\"$TXF\",\"occupationId\":\"$OCC\",\"payMin\":2400,\"payMax\":2900}")"
EID=$(psql "$DB" -tAc "SELECT id FROM users WHERE email='emp-$RUN@e2e.test'")
check "admin sees request"            200 "$(req a GET '/admin/memberships?status=requested')" 'emp-'"$RUN"'@e2e.test'
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

# --- Admin Tools: people, company access, invites, data ----------------------
AID=$(sql "SELECT id FROM users WHERE email='admin-$RUN@e2e.test'")
SID=$(sql "SELECT id FROM users WHERE email='seeker-$RUN@e2e.test'")
NOBODY=00000000-0000-4000-8000-000000000000
INV="inv-$RUN@e2e.test"

check "admin routes need sign-in"     401 "$(req anon GET /admin/users)"
# A signed-in person who is not an admin is refused on every admin route.
check "403 list users"                403 "$(req s GET /admin/users)"
check "403 promote"                   403 "$(req s PATCH /admin/users/$SID '{"isAdmin":true}')"
check "403 delete user"               403 "$(req s DELETE /admin/users/$EID)"
check "403 add membership"            403 "$(req s POST /admin/memberships "{\"companyId\":\"$CAC\",\"userId\":\"$SID\"}")"
check "403 list invites"              403 "$(req s GET /admin/invites)"
check "403 create invite"             403 "$(req s POST /admin/invites "{\"email\":\"$INV\",\"role\":\"admin\"}")"
check "403 revoke invite"             403 "$(req s DELETE /admin/invites/$NOBODY)"
check "403 list paths"                403 "$(req s GET '/admin/paths?status=draft')"
check "403 search companies"          403 "$(req s GET '/admin/companies?q=te')"
check "403 edit company"              403 "$(req s PATCH /admin/companies/$TXC '{"featured":true}')"
check "403 overview"                  403 "$(req s GET /admin/overview)"
check "refusals changed nothing"      200 "$(req s GET /auth/me)" '"isAdmin":false'
expect "refused invite was not created" 0 "$(sql "SELECT COUNT(*) FROM invites WHERE email='$INV'")"

OUT=$(req a GET /admin/users)
check "admin lists users"             200 "$OUT" "seeker-$RUN@e2e.test"
check "list shows company roles"      200 "$OUT" '"status":"active"'
OUT=$(req a GET "/admin/users?q=SEEKER-$RUN")
check "search by email"               200 "$OUT" "seeker-$RUN@e2e.test"
expect "search by email finds one"    1 "$(printf '%s' "$OUT" | j users.length)"
OUT=$(req a GET '/admin/users?q=erin%20empl&limit=1')
check "search by name"                200 "$OUT" "emp-$RUN@e2e.test"
expect "search with no match"         0 "$(req a GET '/admin/users?q=no-such-person-%25' | j total)"

check "promote"                       200 "$(req a PATCH /admin/users/$SID '{"isAdmin":true}')" '"isAdmin":true'
check "promoted person is admin"      200 "$(req s GET /admin/overview)" '"users":'
check "cannot demote self"            409 "$(req a PATCH /admin/users/$AID '{"isAdmin":false}')" 'their own admin role'
check "demote"                        200 "$(req a PATCH /admin/users/$SID '{"isAdmin":false}')" '"isAdmin":false'
check "demoted person is refused"     403 "$(req s GET /admin/overview)"
check "promote needs a boolean"       400 "$(req a PATCH /admin/users/$SID '{"isAdmin":"yes"}')"
check "promote unknown person"        404 "$(req a PATCH /admin/users/$NOBODY '{"isAdmin":true}')"
check "promote bad id"                400 "$(req a PATCH /admin/users/not-an-id '{"isAdmin":true}')"
# With every other admin role set aside, the one admin left cannot be removed.
OTHER_ADMINS=$(sql "SELECT string_agg(quote_literal(id::text), ',') FROM users WHERE is_admin AND id <> '$AID'")
[ -n "$OTHER_ADMINS" ] && sql "UPDATE users SET is_admin=false WHERE id IN ($OTHER_ADMINS)" >/dev/null
check "cannot remove the last admin"  409 "$(req a PATCH /admin/users/$AID '{"isAdmin":false}')" 'last admin'
expect "last admin is still admin"    t "$(sql "SELECT is_admin FROM users WHERE id='$AID'")"
restore_local; OTHER_ADMINS=''

check "add membership"                201 "$(req a POST /admin/memberships "{\"companyId\":\"$CAC\",\"userId\":\"$SID\"}")" '"status":"active"'
check "added person is employer"      200 "$(req s GET /auth/me)" '"isEmployer":true'
check "add membership, unknown person" 404 "$(req a POST /admin/memberships "{\"companyId\":\"$CAC\",\"userId\":\"$NOBODY\"}")"
check "remove membership"             200 "$(req a PATCH /admin/memberships "{\"companyId\":\"$CAC\",\"userId\":\"$SID\",\"decision\":\"remove\"}")" '"status":"removed"'
check "removed person is not employer" 200 "$(req s GET /auth/me)" '"isEmployer":false'

check "invite needs an email"         400 "$(req a POST /admin/invites '{"email":"nope","role":"user"}')"
check "invite needs a known role"     400 "$(req a POST /admin/invites "{\"email\":\"$INV\",\"role\":\"owner\"}")"
check "employer invite needs a company" 400 "$(req a POST /admin/invites "{\"email\":\"$INV\",\"role\":\"employer\"}")"
check "no invite for an existing account" 409 "$(req a POST /admin/invites "{\"email\":\"Seeker-$RUN@e2e.test\",\"role\":\"user\"}")"
OUT=$(req a POST /admin/invites "{\"email\":\"$INV\",\"role\":\"user\"}")
check "create invite"                 201 "$OUT" '"path":"/sign-in?invite='
T0=$(printf '%s' "$OUT" | j token)
OUT=$(req a POST /admin/invites "{\"email\":\"INV-$RUN@E2E.test\",\"role\":\"employer\",\"companyId\":\"$TXC\"}")
check "create employer invite"        201 "$OUT" '"role":"employer"'
T1=$(printf '%s' "$OUT" | j token)
check "earlier invite is replaced"    404 "$(req anon GET /auth/invite/$T0)"
expect "one pending invite per email" 1 "$(sql "SELECT COUNT(*) FROM invites WHERE email='$INV' AND accepted_at IS NULL")"
expect "only the token's hash is stored" t "$(sql "SELECT token_hash = encode(sha256('$T1'::bytea), 'hex') FROM invites WHERE email='$INV'")"
check "pending invites list"          200 "$(req a GET /admin/invites)" "\"email\":\"$INV\""
check "invite lookup"                 200 "$(req anon GET /auth/invite/$T1)" "\"email\":\"$INV\",\"role\":\"employer\",\"companyName\":\""
check "invite lookup, unknown token"  404 "$(req anon GET /auth/invite/not-a-token)"
HDR=$(curl -s -D - -o /dev/null "$API/auth/invite/$T1" | tr -d '\r' | grep -i '^cache-control')
case "$HDR" in *no-store*) echo "ok    invite lookup is not cacheable";; *) echo "FAIL  invite cache header: $HDR"; fail=1;; esac
check "invite sign-up, wrong email"   400 "$(req w POST /auth/sign-up "{\"email\":\"wrong-$RUN@e2e.test\",\"name\":\"Wrong\",\"password\":\"correct horse\",\"invite\":\"$T1\"}")" 'different email'
check "invite sign-up, bad token"     400 "$(req w POST /auth/sign-up "{\"email\":\"wrong-$RUN@e2e.test\",\"name\":\"Wrong\",\"password\":\"correct horse\",\"invite\":\"not-a-token\"}")"
expect "failed sign-ups made no account" 0 "$(sql "SELECT COUNT(*) FROM users WHERE email='wrong-$RUN@e2e.test'")"
check "wrong email left the invite usable" 200 "$(req anon GET /auth/invite/$T1)"
check "invite sign-up applies the role" 201 "$(req i POST /auth/sign-up "{\"email\":\"Inv-$RUN@E2E.test\",\"name\":\"Ivy Invited\",\"password\":\"correct horse\",\"invite\":\"$T1\"}")" '"isEmployer":true'
IID=$(sql "SELECT id FROM users WHERE email='$INV'")
expect "invited membership is active" active "$(sql "SELECT status FROM company_members WHERE user_id='$IID' AND company_id='$TXC'")"
expect "invite is marked accepted"    t "$(sql "SELECT accepted_at IS NOT NULL AND accepted_by='$IID' FROM invites WHERE email='$INV'")"
check "invite cannot be used twice"   400 "$(req w POST /auth/sign-up "{\"email\":\"wrong-$RUN@e2e.test\",\"name\":\"Wrong\",\"password\":\"correct horse\",\"invite\":\"$T1\"}")"
check "used invite, same email again" 400 "$(req w POST /auth/sign-up "{\"email\":\"$INV\",\"name\":\"Ivy Again\",\"password\":\"correct horse\",\"invite\":\"$T1\"}")"
check "used invite is not found"      404 "$(req anon GET /auth/invite/$T1)"
OUT=$(req a GET /admin/invites)
expect "accepted invite is not listed" 0 "$(printf '%s' "$OUT" | grep -c "\"email\":\"$INV\"")"
expect "accepted invites are counted" 1 "$(printf '%s' "$OUT" | j 'accepted >= 1 ? 1 : 0')"
OUT=$(req a POST /admin/invites "{\"email\":\"adm2-$RUN@e2e.test\",\"role\":\"admin\"}")
T2=$(printf '%s' "$OUT" | j token)
check "admin invite sign-up"          201 "$(req i2 POST /auth/sign-up "{\"email\":\"adm2-$RUN@e2e.test\",\"name\":\"Ana Admin\",\"password\":\"correct horse\",\"invite\":\"$T2\"}")" '"isAdmin":true'
check "invited admin is admin"        200 "$(req i2 GET /admin/overview)" '"users":'
OUT=$(req a POST /admin/invites "{\"email\":\"rev-$RUN@e2e.test\",\"role\":\"user\"}")
T3=$(printf '%s' "$OUT" | j token); ID3=$(printf '%s' "$OUT" | j invite.id)
check "revoke"                        200 "$(req a DELETE /admin/invites/$ID3)"
check "revoked invite is not found"   404 "$(req anon GET /auth/invite/$T3)"
check "revoked invite cannot sign up" 400 "$(req w POST /auth/sign-up "{\"email\":\"rev-$RUN@e2e.test\",\"name\":\"Rev\",\"password\":\"correct horse\",\"invite\":\"$T3\"}")"
expect "revoked sign-up made no account" 0 "$(sql "SELECT COUNT(*) FROM users WHERE email='rev-$RUN@e2e.test'")"
check "revoke twice"                  404 "$(req a DELETE /admin/invites/$ID3)"
OUT=$(req a POST /admin/invites "{\"email\":\"old-$RUN@e2e.test\",\"role\":\"user\"}")
T4=$(printf '%s' "$OUT" | j token)
sql "UPDATE invites SET expires_at = now() - interval '2 days' WHERE email='old-$RUN@e2e.test'" >/dev/null
check "expired invite is not found"   404 "$(req anon GET /auth/invite/$T4)"
expect "expired invite is not listed" 0 "$(req a GET /admin/invites | grep -c "old-$RUN@e2e.test")"

# --- Passwords: a person changes their own; an admin's link resets one -------
SEEKER="seeker-$RUN@e2e.test"
signin() { printf '{"email":"%s","password":"%s"}' "$SEEKER" "$1"; }
resetlink() { req a POST /admin/users/$1/reset-link; }
sessions() { sql "SELECT COUNT(*) FROM sessions WHERE user_id='$SID'"; }

check "change password needs sign-in" 401 "$(req anon POST /auth/password '{"current":"correct horse","next":"battery staple"}')"
check "change password, wrong current" 400 "$(req s POST /auth/password '{"current":"not my password","next":"battery staple"}')" 'not your current password'
check "change password, no current"   400 "$(req s POST /auth/password '{"next":"battery staple"}')"
check "change password, short new"    400 "$(req s POST /auth/password '{"current":"correct horse","next":"short"}')" 'at least 8'
check "refusals kept the password"    200 "$(req p POST /auth/sign-in "$(signin 'correct horse')")"
expect "three sessions before the change" 3 "$(sessions)"
OUT=$(req s POST /auth/password '{"current":"correct horse","next":"battery staple"}')
check "change password"               200 "$OUT" '"ok":true'
expect "change returns no hash"       0 "$(printf '%s' "$OUT" | grep -ci 'hash\|scrypt')"
check "current session is kept"       200 "$(req s GET /auth/me)" "\"email\":\"$SEEKER\""
check "other session is ended"        200 "$(req s2 GET /auth/me)" '"user":null'
check "other session is ended (2)"    200 "$(req p GET /auth/me)" '"user":null'
expect "one session after the change" 1 "$(sessions)"
check "old password no longer signs in" 401 "$(req s2 POST /auth/sign-in "$(signin 'correct horse')")"
check "new password signs in"         200 "$(req s2 POST /auth/sign-in "$(signin 'battery staple')")" '"isEmployer":false'

check "reset link needs sign-in"      401 "$(req anon POST /admin/users/$SID/reset-link)"
check "403 reset link"                403 "$(req s POST /admin/users/$EID/reset-link)"
expect "refused reset link was not created" 0 "$(sql "SELECT COUNT(*) FROM password_resets WHERE user_id='$EID'")"
check "reset link, unknown person"    404 "$(resetlink $NOBODY)"
check "reset link, bad id"            400 "$(resetlink not-an-id)"
OUT=$(resetlink $SID)
check "create reset link"             201 "$OUT" '"link":"/sign-in?reset='
check "reset link says when it expires" 201 "$OUT" '"expiresAt":"'
expect "reset link returns no hash"   0 "$(printf '%s' "$OUT" | grep -ci 'hash')"
R0=$(printf '%s' "$OUT" | j 'link.split("reset=")[1]')
expect "reset link lasts 24 hours"    t "$(sql "SELECT expires_at - created_at BETWEEN interval '23 hours 59 minutes' AND interval '24 hours 1 minute' FROM password_resets WHERE user_id='$SID'")"
check "reset lookup"                  200 "$(req anon GET /auth/reset/$R0)" "{\"email\":\"$SEEKER\"}"
R1=$(resetlink $SID | j 'link.split("reset=")[1]')
check "new link replaces the old one" 404 "$(req anon GET /auth/reset/$R0)"
check "replaced link sets no password" 400 "$(req anon POST /auth/reset "{\"token\":\"$R0\",\"password\":\"reset password\"}")" 'not valid'
expect "one unused link per person"   1 "$(sql "SELECT COUNT(*) FROM password_resets WHERE user_id='$SID' AND used_at IS NULL")"
expect "only the reset token's hash is stored" t "$(sql "SELECT token_hash = encode(sha256('$R1'::bytea), 'hex') FROM password_resets WHERE user_id='$SID'")"
check "reset lookup, unknown token"   404 "$(req anon GET /auth/reset/not-a-token)"
HDR=$(curl -s -D - -o /dev/null "$API/auth/reset/$R1" | tr -d '\r' | grep -i '^cache-control')
case "$HDR" in *no-store*) echo "ok    reset lookup is not cacheable";; *) echo "FAIL  reset cache header: $HDR"; fail=1;; esac
check "reset without a token"         400 "$(req anon POST /auth/reset '{"password":"reset password"}')"
check "reset, short password"         400 "$(req anon POST /auth/reset "{\"token\":\"$R1\",\"password\":\"short\"}")" 'at least 8'
check "short password left the link usable" 200 "$(req anon GET /auth/reset/$R1)"
expect "two sessions before the reset" 2 "$(sessions)"
OUT=$(req r POST /auth/reset "{\"token\":\"$R1\",\"password\":\"reset password\"}")
check "reset sets the password and signs in" 200 "$OUT" "\"email\":\"$SEEKER\""
expect "reset returns no hash"        0 "$(printf '%s' "$OUT" | grep -ci 'hash\|scrypt')"
check "reset session is signed in"    200 "$(req r GET /auth/me)" "\"email\":\"$SEEKER\""
check "reset ended every earlier session" 200 "$(req s GET /auth/me)" '"user":null'
check "reset ended every earlier session (2)" 200 "$(req s2 GET /auth/me)" '"user":null'
expect "only the new session is left" 1 "$(sessions)"
expect "reset link is marked used"    t "$(sql "SELECT used_at IS NOT NULL FROM password_resets WHERE user_id='$SID'")"
check "used link is not found"        404 "$(req anon GET /auth/reset/$R1)"
check "used link cannot be used twice" 400 "$(req w POST /auth/reset "{\"token\":\"$R1\",\"password\":\"second password\"}")" 'not valid'
check "second use changed nothing"    401 "$(req w POST /auth/sign-in "$(signin 'second password')")"
check "password before the reset no longer signs in" 401 "$(req s POST /auth/sign-in "$(signin 'battery staple')")"
check "reset password signs in"       200 "$(req s POST /auth/sign-in "$(signin 'reset password')")" '"isEmployer":false'
R2=$(resetlink $SID | j 'link.split("reset=")[1]')
sql "UPDATE password_resets SET expires_at = now() - interval '1 hour' WHERE user_id='$SID' AND used_at IS NULL" >/dev/null
check "expired link is not found"     404 "$(req anon GET /auth/reset/$R2)"
check "expired link sets no password" 400 "$(req w POST /auth/reset "{\"token\":\"$R2\",\"password\":\"expired password\"}")" 'not valid'
check "expired link changed nothing"  200 "$(req s GET /auth/me)" "\"email\":\"$SEEKER\""
R3=$(resetlink $SID | j 'link.split("reset=")[1]')
check "change password with a link pending" 200 "$(req s POST /auth/password '{"current":"reset password","next":"correct horse"}')"
check "changing the password retires the link" 404 "$(req anon GET /auth/reset/$R3)"

check "cannot delete self"            409 "$(req a DELETE /admin/users/$AID)" 'their own account'
check "delete user"                   200 "$(req a DELETE /admin/users/$IID)"
check "deleted user is signed out"    200 "$(req i GET /auth/me)" '"user":null'
expect "deleted user's rows are gone" 0 "$(sql "SELECT (SELECT COUNT(*) FROM company_members WHERE user_id='$IID') + (SELECT COUNT(*) FROM sessions WHERE user_id='$IID')")"
check "delete user twice"             404 "$(req a DELETE /admin/users/$IID)"

check "draft career paths"            200 "$(req a GET '/admin/paths?status=draft')" '"paths":\['
PROFILE_ID=$TXC
PROFILE_DOMAIN=$(sql "SELECT COALESCE(domain,'') FROM companies WHERE id='$TXC'")
PROFILE_FEATURED=$(sql "SELECT featured FROM companies WHERE id='$TXC'")
TERM=$(node -e 'console.log(encodeURIComponent(process.argv[1].slice(0, 4)))' "$(sql "SELECT name FROM companies WHERE id='$TXC'")")
check "company search"                200 "$(req a GET "/admin/companies?q=$TERM")" '"featured":'
check "domain with a scheme"          400 "$(req a PATCH /admin/companies/$TXC '{"domain":"https://example.com/about"}')"
check "domain with a path"            400 "$(req a PATCH /admin/companies/$TXC '{"domain":"example.com/about"}')"
check "empty company change"          400 "$(req a PATCH /admin/companies/$TXC '{}')"
check "set domain and featured"       200 "$(req a PATCH /admin/companies/$TXC '{"domain":" Example-E2E.com ","featured":true}')" '"domain":"example-e2e.com","featured":true'
check "clear domain"                  200 "$(req a PATCH /admin/companies/$TXC '{"domain":null,"featured":false}')" '"domain":null,"featured":false'
check "edit unknown company"          404 "$(req a PATCH /admin/companies/$NOBODY '{"featured":true}')"
restore_local; PROFILE_ID=''

check "sign-out"                      200 "$(req s POST /auth/sign-out)"
check "me after sign-out"             200 "$(req s GET /auth/me)" '"user":null'
HDR=$(curl -s -D - -o /dev/null "$API/auth/me" | tr -d '\r' | grep -i '^cache-control' )
case "$HDR" in *no-store*) echo "ok    auth responses are not cacheable";; *) echo "FAIL  cache header: $HDR"; fail=1;; esac
CK=$(grep -c HttpOnly "$D/e" || true); [ "$CK" -ge 1 ] && echo "ok    session cookie is HttpOnly" || { echo "FAIL  cookie not HttpOnly"; fail=1; }
psql "$DB" -qtAc "DELETE FROM users WHERE email LIKE '%@e2e.test'; DELETE FROM invites WHERE email LIKE '%@e2e.test'" >/dev/null
rm -rf "$D"
[ $fail -eq 0 ] && echo "ALL PASSED" || echo "SOME FAILED"
exit $fail
