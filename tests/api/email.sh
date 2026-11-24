#!/usr/bin/env bash
# End-to-end check of what the app tells people: the emails (to the right
# people, with working links, and to nobody else), the limits that keep them
# from flooding anyone, the record a declined access request leaves, an
# application's history, and the "news" behind the header's dot. Prints one
# line per check and exits non-zero if any fail.
#
# The API under test must be capturing email instead of sending it: start it
# with EMAIL_OUTBOX=<file>, and give this script the same file as OUTBOX. If
# the API was started with APP_URL, give this script the same value. Nothing
# is ever sent to a real address.
#
# LOCAL ONLY: it creates and deletes users and invites (emails ending
# @email.test), makes some of them admins or company members directly in the
# database, posts a job, sets one company's domain for a moment, moves a few
# of its own rows back in time, and re-runs the idempotent migration 0024 to
# check its backfill. Everything it made is removed on exit, however the
# script ends. Never point it at production.
#   API=http://localhost:3000/api DB=postgresql://... OUTBOX=/path/outbox.jsonl APP_URL=http://localhost:5173 bash tests/api/email.sh
# Needs a running dev API with seeded data (four companies, one with a
# factory, and a career with skills), and psql, curl, node and npx on the PATH.
set -u
. "$(dirname "$0")/lib.sh"
OUTBOX=${OUTBOX:-}
[ -n "$OUTBOX" ] || { echo "Set OUTBOX to the file the API was started with as EMAIL_OUTBOX."; exit 2; }
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
D=$(mktemp -d)
# A fresh address per run, so repeat runs do not trip the sign-in throttle.
RUN=$(date +%s)
addr() { printf '%s-%s@email.test' "$1" "$RUN"; }
uid() { sql "SELECT id FROM users WHERE email='$(addr "$1")'"; }

# --- The outbox: what the API would have sent during this run ------------------
touch "$OUTBOX" 2>/dev/null || { echo "Cannot write $OUTBOX."; exit 2; }
START=$(wc -l < "$OUTBOX")
# mail <jar-or-address> <subject part> [js expression on the last match `m`]
# Without an expression: how many captured emails to that person have that
# subject. With one: its value for the last such email ("" when there is none).
mail() {
  local to=$1; case "$to" in *@*) ;; *) to=$(addr "$to");; esac
  tail -n +"$((START + 1))" "$OUTBOX" | node -e '
    const [to, part, expr] = process.argv.slice(1);
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const all = s.split("\n").filter(Boolean).map((line) => JSON.parse(line));
      const hits = all.filter((m) => m.to === to && m.subject.includes(part));
      if (!expr) return console.log(hits.length);
      const m = hits[hits.length - 1];
      console.log(m ? eval(expr) : "");
    });' "$to" "$2" "${3:-}"
}
# The address the email's one action opens: the line after the "Label:" line.
LINK='m.text.match(/:\n(https?:\/\/\S+)/)[1]'
TOKEN='decodeURIComponent(m.text.match(/[?&](?:invite|reset)=([^\s&]+)/)[1])'
sent_total() { echo $(( $(wc -l < "$OUTBOX") - START )); }

PROFILE_ID=''; PROFILE_DOMAIN=''
cleanup() {
  # The audit lines this run's admin caused, while the account still names them.
  psql "$DB" -qtAc "DELETE FROM audit_log WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%@email.test')" >/dev/null
  # Jobs first: a job outlives the person who posted it. Memberships, applications,
  # their history and the notice limits go with the people and the job.
  psql "$DB" -qtAc "DELETE FROM jobs WHERE created_by IN (SELECT id FROM users WHERE email LIKE '%@email.test');
    DELETE FROM users WHERE email LIKE '%@email.test'; DELETE FROM invites WHERE email LIKE '%@email.test'" >/dev/null
  [ -n "$PROFILE_ID" ] && psql "$DB" -qtAc "UPDATE companies SET domain=NULLIF('$PROFILE_DOMAIN','') WHERE id='$PROFILE_ID'" >/dev/null
  rm -rf "$D"
}
trap cleanup EXIT
psql "$DB" -qtAc "DELETE FROM jobs WHERE created_by IN (SELECT id FROM users WHERE email LIKE '%@email.test'); DELETE FROM users WHERE email LIKE '%@email.test'; DELETE FROM invites WHERE email LIKE '%@email.test'" >/dev/null

