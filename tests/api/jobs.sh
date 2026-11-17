#!/usr/bin/env bash
# End-to-end check of what a company does with its jobs: edit one (fields and
# skills), post another like it, delete one nobody applied to, read applicants
# with their skills, and undo a Declined or Hired. Every step is also tried by
# someone who must be refused. Then what comes before a job: finding a career
# by the words a plant uses, finding a company by its name, and asking for a
# company or a plant that is not in the data. Prints one line per check and
# exits non-zero if any fail.
#
# LOCAL ONLY: it creates and deletes users (emails ending @jobs.test), makes
# them active members of two companies and one of them an admin directly in
# the database, posts jobs, and adds one company with a plant and one career
# of its own (named Jobtest…). Everything it made is removed on exit, however
# the script ends. Never point it at production.
#   API=http://localhost:3000/api DB=postgresql://... bash tests/api/jobs.sh
# Needs a running dev API, seeded data with two companies that have a factory
# and a career with skills, and psql, curl and node on the PATH.
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

# Jobs first: a job outlives the person who posted it.
cleanup() {
  psql "$DB" -qtAc "DELETE FROM jobs WHERE created_by IN (SELECT id FROM users WHERE email LIKE '%@jobs.test'); DELETE FROM users WHERE email LIKE '%@jobs.test';
    DELETE FROM companies WHERE name LIKE 'Jobtest$RUN%'; DELETE FROM occupations WHERE title LIKE 'Jobtest Flange Aligner $RUN'" >/dev/null
  rm -rf "$D"
}
trap cleanup EXIT
psql "$DB" -qtAc "DELETE FROM jobs WHERE created_by IN (SELECT id FROM users WHERE email LIKE '%@jobs.test'); DELETE FROM users WHERE email LIKE '%@jobs.test'" >/dev/null

# Two companies, each with a factory, and a career with skills.
FA=$(sql "SELECT id FROM factories WHERE company_id IS NOT NULL ORDER BY id LIMIT 1")
CA=$(sql "SELECT company_id FROM factories WHERE id='$FA'")
FB=$(sql "SELECT id FROM factories WHERE company_id IS NOT NULL AND company_id <> '$CA' ORDER BY id LIMIT 1")
CB=$(sql "SELECT company_id FROM factories WHERE id='$FB'")
OCC=$(sql "SELECT occupation_id FROM occupation_skills GROUP BY 1 ORDER BY COUNT(*) DESC, 1 LIMIT 1")
OCC_SKILLS=$(sql "SELECT COUNT(*) FROM occupation_skills WHERE occupation_id='$OCC'")
# Four skills: R1 and R2 required, O1 optional, X1 swapped in later.
R1=$(sql "SELECT id FROM skills ORDER BY name, id LIMIT 1 OFFSET 0")
R2=$(sql "SELECT id FROM skills ORDER BY name, id LIMIT 1 OFFSET 1")
O1=$(sql "SELECT id FROM skills ORDER BY name, id LIMIT 1 OFFSET 2")
X1=$(sql "SELECT id FROM skills ORDER BY name, id LIMIT 1 OFFSET 3")
R1NAME=$(sql "SELECT name FROM skills WHERE id='$R1'")
NOBODY=00000000-0000-4000-8000-000000000000

signup() { # jar name -> signs up <jar>-$RUN@jobs.test
  check "sign-up $1" 201 "$(req "$1" POST /auth/sign-up "{\"email\":\"$1-$RUN@jobs.test\",\"name\":\"$2\",\"password\":\"correct horse\"}")"
}
uid() { sql "SELECT id FROM users WHERE email='$1-$RUN@jobs.test'"; }
signup emp "Erin Employer"; signup other "Otto Other"; signup admin "Ada Admin"
signup s1 "Sam Skilled"; signup s2 "Lee Learning"; signup s3 "Nat New"
sql "INSERT INTO company_members (company_id, user_id, role, status) VALUES ('$CA', '$(uid emp)', 'member', 'active'), ('$CB', '$(uid other)', 'member', 'active')" >/dev/null
sql "UPDATE users SET is_admin=true WHERE id='$(uid admin)'" >/dev/null
check "member of one company"         200 "$(req emp GET /auth/me)" '"isEmployer":true'

POST_A="\"companyId\":\"$CA\",\"factoryId\":\"$FA\",\"occupationId\":\"$OCC\""
TAGS="[{\"skillId\":\"$R1\",\"required\":true},{\"skillId\":\"$R2\",\"required\":true},{\"skillId\":\"$O1\",\"required\":false}]"
OUT=$(req emp POST /jobs "{$POST_A,\"title\":\"Line Lead\",\"payMin\":2400,\"payMax\":2900,\"shift\":\"Days\",\"skills\":$TAGS}")
check "post job"                      201 "$OUT" '"serial":'
JOB=$(printf '%s' "$OUT" | j id)
jobskills() { sql "SELECT COALESCE(string_agg(skill_id::text || ':' || required::text, ',' ORDER BY skill_id), '') FROM job_skills WHERE job_id='$1'"; }
SKILLS0=$(jobskills $JOB)
expect "job has the three tagged skills" 3 "$(sql "SELECT COUNT(*) FROM job_skills WHERE job_id='$JOB'")"