# A company with a factory (CA), three more companies, and a career.
FA=$(sql "SELECT id FROM factories WHERE company_id IS NOT NULL ORDER BY id LIMIT 1")
CA=$(sql "SELECT company_id FROM factories WHERE id='$FA'")
CANAME=$(sql "SELECT name FROM companies WHERE id='$CA'")
# Companies a person can ask to join: a military service is not one (a request for it answers 400).
CB=$(sql "SELECT id FROM companies WHERE id <> '$CA' AND service IS NULL ORDER BY id LIMIT 1 OFFSET 0")
CC=$(sql "SELECT id FROM companies WHERE id <> '$CA' AND service IS NULL ORDER BY id LIMIT 1 OFFSET 1")
CD=$(sql "SELECT id FROM companies WHERE id <> '$CA' AND service IS NULL ORDER BY id LIMIT 1 OFFSET 2")
# The civilian career with the most skills: a job is for a civilian career.
OCC=$(sql "SELECT os.occupation_id FROM occupation_skills os INNER JOIN occupations o ON o.id = os.occupation_id WHERE o.service_company_id IS NULL GROUP BY 1 ORDER BY COUNT(*) DESC, 1 LIMIT 1")
R1=$(sql "SELECT id FROM skills ORDER BY name, id LIMIT 1 OFFSET 0")
R2=$(sql "SELECT id FROM skills ORDER BY name, id LIMIT 1 OFFSET 1")
# Every link in an email starts here: the API's APP_URL, or its default.
APP_URL=${APP_URL:-https://www.o-10.com}; APP_URL=${APP_URL%/}

signup() { # jar name -> signs up <jar>-$RUN@email.test
  check "sign-up $1" 201 "$(req "$1" POST /auth/sign-up "{\"email\":\"$(addr "$1")\",\"name\":\"$2\",\"password\":\"correct horse\"}")"
}
signup adm "Ada Admin"; signup adm2 "Quinn Quiet-Admin"
signup emp "Erin Employer"; signup emp2 "Eli Employer"; signup emp3 "Quinn Quiet-Employer"
signup s1 "Sam Seeker"; signup s2 "Quinn Quiet-Seeker"; signup s3 "Nat New"; signup s4 "Lou Late"
signup r "Rae Requester"; signup r2 "Rob Requester"; signup r3 "Quinn Quiet-Requester"; signup r4 "Max Many"
sql "UPDATE users SET is_admin=true WHERE email IN ('$(addr adm)', '$(addr adm2)')" >/dev/null
ADM=$(uid adm)

# --- Mail on and off ------------------------------------------------------------
check "options say mail is on"        200 "$(req anon GET /auth/options)" '"email":true'
HDR=$(curl -s -D - -o /dev/null "$API/auth/options" | tr -d '\r' | grep -i '^cache-control')
case "$HDR" in *no-store*) echo "ok    options are not cacheable";; *) echo "FAIL  options cache header: $HDR"; fail=1;; esac
# A one-off process with nothing configured: mail is off and sending does nothing.
one_off() { (cd "$ROOT" && env -u EMAIL_OUTBOX -u RESEND_API_KEY -u EMAIL_FROM "$@" npx tsx -e "import('$ROOT/server/lib/email.ts').then(async (m) => { const r = process.env.SEND ? JSON.stringify(await m.sendEmail({ to: 'off-$RUN@email.test', subject: 'Never sent', text: 'x' })) : ''; console.log(m.emailEnabled() + ' ' + r); })" 2>&1 | tail -n1); }
expect "nothing configured: mail is off, send does nothing" 'false {"sent":false,"reason":"off"}' "$(one_off SEND=1)"
expect "an outbox is ignored in production" 'false {"sent":false,"reason":"off"}' "$(one_off SEND=1 NODE_ENV=production EMAIL_OUTBOX="$OUTBOX")"
expect "a key without a sender is not enough" 'false ' "$(one_off RESEND_API_KEY=re_test)"
expect "a key and a sender turn mail on" 'true ' "$(one_off RESEND_API_KEY=re_test EMAIL_FROM='Archangel <no-reply@email.test>')"
expect "an outbox turns mail on outside production" 'true ' "$(one_off EMAIL_OUTBOX="$D/unused.jsonl")"
expect "the off sends reached no outbox" 0 "$(mail "off-$RUN@email.test" 'Never sent')"

# --- Notices can be turned off; sign-in emails cannot ---------------------------
check "notices are on by default"     200 "$(req s1 GET /auth/me)" '"emailNotices":true'
check "notices need a boolean"        400 "$(req s2 PATCH /me '{"emailNotices":"no"}')"
for jar in adm2 emp3 s2 r3; do
  check "$jar turns notices off"      200 "$(req $jar PATCH /me '{"emailNotices":false}')" '"emailNotices":false'
done
check "the choice is kept"            200 "$(req s2 GET /auth/me)" '"emailNotices":false'
check "a profile edit leaves it"      200 "$(req s2 PATCH /me '{"homeZip":"78701"}')" '"emailNotices":false'

# --- Invite ---------------------------------------------------------------------
INV=$(addr inv)
OUT=$(req adm POST /admin/invites "{\"email\":\"$INV\",\"role\":\"employer\",\"companyId\":\"$CB\"}")
check "create invite, emailed"        201 "$OUT" '"emailed":true'
T=$(printf '%s' "$OUT" | j token)
expect "invite email to the invited address" 1 "$(mail "$INV" 'Your invite to Archangel')"
expect "invite email went to nobody else" 1 "$(tail -n +"$((START + 1))" "$OUTBOX" | grep -c '"kind":"invite"')"
expect "invite link is built from APP_URL" "$APP_URL/sign-in?invite=$T" "$(mail "$INV" 'Your invite' "$LINK")"
expect "invite email has the same link in HTML" true "$(mail "$INV" 'Your invite' "m.html.includes('href=\"' + $LINK.replace(/&/g, '&#38;') + '\"')")"
expect "invite email says why, and is not a notice" 'true false' "$(mail "$INV" 'Your invite' "m.text.includes('You got this email because') + ' ' + m.text.includes('turn them off')")"
check "the emailed invite opens"      200 "$(req anon GET "/auth/invite/$(mail "$INV" 'Your invite' "$TOKEN")")" "\"email\":\"$INV\""
check "sign-up through the emailed invite" 201 "$(req inv POST /auth/sign-up "{\"email\":\"$INV\",\"name\":\"Ivy Invited\",\"password\":\"correct horse\",\"invite\":\"$(mail "$INV" 'Your invite' "$TOKEN")\"}")" '"isEmployer":true'

# --- Forgot password ------------------------------------------------------------
forgot() { req anon POST /auth/forgot "{\"email\":\"$1\"}"; }
KNOWN=$(forgot "$(addr s1)"); UNKNOWN=$(forgot "$(addr nobody)")
check "forgot, known address"         200 "$KNOWN" '"ok":true'
case "$KNOWN" in *'"error"'*429*) echo "      (too many reset emails asked for from this machine in ten minutes: restart the API or wait, then run again)";; esac
expect "forgot answers the same for an unknown address" "$KNOWN" "$UNKNOWN"
check "forgot needs an address"       400 "$(forgot 'not-an-address')"
check "forgot is transactional: sent with notices off" 200 "$(forgot "$(addr s2)")"
check "forgot twice in a moment"      200 "$(forgot "$(addr s2)")"
sleep 1 # the answer does not wait for the email
expect "reset email to the known address" 1 "$(mail s1 'Your Archangel reset link')"
expect "no email to the unknown address" 0 "$(mail nobody '')"
expect "one reset email for two requests in a moment" 1 "$(mail s2 'Your Archangel reset link')"
expect "reset link is built from APP_URL" "$APP_URL/sign-in?reset=" "$(mail s1 'reset link' "$LINK.split('reset=')[0] + 'reset='")"
expect "reset email is not a notice"  false "$(mail s1 'reset link' "m.text.includes('turn them off')")"
S1=$(uid s1)
expect "self-service link: nobody made it, 24 hours" t "$(sql "SELECT created_by IS NULL AND expires_at - created_at BETWEEN interval '23 hours 59 minutes' AND interval '24 hours 1 minute' FROM password_resets WHERE user_id='$S1'")"
RT=$(mail s1 'reset link' "$TOKEN")
expect "only the token's hash is stored" t "$(sql "SELECT token_hash = encode(sha256('$RT'::bytea), 'hex') FROM password_resets WHERE user_id='$S1'")"
check "the emailed reset link opens"  200 "$(req anon GET /auth/reset/$RT)" "\"email\":\"$(addr s1)\""
check "the emailed link sets the password" 200 "$(req s1 POST /auth/reset "{\"token\":\"$RT\",\"password\":\"emailed password\"}")" "\"email\":\"$(addr s1)\""
check "the emailed link works once"   400 "$(req anon POST /auth/reset "{\"token\":\"$RT\",\"password\":\"second password\"}")" 'not valid'
check "the new password signs in"     200 "$(req s1 POST /auth/sign-in "{\"email\":\"$(addr s1)\",\"password\":\"emailed password\"}")"
# A later request replaces the unused link.
S2T=$(mail s2 'reset link' "$TOKEN")
sql "UPDATE password_resets SET created_at = created_at - interval '5 minutes' WHERE user_id='$(uid s2)'" >/dev/null
check "forgot again, later"           200 "$(forgot "$(addr s2)")"
sleep 1
expect "a later request sends a new email" 2 "$(mail s2 'Your Archangel reset link')"
check "the earlier link is replaced"  404 "$(req anon GET /auth/reset/$S2T)"
check "the new link opens"            200 "$(req anon GET "/auth/reset/$(mail s2 'reset link' "$TOKEN")")"
# Throttled like sign-in: ten tries per visitor and address.
for i in 1 2 3 4 5 6 7 8 9 10; do forgot "$(addr throttled)" >/dev/null; done
check "the eleventh request for one address" 429 "$(forgot "$(addr throttled)")"
check "another address is not held back" 200 "$(forgot "$(addr nobody2)")"