# --- Edit ---------------------------------------------------------------------
check "edit signed out"               401 "$(req anon PATCH /jobs/$JOB '{"title":"Hacked"}')"
check "edit by another company"       403 "$(req other PATCH /jobs/$JOB '{"title":"Hacked"}')"
check "edit by an applicant"          403 "$(req s1 PATCH /jobs/$JOB '{"title":"Hacked"}')"
check "skills by another company"     403 "$(req other PATCH /jobs/$JOB '{"skills":[]}')"
check "close by another company"      403 "$(req other PATCH /jobs/$JOB '{"status":"closed"}')"
expect "refused edits changed nothing" "Line Lead|open|$SKILLS0" "$(sql "SELECT title || '|' || status FROM jobs WHERE id='$JOB'")|$(jobskills $JOB)"
check "edit unknown job"              404 "$(req emp PATCH /jobs/$NOBODY '{"title":"Nothing"}')"
check "edit bad id"                   400 "$(req emp PATCH /jobs/not-an-id '{"title":"Nothing"}')"

check "edit fields"                   200 "$(req emp PATCH /jobs/$JOB '{"title":"Line Lead II","description":"Runs the line.","payMin":2600,"payMax":3100,"payPeriod":"hour","employmentType":"part-time","shift":"2nd shift"}')"
OUT=$(req emp GET /jobs/$JOB)
check "edited fields are stored"      200 "$OUT" '"title":"Line Lead II"'
expect "edited pay, type, shift, description" "2600|3100|part-time|2nd shift|Runs the line." "$(printf '%s' "$OUT" | j 'job.payMin + "|" + [o.job.payMax, o.job.employmentType, o.job.shift, o.job.description].join("|")')"
expect "an edit of fields leaves the skills" "$SKILLS0" "$(jobskills $JOB)"
check "edit cannot move the job"      200 "$(req emp PATCH /jobs/$JOB "{\"companyId\":\"$CB\",\"factoryId\":\"$FB\",\"occupationId\":\"$NOBODY\",\"title\":\"Line Lead II\"}")"
expect "company, factory and career stay" "$CA|$FA|$OCC" "$(sql "SELECT company_id || '|' || factory_id || '|' || occupation_id FROM jobs WHERE id='$JOB'")"

check "pay lowest above highest"      400 "$(req emp PATCH /jobs/$JOB '{"payMin":3000,"payMax":2000}')" 'above the highest'
check "pay needs both ends"           400 "$(req emp PATCH /jobs/$JOB '{"payMin":3000}')"
check "pay in cents, not text"        400 "$(req emp PATCH /jobs/$JOB '{"payMin":"26","payMax":"31"}')"
check "bad employment type"           400 "$(req emp PATCH /jobs/$JOB '{"employmentType":"gig"}')"
check "bad pay period"                400 "$(req emp PATCH /jobs/$JOB '{"payPeriod":"week"}')"
LONG=$(node -e 'process.stdout.write("x".repeat(8001))')
check "description over 8,000"        400 "$(req emp PATCH /jobs/$JOB "{\"description\":\"$LONG\"}")" '8,000'
expect "refused edits kept the pay"   "2600|3100" "$(sql "SELECT pay_min || '|' || pay_max FROM jobs WHERE id='$JOB'")"

link() { sql "SELECT COALESCE(apply_url, 'none') FROM jobs WHERE id='$JOB'"; }
check "link without a scheme"         200 "$(req emp PATCH /jobs/$JOB '{"applyUrl":"careers.example.com/apply?id=7"}')"
expect "link gets https"              "https://careers.example.com/apply?id=7" "$(link)"
check "link with http"                200 "$(req emp PATCH /jobs/$JOB '{"applyUrl":"http://jobs.example.com"}')"
expect "http link becomes https"      "https://jobs.example.com" "$(link)"
check "link with https"               200 "$(req emp PATCH /jobs/$JOB '{"applyUrl":"https://example.com/a"}')"
expect "https link is kept"           "https://example.com/a" "$(link)"
check "link that is a script"         400 "$(req emp PATCH /jobs/$JOB '{"applyUrl":"javascript:alert(1)"}')"
check "link with another scheme"      400 "$(req emp PATCH /jobs/$JOB '{"applyUrl":"ftp://example.com/a"}')"
check "link that is an email"         400 "$(req emp PATCH /jobs/$JOB '{"applyUrl":"mailto:hr@example.com"}')"
check "link with a space"             400 "$(req emp PATCH /jobs/$JOB '{"applyUrl":"example.com/a b"}')"
check "link with no domain"           400 "$(req emp PATCH /jobs/$JOB '{"applyUrl":"apply-here"}')"
expect "refused links changed nothing" "https://example.com/a" "$(link)"
check "clear the link"                200 "$(req emp PATCH /jobs/$JOB '{"applyUrl":null}')"
expect "link is cleared"              none "$(link)"

check "replace the skills"            200 "$(req emp PATCH /jobs/$JOB "{\"skills\":[{\"skillId\":\"$R1\",\"required\":false},{\"skillId\":\"$X1\"},{\"skillId\":\"$X1\"},{\"skillId\":\"nope\"}]}")"
OUT=$(req anon GET /jobs/$JOB)
expect "the list sent is the whole list" 2 "$(printf '%s' "$OUT" | j skills.length)"
expect "a kept skill takes its new group" false "$(printf '%s' "$OUT" | j "skills.find(s => s.id === '$R1').required")"
expect "a skill without a group is required" true "$(printf '%s' "$OUT" | j "skills.find(s => s.id === '$X1').required")"
SKILLS1=$(jobskills $JOB)
check "skill that does not exist"     400 "$(req emp PATCH /jobs/$JOB "{\"title\":\"Not saved\",\"skills\":[{\"skillId\":\"$NOBODY\"}]}")" 'does not exist'
check "skills must be a list"         400 "$(req emp PATCH /jobs/$JOB '{"skills":"all"}')"
MANY=$(sql "SELECT json_agg(json_build_object('skillId', id)) FROM (SELECT id FROM skills LIMIT 61) s")
check "more than 60 skills"           400 "$(req emp PATCH /jobs/$JOB "{\"skills\":$MANY}")" 'at most 60'
expect "refused skills changed nothing" "Line Lead II|$SKILLS1" "$(sql "SELECT title FROM jobs WHERE id='$JOB'")|$(jobskills $JOB)"
check "no skills at all"              200 "$(req emp PATCH /jobs/$JOB '{"skills":[]}')"
expect "job has no skills"            0 "$(sql "SELECT COUNT(*) FROM job_skills WHERE job_id='$JOB'")"
check "put the skills back"           200 "$(req emp PATCH /jobs/$JOB "{\"skills\":$TAGS}")"
expect "skills are as posted"         "$SKILLS0" "$(jobskills $JOB)"
check "admin edits any job"           200 "$(req admin PATCH /jobs/$JOB '{"shift":"Days"}')"
check "close keeps the edit"          200 "$(req emp PATCH /jobs/$JOB '{"status":"closed","closedReason":"On hold"}')"
check "edit a closed job"             200 "$(req emp PATCH /jobs/$JOB '{"title":"Line Lead"}')"
expect "an edit does not reopen"      "closed|Line Lead" "$(sql "SELECT status || '|' || title FROM jobs WHERE id='$JOB'")"
check "reopen"                        200 "$(req emp PATCH /jobs/$JOB '{"status":"open"}')"

# --- Post another like this ---------------------------------------------------
SAME="{$POST_A,\"title\":\"Welder\",\"payMin\":2400,\"payMax\":2900,\"shift\":\"Days\",\"description\":\"Welds.\"}"
OUT=$(req emp POST /jobs "$SAME")
check "post a second job"             201 "$OUT"
JOB2=$(printf '%s' "$OUT" | j id)
expect "career's skills by default"   "$OCC_SKILLS" "$(sql "SELECT COUNT(*) FROM job_skills WHERE job_id='$JOB2'")"
OUT=$(req emp POST /jobs "$SAME")
check "the same post twice is one job" 200 "$OUT" "\"id\":\"$JOB2\""
OUT=$(req emp POST /jobs "{$POST_A,\"title\":\"Welder\",\"payMin\":2400,\"payMax\":2900,\"shift\":\"Nights\",\"description\":\"Welds.\"}")
check "a copy with another shift is a new job" 201 "$OUT"
JOB3=$(printf '%s' "$OUT" | j id)
expect "the copy is a different job"  1 "$([ "$JOB3" != "$JOB2" ] && echo 1 || echo 0)"
OUT=$(req emp POST /jobs "{$POST_A,\"title\":\"Welder\",\"payMin\":2400,\"payMax\":3000,\"shift\":\"Days\",\"description\":\"Welds.\"}")
check "a copy with other pay is a new job" 201 "$OUT"
JOB4=$(printf '%s' "$OUT" | j id)
check "post with a bare link"         201 "$(req emp POST /jobs "{$POST_A,\"title\":\"Fitter\",\"payMin\":2400,\"payMax\":2900,\"applyUrl\":\"example.com/fitter\"}")"
expect "posted link gets https"       "https://example.com/fitter" "$(sql "SELECT apply_url FROM jobs WHERE title='Fitter' AND created_by='$(uid emp)'")"
check "post with pay reversed"        400 "$(req emp POST /jobs "{$POST_A,\"payMin\":2900,\"payMax\":2400}")" 'above the highest'
check "post for another company"      403 "$(req emp POST /jobs "{\"companyId\":\"$CB\",\"factoryId\":\"$FB\",\"occupationId\":\"$OCC\",\"payMin\":2400,\"payMax\":2900}")"