# --- A reset link made by an admin is emailed too --------------------------------
OUT=$(req adm POST /admin/users/$(uid s3)/reset-link)
check "admin reset link, emailed"     201 "$OUT" '"emailed":true'
expect "admin's link reaches the person" "$(printf '%s' "$OUT" | j 'link.split("reset=")[1]')" "$(mail s3 'Your Archangel reset link' "$TOKEN")"
expect "it says an admin made it"     true "$(mail s3 'reset link' "m.text.includes('an Archangel admin made a reset link')")"

# --- Company access ---------------------------------------------------------------
PROFILE_ID=$CA; PROFILE_DOMAIN=$(sql "SELECT COALESCE(domain,'') FROM companies WHERE id='$CA'")
sql "UPDATE companies SET domain='email.test' WHERE id='$CA'" >/dev/null
R=$(uid r)
check "admin has no news yet"         200 "$(req adm GET /me/news)" '"access":false'
check "request access"                201 "$(req r POST /employer/memberships "{\"companyId\":\"$CA\"}")" '"status":"requested"'
expect "the admin is emailed"         1 "$(mail adm "Access request for $CANAME")"
expect "an admin with notices off is not" 0 "$(mail adm2 'Access request')"
expect "the requester is not"         0 "$(mail r '')"
expect "request email names the person" true "$(mail adm 'Access request' "m.text.includes('Rae Requester ($(addr r))')")"
expect "request email links to the requests" "$APP_URL/admin/access" "$(mail adm 'Access request' "$LINK")"
expect "request email says where to turn it off" true "$(mail adm 'Access request' "m.text.includes('turn them off in settings: $APP_URL/settings')")"
check "asking twice is one request"   201 "$(req r POST /employer/memberships "{\"companyId\":\"$CA\"}")" '"status":"requested"'
expect "and one email"                1 "$(mail adm 'Access request')"
check "admin now has news"            200 "$(req adm GET /me/news)" '"access":true'
check "so does the quiet admin"       200 "$(req adm2 GET /me/news)" '"access":true'
check "a seeker has none"             200 "$(req s3 GET /me/news)" '"applications":false,"applicants":false,"access":false'
OUT=$(req adm GET '/admin/memberships?status=requested')
check "the request shows the address's domain" 200 "$OUT" '"emailDomain":"email.test"'
expect "marked as the company's own, with its member count" "email.test true $(sql "SELECT COUNT(*) FROM company_members WHERE company_id='$CA' AND status='active'")" "$(printf '%s' "$OUT" | j "memberships.filter((m) => m.userId === '$R').map((m) => [m.companyDomain, m.domainMatches, m.activeMembers].join(' '))[0]")"
check "seen needs to say what"        400 "$(req adm POST /me/seen '{}')"
check "opening the requests clears the news" 200 "$(req adm POST /me/seen '{"access":true}')" '"access":false'
check "it stays cleared"              200 "$(req adm GET /me/news)" '"access":false'
check "not for the other admin"       200 "$(req adm2 GET /me/news)" '"access":true'
check "news needs sign-in"            401 "$(req anon GET /me/news)"
HDR=$(curl -s -D - -o /dev/null "$API/me/news" | tr -d '\r' | grep -i '^cache-control')
case "$HDR" in *no-store*) echo "ok    news is not cacheable";; *) echo "FAIL  news cache header: $HDR"; fail=1;; esac

# Declined: the record is kept.
check "a seeker cannot decline"       403 "$(req s3 PATCH /admin/memberships "{\"companyId\":\"$CA\",\"userId\":\"$R\",\"decision\":\"decline\"}")"
check "decline"                       200 "$(req adm PATCH /admin/memberships "{\"companyId\":\"$CA\",\"userId\":\"$R\",\"decision\":\"decline\"}")" '"status":"declined"'
expect "the row is kept, with when and by whom" "declined|true|$ADM" "$(sql "SELECT status || '|' || (decided_at > now() - interval '1 minute') || '|' || decided_by FROM company_members WHERE company_id='$CA' AND user_id='$R'")"
expect "the requester is told"        1 "$(mail r "Your request to join $CANAME was declined")"
expect "decline email links to the employer page" "$APP_URL/employer" "$(mail r 'was declined' "$LINK")"
expect "the admin is not emailed about their own decision" 0 "$(mail adm 'was declined')"
check "declining twice finds no request" 404 "$(req adm PATCH /admin/memberships "{\"companyId\":\"$CA\",\"userId\":\"$R\",\"decision\":\"decline\"}")"
OUT=$(req r GET /employer)
check "the employer page says declined" 200 "$OUT" '"status":"declined"'
expect "and when to ask again: 7 days on" t "$(sql "SELECT '$(printf '%s' "$OUT" | j 'companies[0].askAgainAt')'::timestamptz - decided_at = interval '7 days' FROM company_members WHERE company_id='$CA' AND user_id='$R'")"
check "a declined person is not an employer" 200 "$(req r GET /auth/me)" '"isEmployer":false'
check "asking again within 7 days is refused" 409 "$(req r POST /employer/memberships "{\"companyId\":\"$CA\"}")" 'was declined'
check "the record is not the person's to remove" 200 "$(req r DELETE /employer/memberships/$CA)"
expect "it is still there"            declined "$(sql "SELECT status FROM company_members WHERE company_id='$CA' AND user_id='$R'")"
expect "a refused request emails nobody" 1 "$(mail adm 'Access request')"
check "declined list"                 200 "$(req adm GET '/admin/memberships?status=declined')" "\"userEmail\":\"$(addr r)\""
expect "a declined request is not waiting" 0 "$(req adm GET '/admin/memberships?status=requested' | grep -c "$(addr r)")"
check "another company can still be asked" 201 "$(req r POST /employer/memberships "{\"companyId\":\"$CB\"}")" '"status":"requested"'
check "and that request can be cancelled" 200 "$(req r DELETE /employer/memberships/$CB)"
expect "cancelled request is gone"    0 "$(sql "SELECT COUNT(*) FROM company_members WHERE company_id='$CB' AND user_id='$R'")"
# Six days on: still refused. Eight days on: a new request, and the admins are told again.
sql "UPDATE company_members SET decided_at = now() - interval '6 days 23 hours' WHERE company_id='$CA' AND user_id='$R'" >/dev/null
check "day 6: still refused"          409 "$(req r POST /employer/memberships "{\"companyId\":\"$CA\"}")"
sql "UPDATE company_members SET decided_at = now() - interval '7 days 1 hour' WHERE company_id='$CA' AND user_id='$R'" >/dev/null
check "after 7 days: asked again"     201 "$(req r POST /employer/memberships "{\"companyId\":\"$CA\"}")" '"status":"requested"'
expect "the row is a fresh request"   "requested|true|true" "$(sql "SELECT status || '|' || (decided_at IS NULL) || '|' || (created_at > (now() AT TIME ZONE 'UTC') - interval '1 minute') FROM company_members WHERE company_id='$CA' AND user_id='$R'")"
expect "the admin is emailed again"   3 "$(mail adm 'Access request')"
check "which is news again"           200 "$(req adm GET /me/news)" '"access":true'
# Approve after all.
check "decline again"                 200 "$(req adm PATCH /admin/memberships "{\"companyId\":\"$CA\",\"userId\":\"$R\",\"decision\":\"decline\"}")"
check "approve after all"             200 "$(req adm PATCH /admin/memberships "{\"companyId\":\"$CA\",\"userId\":\"$R\",\"decision\":\"approve\"}")" '"status":"active"'
expect "approval email"               1 "$(mail r "You can now post jobs for $CANAME")"
expect "approval email links to the employer page" "$APP_URL/employer" "$(mail r 'You can now post jobs' "$LINK")"
check "approving twice sends nothing more" 200 "$(req adm PATCH /admin/memberships "{\"companyId\":\"$CA\",\"userId\":\"$R\",\"decision\":\"approve\"}")" '"status":"active"'
expect "one approval email"           1 "$(mail r 'You can now post jobs')"
check "approved person is an employer" 200 "$(req r GET /auth/me)" '"isEmployer":true'
check "approve with no request"       404 "$(req adm PATCH /admin/memberships "{\"companyId\":\"$CD\",\"userId\":\"$R\",\"decision\":\"approve\"}")"
# A declined person can still be added directly; a decline older than 30 days leaves the list.
REQ2=$(uid r2)
check "r2 requests"                   201 "$(req r2 POST /employer/memberships "{\"companyId\":\"$CB\"}")"
check "r2 is declined"                200 "$(req adm PATCH /admin/memberships "{\"companyId\":\"$CB\",\"userId\":\"$REQ2\",\"decision\":\"decline\"}")"
sql "UPDATE company_members SET decided_at = now() - interval '31 days' WHERE company_id='$CB' AND user_id='$REQ2'" >/dev/null
expect "an old decline is not listed" 0 "$(req adm GET '/admin/memberships?status=declined' | grep -c "$(addr r2)")"
check "an admin adds the declined person directly" 201 "$(req adm POST /admin/memberships "{\"companyId\":\"$CB\",\"userId\":\"$REQ2\"}")" '"status":"active"'
expect "who is told"                  1 "$(mail r2 'You can now post jobs')"
check "adding again sends nothing more" 201 "$(req adm POST /admin/memberships "{\"companyId\":\"$CB\",\"userId\":\"$REQ2\"}")"
expect "one email for the direct add" 1 "$(mail r2 'You can now post jobs')"
# Notices off: the decision is made, nothing is sent.
check "r3 requests"                   201 "$(req r3 POST /employer/memberships "{\"companyId\":\"$CB\"}")"
check "r3 is approved"                200 "$(req adm PATCH /admin/memberships "{\"companyId\":\"$CB\",\"userId\":\"$(uid r3)\",\"decision\":\"approve\"}")"
expect "no email to a person with notices off" 0 "$(mail r3 '')"
# One person's requests cause at most three emails an hour.
BEFORE=$(mail adm 'Access request')
for c in $CA $CB $CC $CD; do req r4 POST /employer/memberships "{\"companyId\":\"$c\"}" >/dev/null; done
expect "four requests were made"      4 "$(sql "SELECT COUNT(*) FROM company_members WHERE user_id='$(uid r4)' AND status='requested'")"
expect "three emails for four requests in an hour" 3 "$(( $(mail adm 'Access request') - BEFORE ))"