# --- Applicants and their skills ----------------------------------------------
check "s1 holds R1"                   200 "$(req s1 PUT /me/skills/$R1 '{"status":"held"}')"
check "s1 holds R2"                   200 "$(req s1 PUT /me/skills/$R2 '{"status":"held"}')"
check "s1 is learning O1"             200 "$(req s1 PUT /me/skills/$O1 '{"status":"learning"}')"
check "s1 holds a skill the job does not ask for" 200 "$(req s1 PUT /me/skills/$X1 '{"status":"held"}')"
check "s2 holds R1"                   200 "$(req s2 PUT /me/skills/$R1 '{"status":"held"}')"
check "s2 is learning R2"             200 "$(req s2 PUT /me/skills/$R2 '{"status":"learning"}')"
check "s2 holds O1"                   200 "$(req s2 PUT /me/skills/$O1 '{"status":"held"}')"
# Applied in the order s3, s2, s1: the ranking, not the order, puts s1 first.
OUT=$(req s3 POST /jobs/$JOB/apply '{}');                       check "s3 applies" 201 "$OUT"; APP3=$(printf '%s' "$OUT" | j id)
OUT=$(req s2 POST /jobs/$JOB/apply '{"note":"Second shift"}');  check "s2 applies" 201 "$OUT"; APP2=$(printf '%s' "$OUT" | j id)
OUT=$(req s1 POST /jobs/$JOB/apply '{"note":"Can start now"}'); check "s1 applies" 201 "$OUT"; APP1=$(printf '%s' "$OUT" | j id)

check "applicants signed out"         401 "$(req anon GET /jobs/$JOB/applications)"
check "applicants to another company" 403 "$(req other GET /jobs/$JOB/applications)"
check "applicants to an applicant"    403 "$(req s1 GET /jobs/$JOB/applications)"
check "applicants of an unknown job"  404 "$(req emp GET /jobs/$NOBODY/applications)"
OUT=$(req emp GET /jobs/$JOB/applications)
check "company reads its applicants"  200 "$OUT" '"skillsAreSelfReported":true'
check "the job's skills come with names" 200 "$OUT" "\"name\":\"$R1NAME\""
expect "the job's skills, required first" "true,true,false" "$(printf '%s' "$OUT" | j 'skills.map(s => s.required).join(",")')"
expect "ranked by required skills held" "s1,s2,s3" "$(printf '%s' "$OUT" | j 'applications.map(a => a.applicant.email.split("-")[0]).join(",")')"
expect "counts per applicant"         "2/2+0,1/2+1,0/2+0" "$(printf '%s' "$OUT" | j 'applications.map(a => a.heldRequired + "/" + a.totalRequired + "+" + a.heldOptional).join(",")')"
expect "s1 holds both required skills" "$(printf '%s\n%s' "$R1" "$R2" | sort | paste -sd, -)" "$(printf '%s' "$OUT" | j 'applications[0].heldSkillIds.slice().sort().join(",")')"
expect "s1 is learning the optional one" "$O1" "$(printf '%s' "$OUT" | j 'applications[0].learningSkillIds.join(",")')"
expect "s2 holds one of each"         "$(printf '%s\n%s' "$R1" "$O1" | sort | paste -sd, -)" "$(printf '%s' "$OUT" | j 'applications[1].heldSkillIds.slice().sort().join(",")')"
expect "s2 is learning the other required one" "$R2" "$(printf '%s' "$OUT" | j 'applications[1].learningSkillIds.join(",")')"
expect "s3 has none of them"          "0,0" "$(printf '%s' "$OUT" | j 'applications[2].heldSkillIds.length + "," + o.applications[2].learningSkillIds.length')"
expect "a skill the job does not ask for is left out" 0 "$(printf '%s' "$OUT" | grep -c "$X1")"
expect "notes and contact are listed" "Can start now|s1-$RUN@jobs.test" "$(printf '%s' "$OUT" | j 'applications[0].note + "|" + o.applications[0].applicant.email')"
check "admin reads any applicants"    200 "$(req admin GET /jobs/$JOB/applications)" '"applications":\['
HDR=$(curl -s -b "$D/emp" -D - -o /dev/null "$API/jobs/$JOB/applications" | tr -d '\r' | grep -i '^cache-control')
case "$HDR" in *no-store*) echo "ok    applicants are not cacheable";; *) echo "FAIL  applicants cache header: $HDR"; fail=1;; esac
# Changing what the job asks for changes the standing at once.
check "make R2 optional"              200 "$(req emp PATCH /jobs/$JOB "{\"skills\":[{\"skillId\":\"$R1\"},{\"skillId\":\"$R2\",\"required\":false},{\"skillId\":\"$O1\",\"required\":false}]}")"
expect "counts follow the job's skills" "1/1+1,1/1+1,0/1+0" "$(req emp GET /jobs/$JOB/applications | j 'applications.map(a => a.heldRequired + "/" + a.totalRequired + "+" + a.heldOptional).join(",")')"
check "restore the skills"            200 "$(req emp PATCH /jobs/$JOB "{\"skills\":$TAGS}")"

# --- Stages: move, decline, hire, undo ----------------------------------------
stage() { sql "SELECT status FROM applications WHERE id='$1'"; }
check "stage change signed out"       401 "$(req anon PATCH /jobs/applications/$APP3 '{"status":"reviewing"}')"
check "stage change by another company" 403 "$(req other PATCH /jobs/applications/$APP3 '{"status":"reviewing"}')"
check "note by another company"       403 "$(req other PATCH /jobs/applications/$APP3 '{"employerNote":"Seen"}')"
check "stage change by another applicant" 403 "$(req s1 PATCH /jobs/applications/$APP3 '{"status":"withdrawn"}')"
check "applicant cannot advance"      403 "$(req s3 PATCH /jobs/applications/$APP3 '{"status":"offer"}')"
check "applicant cannot add a company note" 403 "$(req s3 PATCH /jobs/applications/$APP3 '{"employerNote":"Hire me"}')"
expect "refusals changed nothing"     "applied|" "$(sql "SELECT status || '|' || COALESCE(employer_note, '') FROM applications WHERE id='$APP3'")"
check "unknown stage"                 403 "$(req emp PATCH /jobs/applications/$APP3 '{"status":"shortlist"}')"
check "company cannot withdraw for them" 403 "$(req emp PATCH /jobs/applications/$APP3 '{"status":"withdrawn"}')"

check "move to reviewing"             200 "$(req emp PATCH /jobs/applications/$APP3 '{"status":"reviewing","employerNote":"Call back"}')" '"status":"reviewing"'
check "the same stage again"          200 "$(req emp PATCH /jobs/applications/$APP3 '{"status":"reviewing"}')" '"status":"reviewing"'
check "decline"                       200 "$(req emp PATCH /jobs/applications/$APP3 '{"status":"declined"}')" '"status":"declined"'
check "applicant sees declined"       200 "$(req s3 GET /me/applications)" '"status":"declined"'
check "declined applicant cannot withdraw" 409 "$(req s3 PATCH /jobs/applications/$APP3 '{"status":"withdrawn"}')"
check "declined applicant cannot undo it" 403 "$(req s3 PATCH /jobs/applications/$APP3 '{"status":"reviewing"}')"
check "another company cannot undo it" 403 "$(req other PATCH /jobs/applications/$APP3 '{"status":"reviewing"}')"
check "declined straight to hired"    409 "$(req emp PATCH /jobs/applications/$APP3 '{"status":"hired"}')" 'earlier stage'
expect "still declined"               declined "$(stage $APP3)"
check "note on a declined application" 200 "$(req emp PATCH /jobs/applications/$APP3 '{"employerNote":"Declined by mistake"}')"
check "undo the decline"              200 "$(req emp PATCH /jobs/applications/$APP3 '{"status":"reviewing"}')" '"status":"reviewing"'
check "applicant sees reviewing again" 200 "$(req s3 GET /me/applications)" '"status":"reviewing"'
expect "undo keeps the note"          "Declined by mistake" "$(sql "SELECT employer_note FROM applications WHERE id='$APP3'")"
check "applicant can withdraw again"  200 "$(req s3 PATCH /jobs/applications/$APP3 '{"status":"withdrawn"}')" '"status":"withdrawn"'
check "a withdrawal is the applicant's" 409 "$(req emp PATCH /jobs/applications/$APP3 '{"status":"reviewing"}')" 'withdrawn'
check "a withdrawal is the applicant's (admin)" 409 "$(req admin PATCH /jobs/applications/$APP3 '{"status":"applied"}')"
expect "still withdrawn"              withdrawn "$(stage $APP3)"

check "hire"                          200 "$(req emp PATCH /jobs/applications/$APP1 '{"status":"hired"}')" '"status":"hired"'
check "hired straight to declined"    409 "$(req emp PATCH /jobs/applications/$APP1 '{"status":"declined"}')"
check "undo the hire"                 200 "$(req emp PATCH /jobs/applications/$APP1 '{"status":"offer"}')" '"status":"offer"'
check "hire again"                    200 "$(req emp PATCH /jobs/applications/$APP1 '{"status":"hired"}')"
check "admin undoes a hire"           200 "$(req admin PATCH /jobs/applications/$APP1 '{"status":"interview"}')" '"status":"interview"'
check "unknown application"           404 "$(req emp PATCH /jobs/applications/$NOBODY '{"status":"reviewing"}')"
check "nothing to change"             400 "$(req emp PATCH /jobs/applications/$APP1 '{}')"

# --- Delete -------------------------------------------------------------------
exists() { sql "SELECT COUNT(*) FROM jobs WHERE id='$1'"; }
check "delete signed out"             401 "$(req anon DELETE /jobs/$JOB2)"
check "delete by another company"     403 "$(req other DELETE /jobs/$JOB2)"
check "delete by an applicant"        403 "$(req s1 DELETE /jobs/$JOB2)"
expect "refused deletes removed nothing" 1 "$(exists $JOB2)"
check "delete unknown job"            404 "$(req emp DELETE /jobs/$NOBODY)"
check "delete bad id"                 400 "$(req emp DELETE /jobs/not-an-id)"
check "delete a job with applicants"  409 "$(req emp DELETE /jobs/$JOB)" 'Close it instead'
check "admin cannot either"           409 "$(req admin DELETE /jobs/$JOB)"
expect "job and applications are kept" "1|3" "$(exists $JOB)|$(sql "SELECT COUNT(*) FROM applications WHERE job_id='$JOB'")"
check "delete a job nobody applied to" 200 "$(req emp DELETE /jobs/$JOB2)" '"ok":true'
expect "the job and its skills are gone" "0|0" "$(exists $JOB2)|$(sql "SELECT COUNT(*) FROM job_skills WHERE job_id='$JOB2'")"
check "deleted job is not found"      404 "$(req emp GET /jobs/$JOB2)"
check "delete twice"                  404 "$(req emp DELETE /jobs/$JOB2)"
check "employer page no longer lists it" 200 "$(req emp GET /employer)" "\"id\":\"$JOB3\""
expect "employer page no longer lists it (2)" 0 "$(req emp GET /employer | grep -c "\"id\":\"$JOB2\"")"
check "delete a closed job"           200 "$(req emp PATCH /jobs/$JOB3 '{"status":"closed"}')"
check "delete a closed job (2)"       200 "$(req emp DELETE /jobs/$JOB3)"
check "admin deletes any empty job"   200 "$(req admin DELETE /jobs/$JOB4)"
# Only withdrawn applications left: still not deletable, the applicant keeps it on their page.
check "s2 withdraws"                  200 "$(req s2 PATCH /jobs/applications/$APP2 '{"status":"withdrawn"}')"
check "s1 withdraws"                  200 "$(req s1 PATCH /jobs/applications/$APP1 '{"status":"withdrawn"}')"
check "withdrawn applications still count" 409 "$(req emp DELETE /jobs/$JOB)"
check "another company's dashboard has none of it" 200 "$(req other GET /employer)" '"jobs":\[\]'