# --- Applications -----------------------------------------------------------------
sql "INSERT INTO company_members (company_id, user_id, role, status) VALUES ('$CA', '$(uid emp)', 'member', 'active'), ('$CA', '$(uid emp2)', 'member', 'active'), ('$CA', '$(uid emp3)', 'member', 'active')" >/dev/null
OUT=$(req emp POST /jobs "{\"companyId\":\"$CA\",\"factoryId\":\"$FA\",\"occupationId\":\"$OCC\",\"title\":\"Email Test Welder\",\"payMin\":2400,\"payMax\":2900,\"skills\":[{\"skillId\":\"$R1\",\"required\":true},{\"skillId\":\"$R2\",\"required\":true}]}")
check "post job"                      201 "$OUT" '"serial":'
JOB=$(printf '%s' "$OUT" | j id)
check "s1 holds one required skill"   200 "$(req s1 PUT /me/skills/$R1 '{"status":"held"}')"
check "employer has no news yet"      200 "$(req emp GET /me/news)" '"applicants":false'
OUT=$(req s1 POST /jobs/$JOB/apply '{"note":"Available now"}')
check "s1 applies"                    201 "$OUT" '"status":"applied"'
APP1=$(printf '%s' "$OUT" | j id)
SUBJ='New applicant for Email Test Welder'
expect "each member is emailed"       "1 1" "$(mail emp "$SUBJ") $(mail emp2 "$SUBJ")"
expect "a member with notices off is not" 0 "$(mail emp3 '')"
expect "the applicant is not"         0 "$(mail s1 'New applicant')"
expect "an approved member of the company is" 1 "$(mail r "$SUBJ")"
expect "the admin is not"             0 "$(mail adm 'New applicant')"
expect "it gives the required-skills figure" true "$(mail emp "$SUBJ" "m.text.includes('Sam Seeker applied for Email Test Welder') && m.text.includes('1 of the 2 required skills')")"
# The link is the job's address as the app writes it: /jobs/<company>/<career>/<number>.
JOB_SERIAL=$(sql "SELECT serial FROM jobs WHERE id='$JOB'")
expect "it links to the job's applicants" "$APP_URL$(req emp GET /jobs/$JOB | j job.href)" "$(mail emp "$SUBJ" "$LINK")"
expect "by the job's number"          true "$(mail emp "$SUBJ" "$LINK" | grep -Eq "/jobs/[a-z0-9-]+/[a-z0-9-]+/$JOB_SERIAL$" && echo true)"
check "that page lists the applicant" 200 "$(req emp GET /jobs/$JOB/applications)" "\"id\":\"$APP1\""
expect "it says where to turn it off" true "$(mail emp "$SUBJ" "m.text.includes('turn them off in settings: $APP_URL/settings')")"
expect "the application has its first event" "applied|$(uid s1)" "$(sql "SELECT string_agg(status || '|' || by_user, ',' ORDER BY at) FROM application_events WHERE application_id='$APP1'")"
check "employer now has news"         200 "$(req emp GET /me/news)" '"applicants":true'
check "the applicant has none"        200 "$(req s1 GET /me/news)" '"applications":false'
check "opening the applicants clears it" 200 "$(req emp POST /me/seen '{"applicants":true}')" '"applicants":false'
check "not for a colleague"           200 "$(req emp2 GET /me/news)" '"applicants":true'
# Two more within the hour: no more email. The next one after the hour counts them.
OUT=$(req s2 POST /jobs/$JOB/apply '{}'); APP2=$(printf '%s' "$OUT" | j id)
OUT=$(req s3 POST /jobs/$JOB/apply '{}'); APP3=$(printf '%s' "$OUT" | j id)
expect "three have applied"           3 "$(sql "SELECT COUNT(*) FROM applications WHERE job_id='$JOB'")"
expect "one email per job per member per hour" "1 1" "$(mail emp "$SUBJ") $(mail emp2 "$SUBJ")"
check "a later applicant is news again" 200 "$(req emp GET /me/news)" '"applicants":true'
# An hour passes: the last email, and the application it was about, move back in time.
sql "UPDATE notice_log SET window_start = window_start - interval '61 minutes' WHERE key LIKE 'applicant:$JOB:%'; UPDATE application_events SET at = at - interval '62 minutes' WHERE application_id='$APP1'" >/dev/null
check "s4 applies an hour later"      201 "$(req s4 POST /jobs/$JOB/apply '{}')"
expect "the next email goes out"      "2 2" "$(mail emp "$SUBJ") $(mail emp2 "$SUBJ")"
expect "and covers the two in between" true "$(mail emp "$SUBJ" "m.text.includes('Lou Late applied') && m.text.includes('2 more people have applied since the last email')")"