# --- Extending, and the limit on posting ----------------------------------------
check "reopen the first job"          200 "$(req emp PATCH /jobs/$JOB '{"status":"open"}')"
sql "UPDATE jobs SET expires_at = now() + interval '2 days' WHERE id='$JOB'" >/dev/null
check "extend an open job"            200 "$(req emp PATCH /jobs/$JOB '{"status":"open"}')"
expect "its 60 days start again"      t "$(sql "SELECT expires_at > now() + interval '59 days' FROM jobs WHERE id='$JOB'")"
check "extend by another company"     403 "$(req other PATCH /jobs/$JOB '{"status":"open"}')"
sql "INSERT INTO jobs (company_id, factory_id, occupation_id, title, pay_min, pay_max, expires_at, created_by)
     SELECT '$CA', '$FA', '$OCC', 'Limit filler ' || g, 2000, 2500, now() + interval '60 days', '$(uid emp)' FROM generate_series(1, 30) g" >/dev/null
check "a 31st job in an hour is refused" 429 "$(req emp POST /jobs "{$POST_A,\"title\":\"One too many\",\"payMin\":2400,\"payMax\":2900}")" 'in the last hour'
expect "and is not posted"            0 "$(sql "SELECT COUNT(*) FROM jobs WHERE title='One too many'")"
check "another person still posts"    201 "$(req admin POST /jobs "{$POST_A,\"title\":\"Admin post\",\"payMin\":2400,\"payMax\":2900}")"
sql "DELETE FROM jobs WHERE title LIKE 'Limit filler %' AND created_by='$(uid emp)'" >/dev/null
check "the plants an employer picks from carry their street" 200 "$(req emp GET /employer)" '"address":'

# --- Career search: the words a plant uses ------------------------------------
# One career of this run's own, with another name it goes by.
CAREER="Jobtest Flange Aligner $RUN"
CAREER_ID=$(sql "INSERT INTO occupations (title, description) VALUES ('$CAREER', 'Sets flanges true before welding.') RETURNING id")
sql "INSERT INTO occupation_aliases (alias_text, canonical_occupation_id) VALUES ('Flange Monkey $RUN', '$CAREER_ID'), ('F&M $RUN', '$CAREER_ID')" >/dev/null
first() { curl -s -G "$API/occupations" --data-urlencode "search=$1" --data-urlencode "limit=5" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s);console.log((o.data[0]||{}).title+'|'+o.total)})"; }
expect "career by its title"          "$CAREER|1" "$(first "jobtest flange aligner $RUN")"
expect "career by another name"       "$CAREER|1" "$(first "flange monkey $RUN")"
expect "another name, in capitals and spaced out" "$CAREER|1" "$(first "  FLANGE   Monkey $RUN ")"
expect "another name with & for and"  "$CAREER|1" "$(first "f and m $RUN")"
expect "words in any order"           "$CAREER|1" "$(first "$RUN aligner flange")"
expect "words cut short"              "$CAREER|1" "$(first "jobt flan align $RUN")"
expect "a plural"                     "$CAREER|1" "$(first "jobtest flange aligners $RUN")"
expect "a level after the title"      "$CAREER|1" "$(first "jobtest flange aligner $RUN II")"
expect "a shift before it"            "$CAREER|1" "$(first "2nd shift jobtest flange aligner $RUN")"
expect "a wrong letter"               "$CAREER" "$(first "jobtest flange alignr $RUN" | cut -d'|' -f1)"
expect "nothing like it finds nothing" "undefined|0" "$(first "zzqx$RUN vvkj")"
QC=$(sql "SELECT COUNT(*) FROM occupations WHERE title='Quality Control Inspector'")
if [ "$QC" = 1 ] && [ "$(sql "SELECT COUNT(*) FROM occupation_aliases WHERE alias_text='QA'")" = 1 ]; then
  expect "QA finds the quality inspector" "Quality Control Inspector" "$(first QA | cut -d'|' -f1)"
  expect "maint tech finds the maintenance technician" "Maintenance Technician" "$(first 'maint tech' | cut -d'|' -f1)"
  expect "welder II finds the welder"  "Welder" "$(first 'welder II' | cut -d'|' -f1)"
else echo "skip  the curated names (migration 0026_career_aliases not applied to this data)"; fi
sql "DELETE FROM occupations WHERE id='$CAREER_ID'" >/dev/null
expect "the career's other names go with it" 0 "$(sql "SELECT COUNT(*) FROM occupation_aliases WHERE alias_text LIKE '%$RUN'")"

# --- Finding a company ----------------------------------------------------------
# A company of this run's own with one plant, named so that nothing else matches.
CO="Jobtest$RUN & Sons Precision Inc."
CO_ID=$(sql "INSERT INTO companies (name, industry) VALUES ('$CO', 'Machinery') RETURNING id")
sql "INSERT INTO factories (name, company_id, latitude, longitude, city, state) VALUES ('JOBTEST PLANT', '$CO_ID', '31.5', '-97.1', 'Waco', 'TX')" >/dev/null
found() { curl -s -b "$D/$1" -G "$API/employer/companies" --data-urlencode "q=$2" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s);const c=o.companies||[];console.log((c[0]||{}).id+'|'+o.total+'|'+o.close)})"; }
check "company search signed out"     401 "$(req anon GET "/employer/companies?q=jobtest$RUN")"
check "company search, too short"     200 "$(req s3 GET '/employer/companies?q=j')" '"companies":\[\]'
OUT=$(req s3 GET "/employer/companies?q=jobtest$RUN")
check "company by the start of its name" 200 "$OUT" "\"id\":\"$CO_ID\""
expect "the row says where it is"     "1|Waco, TX" "$(printf '%s' "$OUT" | j 'companies[0].factoryCount + "|" + o.companies[0].where')"
expect "the name as written"          "$CO_ID|1|false" "$(found s3 "$CO")"
expect "and for &"                    "$CO_ID|1|false" "$(found s3 "Jobtest$RUN and Sons Precision")"
expect "two spaces"                   "$CO_ID|1|false" "$(found s3 "jobtest$RUN  &  sons   precision")"
expect "the legal form, or another"   "$CO_ID|1|false" "$(found s3 "jobtest$RUN and sons precision corporation")"
expect "no punctuation"               "$CO_ID|1|false" "$(found s3 "JOBTEST$RUN SONS PRECISION INC")"
expect "words in any order"           "$CO_ID|1|false" "$(found s3 "precision jobtest$RUN")"
expect "a wrong letter gives the closest" "$CO_ID|true" "$(found s3 "jobtest$RUN and sons precison" | cut -d'|' -f1,3)"
expect "industry is not searched"     "undefined|0|false" "$(found s3 "zzqx$RUN machinery")"
expect "a wildcard is not everything" "undefined|0|false" "$(found s3 "%%")"
N=$(sql "SELECT COUNT(*) FROM companies WHERE name ILIKE 'General%'")
if [ "$N" -gt 2 ]; then
  OUT=$(req s3 GET '/employer/companies?q=general&limit=2')
  expect "the list says how many more there are" "2|$N" "$(printf '%s' "$OUT" | j 'companies.length + "|" + o.total')"
else echo "skip  the count of more matches (fewer than three companies named General)"; fi