# Stage changes reach the applicant.
check "employer moves s1 to interview" 200 "$(req emp PATCH /jobs/applications/$APP1 '{"status":"interview"}')" '"status":"interview"'
STAGE='Your application for Email Test Welder'
expect "the applicant is emailed"     1 "$(mail s1 "$STAGE: Interview")"
expect "it says the stage, the job and what happens next" true "$(mail s1 "$STAGE" "m.text.includes('moved your application for Email Test Welder to Interview') && m.text.includes('will contact you at this address')")"
expect "it links to their page"       "$APP_URL/me" "$(mail s1 "$STAGE" "$LINK")"
expect "the company is not emailed about its own change" "0 0" "$(mail emp "$STAGE") $(mail emp2 "$STAGE")"
expect "the history has both steps"   "applied|$(uid s1),interview|$(uid emp)" "$(sql "SELECT string_agg(status || '|' || by_user, ',' ORDER BY at) FROM application_events WHERE application_id='$APP1'")"
check "the applicant has news"        200 "$(req s1 GET /me/news)" '"applications":true'
OUT=$(req s1 GET /me/applications)
check "the application is marked changed" 200 "$OUT" '"changed":true'
expect "with its stages in order"     'applied,interview' "$(printf '%s' "$OUT" | j 'applications[0].events.map((e) => e.status).join(",")')"
expect "each with a date"             true "$(printf '%s' "$OUT" | j 'applications[0].events.every((e) => !Number.isNaN(Date.parse(e.at)))')"
check "opening their page clears it"  200 "$(req s1 POST /me/seen '{"applications":true}')" '"applications":false'
check "and the mark"                  200 "$(req s1 GET /me/applications)" '"changed":false'
check "the same stage again"          200 "$(req emp PATCH /jobs/applications/$APP1 '{"status":"interview"}')"
check "a note alone"                  200 "$(req emp PATCH /jobs/applications/$APP1 '{"employerNote":"Call Tuesday"}')"
expect "neither is a new step or a new email" "2 1" "$(sql "SELECT COUNT(*) FROM application_events WHERE application_id='$APP1'") $(mail s1 "$STAGE")"
check "on to offer"                   200 "$(req emp PATCH /jobs/applications/$APP1 '{"status":"offer"}')"
expect "offer email"                  1 "$(mail s1 "$STAGE: Offer")"
# Notices off: the stage moves, the history is written, nothing is sent, the dot still shows.
check "employer declines s2"          200 "$(req emp PATCH /jobs/applications/$APP2 '{"status":"declined"}')"
expect "no email to an applicant with notices off" 0 "$(mail s2 "$STAGE")"
expect "the step is recorded all the same" 'applied,declined' "$(sql "SELECT string_agg(status, ',' ORDER BY at) FROM application_events WHERE application_id='$APP2'")"
check "and is news to them"           200 "$(req s2 GET /me/news)" '"applications":true'
check "an admin moves s3 for the company" 200 "$(req adm PATCH /jobs/applications/$APP3 '{"status":"reviewing"}')"
expect "which the applicant hears of" 1 "$(mail s3 "$STAGE: Reviewing")"
# A withdrawal is the applicant's own: nobody is emailed, and it is not news to them.
check "s1 clears their news"          200 "$(req s1 POST /me/seen '{"applications":true}')" '"applications":false'
N=$(sent_total)
check "s1 withdraws"                  200 "$(req s1 PATCH /jobs/applications/$APP1 '{"status":"withdrawn"}')" '"status":"withdrawn"'
expect "a withdrawal sends no email"  "$N" "$(sent_total)"
expect "it is in the history"         'applied,interview,offer,withdrawn' "$(sql "SELECT string_agg(status, ',' ORDER BY at) FROM application_events WHERE application_id='$APP1'")"
check "and is not news to the one who withdrew" 200 "$(req s1 GET /me/news)" '"applications":false'
# Taking a withdrawn application up again is a new step, and news to the company.
check "employer has seen everything"  200 "$(req emp POST /me/seen '{"applicants":true}')" '"applicants":false'
check "s1 applies again"              201 "$(req s1 POST /jobs/$JOB/apply '{}')" '"status":"applied"'
expect "the history carries on"       'applied,interview,offer,withdrawn,applied' "$(sql "SELECT string_agg(status, ',' ORDER BY at) FROM application_events WHERE application_id='$APP1'")"
check "which is news to the company"  200 "$(req emp GET /me/news)" '"applicants":true'