# --- Asking for a company, or a plant, that is not listed ----------------------
ASK="Jobtest$RUN Hill Country Machine"
check "ask signed out"                401 "$(req anon POST /employer/company-requests "{\"name\":\"$ASK\",\"place\":\"Dripping Springs, TX\"}")"
check "ask without saying where"      400 "$(req s3 POST /employer/company-requests "{\"name\":\"$ASK\"}")" '"field":"place"'
check "ask without a name"            400 "$(req s3 POST /employer/company-requests '{"place":"Dripping Springs, TX"}')" '"field":"name"'
check "ask with a website that is not one" 400 "$(req s3 POST /employer/company-requests "{\"name\":\"$ASK\",\"place\":\"Dripping Springs, TX\",\"website\":\"not a site\"}")" '"field":"website"'
check "ask for a company that is listed" 409 "$(req s3 POST /employer/company-requests "{\"name\":\"$(printf '%s' "$CO" | tr 'A-Z' 'a-z')\",\"place\":\"Waco\"}")" 'already listed'
OUT=$(req s3 POST /employer/company-requests "{\"name\":\"$ASK\",\"place\":\"Dripping Springs, TX\",\"website\":\"HTTPS://www.Example.com/about\"}")
check "ask for a company to be added" 201 "$OUT" '"website":"example.com"'
ASK_ID=$(printf '%s' "$OUT" | j request.id)
check "the same request twice is one" 200 "$(req s3 POST /employer/company-requests "{\"name\":\"$ASK\",\"place\":\"Dripping Springs\"}")" "\"id\":\"$ASK_ID\""
check "the person sees it waiting"    200 "$(req s3 GET /employer/company-requests)" '"status":"requested"'
check "the account knows a request is waiting" 200 "$(req s3 GET /auth/me)" '"hasCompanyRequest":true'
check "requests are not for everyone to read" 403 "$(req s3 GET /admin/company-requests)"
check "nor signed out"                401 "$(req anon GET /admin/company-requests)"
check "the admin sees it with who asked" 200 "$(req admin GET /admin/company-requests)" "\"userEmail\":\"s3-$RUN@jobs.test\""
check "an admin has news of it"       200 "$(req admin GET /me/news)" '"access":true'
check "answer by someone who is not an admin" 403 "$(req emp PATCH /admin/company-requests/$ASK_ID "{\"decision\":\"add\",\"companyId\":\"$CO_ID\"}")"
check "answer without a decision"     400 "$(req admin PATCH /admin/company-requests/$ASK_ID '{}')"
check "add without saying which company" 400 "$(req admin PATCH /admin/company-requests/$ASK_ID '{"decision":"add"}')"
check "add with a company that does not exist" 404 "$(req admin PATCH /admin/company-requests/$ASK_ID "{\"decision\":\"add\",\"companyId\":\"$NOBODY\"}")"
expect "refused answers changed nothing" "requested|0" "$(sql "SELECT status FROM company_requests WHERE id='$ASK_ID'")|$(sql "SELECT COUNT(*) FROM company_members WHERE user_id='$(uid s3)'")"
check "the admin gives access to the company added" 200 "$(req admin PATCH /admin/company-requests/$ASK_ID "{\"decision\":\"add\",\"companyId\":\"$CO_ID\"}")" '"status":"added"'
expect "the person is an active member" active "$(sql "SELECT status FROM company_members WHERE user_id='$(uid s3)' AND company_id='$CO_ID'")"
check "and has the company on their page" 200 "$(req s3 GET /employer)" "\"companyId\":\"$CO_ID\""
check "nothing is waiting any more"   200 "$(req s3 GET /auth/me)" '"hasCompanyRequest":false'
check "an answered request cannot be answered again" 404 "$(req admin PATCH /admin/company-requests/$ASK_ID '{"decision":"decline"}')"
check "nor withdrawn by the person"   200 "$(req s3 DELETE /employer/company-requests/$ASK_ID)"
expect "it stays on record"           added "$(sql "SELECT status FROM company_requests WHERE id='$ASK_ID'")"
# A plant of a company: asked for by its members only.
check "a plant asked for by a stranger" 403 "$(req s2 POST /employer/company-requests "{\"companyId\":\"$CO_ID\",\"place\":\"12 Mill Rd, Temple, TX\"}")"
OUT=$(req s3 POST /employer/company-requests "{\"companyId\":\"$CO_ID\",\"place\":\"12 Mill Rd, Temple, TX\",\"name\":\"ignored\"}")
check "a plant asked for by a member" 201 "$OUT" "\"companyId\":\"$CO_ID\""
PLANT_ID=$(printf '%s' "$OUT" | j request.id)
expect "it carries the company's own name" "$CO" "$(sql "SELECT name FROM company_requests WHERE id='$PLANT_ID'")"
check "the admin marks the plant added" 200 "$(req admin PATCH /admin/company-requests/$PLANT_ID '{"decision":"add"}')" '"status":"added"'
# Declined, withdrawn, and how many can wait.
OUT=$(req s2 POST /employer/company-requests "{\"name\":\"$ASK Two\",\"place\":\"Kyle, TX\"}"); check "another person asks" 201 "$OUT"
ASK2=$(printf '%s' "$OUT" | j request.id)
check "one person cannot withdraw another's" 200 "$(req s3 DELETE /employer/company-requests/$ASK2)"
expect "it is still waiting"          requested "$(sql "SELECT status FROM company_requests WHERE id='$ASK2'")"
check "the admin declines it"         200 "$(req admin PATCH /admin/company-requests/$ASK2 '{"decision":"decline"}')" '"status":"declined"'
check "the person reads the answer"   200 "$(req s2 GET /employer/company-requests)" '"status":"declined"'
for n in 1 2 3 4 5; do req s2 POST /employer/company-requests "{\"name\":\"$ASK $n\",\"place\":\"Kyle, TX\"}" >/dev/null; done
check "a sixth request waits for the first five" 409 "$(req s2 POST /employer/company-requests "{\"name\":\"$ASK 6\",\"place\":\"Kyle, TX\"}")" 'requests waiting'
LAST=$(sql "SELECT id FROM company_requests WHERE user_id='$(uid s2)' AND status='requested' ORDER BY created_at DESC LIMIT 1")
check "the person withdraws one"      200 "$(req s2 DELETE /employer/company-requests/$LAST)"
expect "four are left waiting"        4 "$(sql "SELECT COUNT(*) FROM company_requests WHERE user_id='$(uid s2)' AND status='requested'")"
sql "DELETE FROM companies WHERE id='$CO_ID'" >/dev/null
cleanup; trap 'rm -rf "$D"' EXIT
expect "nothing of this run is left behind" "0 0 0 0" "$(sql "SELECT (SELECT COUNT(*) FROM users WHERE email LIKE '%@jobs.test') || ' ' || (SELECT COUNT(*) FROM company_requests WHERE name LIKE 'Jobtest$RUN%') || ' ' || (SELECT COUNT(*) FROM companies WHERE name LIKE 'Jobtest$RUN%') || ' ' || (SELECT COUNT(*) FROM occupations WHERE title LIKE 'Jobtest %$RUN')")"

[ $fail -eq 0 ] && echo "ALL PASSED" || echo "SOME FAILED"
exit $fail