# Applications from before the history existed get what is known of them.
sql "DELETE FROM application_events WHERE application_id IN ('$APP2', '$APP3')" >/dev/null
psql "$DB" -q -f "$ROOT/migrations/0024_email_notices.sql" >/dev/null 2>&1
expect "backfill: applied, then the stage it is at" 'applied,declined' "$(sql "SELECT string_agg(status, ',' ORDER BY at) FROM application_events WHERE application_id='$APP2'")"
expect "backfill: the stage carries its date" t "$(sql "SELECT e.at = a.status_changed_at AT TIME ZONE 'UTC' AND e.by_user IS NULL FROM application_events e JOIN applications a ON a.id = e.application_id WHERE a.id='$APP3' AND e.status='reviewing'")"
psql "$DB" -q -f "$ROOT/migrations/0024_email_notices.sql" >/dev/null 2>&1
expect "backfill adds nothing the second time" 2 "$(sql "SELECT COUNT(*) FROM application_events WHERE application_id='$APP3'")"

# --- Nothing in any email but what was meant --------------------------------------
expect "every email is plain text with an HTML twin, from the sender" 0 "$(tail -n +"$((START + 1))" "$OUTBOX" | node -e '
  let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
    const bad = s.split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((m) =>
      !m.text || !m.html || !m.from || !m.text.includes("You got this email because") || /<img|<script/i.test(m.html) || /hash|scrypt/i.test(m.text));
    console.log(bad.length);
  });')"
# --- Asking for a company that is not in the data -------------------------------
FORGE="Emailtest Forge $RUN"
OUT=$(req s4 POST /employer/company-requests "{\"name\":\"$FORGE\",\"place\":\"Waco, TX\",\"website\":\"https://www.emailtest-forge.example/about\"}")
check "ask for a company to be added" 201 "$OUT" '"website":"emailtest-forge.example"'
CR=$(printf '%s' "$OUT" | j request.id)
expect "the admin is emailed about it" 1 "$(mail adm "Request to add $FORGE")"
expect "it says who asked and where"  1 "$(mail adm "Request to add $FORGE" "m.text.includes('$(addr s4)') && m.text.includes('Waco, TX') ? 1 : 0")"
expect "its action opens the access requests" "$APP_URL/admin/access" "$(mail adm "Request to add $FORGE" "$LINK")"
check "the admin has news of it"      200 "$(req adm GET /me/news)" '"access":true'
check "the admin declines it"         200 "$(req adm PATCH /admin/company-requests/$CR '{"decision":"decline"}')" '"status":"declined"'
expect "the person is told of the decline" 1 "$(mail s4 "Your request to add $FORGE was declined")"
check "a second answer finds nothing waiting" 404 "$(req adm PATCH /admin/company-requests/$CR '{"decision":"decline"}')"
expect "and sends nothing more"       1 "$(mail s4 "Your request to add $FORGE was declined")"
OUT=$(req s4 POST /employer/company-requests "{\"name\":\"$FORGE Two\",\"place\":\"Waco, TX\"}")
check "ask for another"               201 "$OUT"; CR=$(printf '%s' "$OUT" | j request.id)
check "the admin gives access to the company added" 200 "$(req adm PATCH /admin/company-requests/$CR "{\"decision\":\"add\",\"companyId\":\"$CD\"}")" '"status":"added"'
expect "the person is told as for an approval" 1 "$(mail s4 'You can now post jobs for')"
check "and can post for it"           200 "$(req s4 GET /auth/me)" '"isEmployer":true'

expect "every link in every email starts at APP_URL" 0 "$(tail -n +"$((START + 1))" "$OUTBOX" | node -e '
  const base = process.argv[1];
  let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
    const urls = s.split("\n").filter(Boolean).flatMap((l) => JSON.parse(l).text.match(/https?:\/\/\S+/g) || []);
    console.log(urls.filter((u) => !u.startsWith(base)).length);
  });' "$APP_URL")"

cleanup; trap 'rm -rf "$D"' EXIT; PROFILE_ID=''
expect "nothing of this run is left behind" "0 0 0 0" "$(sql "SELECT (SELECT COUNT(*) FROM users WHERE email LIKE '%@email.test') || ' ' || (SELECT COUNT(*) FROM invites WHERE email LIKE '%@email.test') || ' ' || (SELECT COUNT(*) FROM notice_log WHERE key LIKE '%$JOB%' OR key LIKE '%$ADM%' OR key LIKE '%$R%') || ' ' || (SELECT COUNT(*) FROM jobs WHERE id='$JOB')")"

finish
