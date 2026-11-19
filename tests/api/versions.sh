#!/usr/bin/env bash
# End-to-end check of a company's version of a career: the public reads, the
# writes by one of the company's own people and by an admin (with the admin's
# audit line), every refusal, the version following the standard path as it
# changes, a job starting from the version's skills, and merges of skills,
# careers and companies carrying versions with them. Prints one line per check
# and exits non-zero if any fail.
#
# LOCAL ONLY: it creates and deletes users (emails ending @versions.test),
# promotes one to admin with scripts/make-admin.mjs, and adds companies, a
# plant, careers and skills named "E2E Versions <run> ...", all of which, and
# the audit lines they caused, are removed on exit. Never point it at production.
#   API=http://localhost:3000/api DB=postgresql://... bash tests/api/versions.sh
# Needs a running dev API, a database with the skill taxonomy loaded (any
# skill group will do), and psql, curl and node on the PATH.
set -u
. "$(dirname "$0")/lib.sh"
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
D=$(mktemp -d)
RUN=$(date +%s)
CHECK_SHOWS=260
REC="E2E Versions $RUN"

cleanup() {
  psql "$DB" -qtAc "
    DELETE FROM audit_log WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%@versions.test') OR record_name LIKE 'E2E Versions %';
    DELETE FROM jobs WHERE created_by IN (SELECT id FROM users WHERE email LIKE '%@versions.test');
    DELETE FROM users WHERE email LIKE '%@versions.test';
    DELETE FROM companies WHERE name LIKE 'E2E Versions %';
    DELETE FROM occupations WHERE title LIKE 'E2E Versions %';
    DELETE FROM record_merges WHERE from_name LIKE 'E2E Versions %';
    DELETE FROM skills WHERE name LIKE 'E2E Versions %';" >/dev/null
}
cleanup
trap 'cleanup; rm -rf "$D"' EXIT
NOBODY=00000000-0000-4000-8000-000000000000
PW='"password":"correct horse"'

# --- What the checks stand on ------------------------------------------------
check "sign-up admin"                              201 "$(req a POST /auth/sign-up "{\"email\":\"admin-$RUN@versions.test\",\"name\":\"Vera Admin\",$PW}")"
check "sign-up member"                             201 "$(req m POST /auth/sign-up "{\"email\":\"member-$RUN@versions.test\",\"name\":\"Mel Member\",$PW,\"purpose\":\"hire\"}")"
check "sign-up member of another company"          201 "$(req o POST /auth/sign-up "{\"email\":\"other-$RUN@versions.test\",\"name\":\"Otto Other\",$PW,\"purpose\":\"hire\"}")"
check "sign-up person"                             201 "$(req p POST /auth/sign-up "{\"email\":\"person-$RUN@versions.test\",\"name\":\"Pat Person\",$PW}")"
DATABASE_URL="$DB" node "$ROOT/scripts/make-admin.mjs" "admin-$RUN@versions.test" >/dev/null 2>&1
expect "make-admin made the admin"                 0 "$?"
uid() { sql "SELECT id FROM users WHERE email='$1-$RUN@versions.test'"; }
AID=$(uid admin); MID=$(uid member)

GRP=$(sql "SELECT slug FROM skill_groups ORDER BY slug LIMIT 1")
skill() { req a POST /skills "{\"name\":\"$REC Skill $1\",\"group\":\"$GRP\",\"level\":${2:-2}}" | j id; }
make() { req a POST /skills/$1/makes "{\"name\":\"$2\"}" | j id; }
career() { req a POST /occupations "{\"title\":\"$REC $1\"}" | j id; }
company() { req a POST /companies "{\"name\":\"$REC $1\"}" | j id; }
path_is() { req a PUT /occupations/$1/path "{\"skills\":[$2],\"replace\":true,\"status\":\"approved\"}" >/dev/null; }
sk() { printf '{"skillId":"%s"}' "$1"; }

# Six skills: 01 to 04 are the standard path, 05 is one a company adds, 06 joins the standard later.
S1=$(skill 01 1); S2=$(skill 02); S3=$(skill 03); S4=$(skill 04); S5=$(skill 05); S6=$(skill 06 3)
M1=$(make $S1 "Mazak"); M2A=$(make $S2 "Haas"); M2B=$(make $S2 "Okuma"); M5=$(make $S5 "Fanuc"); M6=$(make $S6 "Siemens")
O=$(career "Operator"); O2=$(career "Technician"); O3=$(career "Specialist")
path_is $O "$(sk $S1),$(sk $S2),$(sk $S3),$(sk $S4)"
path_is $O2 "$(sk $S1),$(sk $S6)"
CA=$(company "Alpha Corp"); CB=$(company "Beta")
FA=$(req a POST /factories "{\"companyId\":\"$CA\",\"name\":\"$REC Plant\",\"state\":\"TX\",\"latitude\":30.27,\"longitude\":-97.74,\"city\":\"Austin\"}" | j id)
check "the member is given access to one company" 201 "$(req a POST /admin/memberships "{\"companyId\":\"$CA\",\"userId\":\"$MID\"}")" '"status":"active"'
check "and the other person to another"            201 "$(req a POST /admin/memberships "{\"companyId\":\"$CB\",\"userId\":\"$(uid other)\"}")" '"status":"active"'
expect "the standard path has four skills"         4 "$(req anon GET /occupations/$O | j skills.length)"

V="/companies/$CA/careers"
names() { j "$1.map((s) => s.name.replace('$REC Skill ', '')).join(',')"; }
runs() { j "skills.flatMap((s) => s.makes.filter((m) => m.runs).map((m) => s.name.replace('$REC Skill ', '') + ':' + m.name)).join(',')"; }
stored() { sql "SELECT COALESCE(string_agg(replace(s.name, '$REC Skill ', '') || ':' || x.change, ',' ORDER BY s.name), '') FROM company_career_skills x INNER JOIN company_careers cc ON cc.id = x.company_career_id INNER JOIN skills s ON s.id = x.skill_id WHERE cc.company_id = '$1' AND cc.occupation_id = '$2'"; }
version_lines() { sql "SELECT COUNT(*) FROM audit_log WHERE record_id = '$1' AND action LIKE 'career version%'"; }

# --- Before there is one: the reads, signed out -------------------------------
check "a company with no versions lists none"      200 "$(req anon GET $V)" '"versions":\[\]'
check "a career no company has a version of"       200 "$(req anon GET /occupations/$O/versions)" '"versions":\[\]'
check "the career's own answer says the same"      200 "$(req anon GET /occupations/$O)" '"versions":\[\]'
check "a version that is not there"                404 "$(req anon GET $V/$O)" 'no version of that career'
check "a company that is not there"                404 "$(req anon GET /companies/$NOBODY/careers)" 'Company not found'
check "a slug no company has"                      404 "$(req anon GET /companies/no-such-company-$RUN/careers)"
check "something that is neither an id nor a slug" 400 "$(req anon GET '/companies/Not%20A%20Slug!/careers')"
check "a career id that is not one"                400 "$(req anon GET $V/not-an-id)"
check "the reads are not cached"                   200 "$(curl -s -D - -o /dev/null -w '\n%{http_code}' "$API$V" | grep -i '^cache-control\|^[0-9]')" 'no-store'

# --- Adding one: the company's own people, or an admin ------------------------
check "401 add, signed out"                        401 "$(req anon POST $V "{\"occupationId\":\"$O\"}")"
check "403 add, no tie to any company"             403 "$(req p POST $V "{\"occupationId\":\"$O\"}")" "company's own people"
check "403 add, a member of another company"       403 "$(req o POST $V "{\"occupationId\":\"$O\"}")"
check "add needs a career"                         400 "$(req m POST $V '{}')" '"field":"occupationId"'
check "a career that is not there"                 400 "$(req m POST $V "{\"occupationId\":\"$NOBODY\"}")" '"field":"occupationId"'
check "a company that is not there, as an admin"   404 "$(req a POST /companies/$NOBODY/careers "{\"occupationId\":\"$O\"}")"
check "a write does not take a slug"               400 "$(req a POST /companies/some-slug/careers "{\"occupationId\":\"$O\"}")"
expect "nothing was added by any of that"          0 "$(sql "SELECT COUNT(*) FROM company_careers WHERE company_id IN ('$CA', '$CB')")"
OTHERS=$(sql "SELECT COUNT(*) FROM company_careers")
OUT=$(req m POST $V "{\"occupationId\":\"$O\"}")
check "a member adds the company's version"        201 "$OUT" '"origin":"member"'
expect "titled with the company as it is said"     "$REC Alpha $REC Operator" "$(printf '%s' "$OUT" | j title)"
expect "it starts as the standard path"            "01,02,03,04|" "$(printf '%s' "$OUT" | names skills)|$(printf '%s' "$OUT" | names leftOut)"
expect "each skill with its place"                 "1 $GRP" "$(printf '%s' "$OUT" | j 'skills[0].level + " " + o.skills[0].group.slug')"
expect "and its makes, none run yet"               "Haas:false,Okuma:false" "$(printf '%s' "$OUT" | j 'skills[1].makes.map((m) => m.name + ":" + m.runs).join(",")')"
OUT=$(req m POST $V "{\"occupationId\":\"$O\"}")
check "the same career again"                      409 "$OUT" "\"existing\":{\"companyId\":\"$CA\",\"occupationId\":\"$O\""
expect "a version with no changes is one"          "0 0 0" "$(req anon GET $V | j 'versions.length === 1 && [o.versions[0].added, o.versions[0].leftOut, o.versions[0].makes.length].join(" ")')"
expect "who wrote it is on the version"            "$MID $MID" "$(sql "SELECT created_by || ' ' || updated_by FROM company_careers WHERE company_id='$CA' AND occupation_id='$O'")"
expect "a member's write is not in the audit log"  0 "$(version_lines $CA)"

# --- Changing it ---------------------------------------------------------------
check "401 change, signed out"                     401 "$(req anon PUT $V/$O "{\"leftOut\":[\"$S1\"]}")"
check "403 change, no tie to the company"          403 "$(req p PUT $V/$O "{\"leftOut\":[\"$S1\"]}")"
check "403 change, a member of another company"    403 "$(req o PUT $V/$O "{\"leftOut\":[\"$S1\"]}")"
check "a version that is not there"                404 "$(req m PUT $V/$O2 "{\"leftOut\":[\"$S1\"]}")"
OUT=$(req m PUT $V/$O "{\"leftOut\":[\"$S1\"],\"added\":[\"$S5\"],\"makes\":[\"$M2A\",\"$M5\"]}")
check "a member leaves one out, adds one, says two makes" 200 "$OUT"
expect "the path is the standard with the changes" "02,03,04,05|01" "$(printf '%s' "$OUT" | names skills)|$(printf '%s' "$OUT" | names leftOut)"
expect "the addition says it is one"               "02:false,03:false,04:false,05:true" "$(printf '%s' "$OUT" | j "skills.map((s) => s.name.replace('$REC Skill ', '') + ':' + s.added).join(',')")"
expect "and the makes it runs"                     "02:Haas,05:Fanuc" "$(printf '%s' "$OUT" | runs)"
OUT=$(req anon GET $V/$O)
check "anyone reads it, signed out"                200 "$OUT" '"jobs":\[\]'
expect "as it was saved"                           "02,03,04,05|01|02:Haas,05:Fanuc" "$(printf '%s' "$OUT" | names skills)|$(printf '%s' "$OUT" | names leftOut)|$(printf '%s' "$OUT" | runs)"
expect "every skill has its place among them all"  "0,1,2,3,4" "$(printf '%s' "$OUT" | j 'skills.concat(o.leftOut).map((s) => s.order).sort().join(",")')"
OUT=$(req anon GET $V)
expect "the company's list says how it differs"    "1 1 Haas,Fanuc" "$(printf '%s' "$OUT" | j 'versions[0].added + " " + o.versions[0].leftOut + " " + o.versions[0].makes.join(",")')"
expect "the career lists the company"              "$CA 1 1" "$(req anon GET /occupations/$O/versions | j 'versions.map((v) => [v.company.id, v.added, v.leftOut].join(" ")).join("|")')"
expect "so does the career's own answer"           "$REC Alpha Corp" "$(req anon GET /occupations/$O | j 'versions[0].company.name')"
expect "and the company's own answer its careers"  "$REC Operator" "$(req anon GET /companies/$CA | j 'versions[0].occupation.title')"
expect "the standard path is as it was"            "01,02,03,04" "$(req anon GET /occupations/$O | names skills)"
expect "what is stored is the difference, not the path" "01:left_out,05:added" "$(stored $CA $O)"

check "a change that says nothing"                 400 "$(req m PUT $V/$O '{}')" 'Nothing to change'
check "leftOut that is not a list"                 400 "$(req m PUT $V/$O '{"leftOut":"all"}')" '"field":"leftOut"'
check "leftOut that is not ids"                    400 "$(req m PUT $V/$O '{"leftOut":["Welding"]}')" '"field":"leftOut"'
check "only a standard skill can be left out"      400 "$(req m PUT $V/$O "{\"leftOut\":[\"$S6\"]}")" '"field":"leftOut"'
check "not one the version adds"                   400 "$(req m PUT $V/$O "{\"leftOut\":[\"$S5\"]}")" '"field":"leftOut"'
check "added that is not a list"                   400 "$(req m PUT $V/$O "{\"added\":\"$S5\"}")" '"field":"added"'
check "a skill that is not there cannot be added"  400 "$(req m PUT $V/$O "{\"added\":[\"$NOBODY\"]}")" '"field":"added"'
MANY=$(node -e "console.log(JSON.stringify(Array.from({length: 41}, (_, i) => '00000000-0000-4000-8000-' + String(i + 1).padStart(12, '0'))))")
check "nor 41 at once"                             400 "$(req m PUT $V/$O "{\"added\":$MANY}")" '"field":"added"'
check "makes that are not a list"                  400 "$(req m PUT $V/$O "{\"makes\":\"$M2A\"}")" '"field":"makes"'
check "a make that is not there"                   400 "$(req m PUT $V/$O "{\"makes\":[\"$NOBODY\"]}")" '"field":"makes"'
check "a make of a skill that is not on the path"  400 "$(req m PUT $V/$O "{\"makes\":[\"$M6\"]}")" '"field":"makes"'
check "a make of a skill that is left out"         400 "$(req m PUT $V/$O "{\"makes\":[\"$M1\"]}")" '"field":"makes"'
check "a make of a skill left out in the same save" 400 "$(req m PUT $V/$O "{\"leftOut\":[\"$S1\",\"$S2\"],\"makes\":[\"$M2A\"]}")" '"field":"makes"'
OUT=$(req anon GET $V/$O)
expect "a refused change changed nothing"          "02,03,04,05|01|02:Haas,05:Fanuc" "$(printf '%s' "$OUT" | names skills)|$(printf '%s' "$OUT" | names leftOut)|$(printf '%s' "$OUT" | runs)"

OUT=$(req m PUT $V/$O "{\"makes\":[\"$M2A\",\"$M2B\",\"$M5\"]}")
expect "one list sent leaves the others as they are" "02,03,04,05|01|02:Haas,02:Okuma,05:Fanuc" "$(printf '%s' "$OUT" | names skills)|$(printf '%s' "$OUT" | names leftOut)|$(printf '%s' "$OUT" | runs)"
OUT=$(req m PUT $V/$O "{\"added\":[\"$S5\",\"$S2\"]}")
check "adding a skill the standard has"            200 "$OUT"
expect "stores no addition for it"                 "01:left_out,05:added" "$(stored $CA $O)"
OUT=$(req m PUT $V/$O '{"added":[]}')
expect "a skill that leaves the path takes its makes" "02,03,04|02:Haas,02:Okuma" "$(printf '%s' "$OUT" | names skills)|$(printf '%s' "$OUT" | runs)"
expect "in the database too"                       0 "$(sql "SELECT COUNT(*) FROM company_career_makes WHERE skill_id = '$S5'")"
OUT=$(req m PUT $V/$O "{\"leftOut\":[],\"makes\":[\"$M1\",\"$M2A\"]}")
expect "a skill put back can run its makes"        "01,02,03,04||01:Mazak,02:Haas" "$(printf '%s' "$OUT" | names skills)|$(printf '%s' "$OUT" | names leftOut)|$(printf '%s' "$OUT" | runs)"
OUT=$(req m PUT $V/$O "{\"leftOut\":[\"$S1\"],\"added\":[\"$S5\"],\"makes\":[\"$M2A\",\"$M2B\",\"$M5\"]}")
expect "and the version is set as a whole again"   "02,03,04,05|01|02:Haas,02:Okuma,05:Fanuc" "$(printf '%s' "$OUT" | names skills)|$(printf '%s' "$OUT" | names leftOut)|$(printf '%s' "$OUT" | runs)"
expect "still nothing in the audit log"            0 "$(version_lines $CA)"

# --- An admin writes for a company, and it is on record -------------------------
OUT=$(req a PUT $V/$O "{\"leftOut\":[\"$S1\",\"$S3\"]}")
check "an admin changes a company's version"       200 "$OUT"
expect "the change is the admin's"                 "02,04,05|01,03" "$(printf '%s' "$OUT" | names skills)|$(printf '%s' "$OUT" | names leftOut)"
OUT=$(req a GET "/admin/audit?kind=company&record=$CA")
expect "with its line in the audit log"            "career version changed|$REC Alpha Corp · $REC Operator|Vera Admin" "$(printf '%s' "$OUT" | j 'entries[0].action + "|" + o.entries[0].recordName + "|" + o.entries[0].actorName')"
expect "which says what changed, in words"         "$REC Skill 01>$REC Skill 01,$REC Skill 03" "$(printf '%s' "$OUT" | j 'entries[0].detail.changes.leavesOut.map((l) => l.join(",")).join(">")')"
expect "and only what changed"                     "leavesOut" "$(printf '%s' "$OUT" | j 'entries.slice(0, 1).map((e) => Object.keys(e.detail.changes).join(","))[0]')"
check "the same again"                             200 "$(req a PUT $V/$O "{\"leftOut\":[\"$S1\",\"$S3\"]}")"
expect "writes no second line"                     1 "$(version_lines $CA)"
expect "the version is still the member's, last changed by the admin" "member $AID" "$(sql "SELECT origin || ' ' || updated_by FROM company_careers WHERE company_id='$CA' AND occupation_id='$O'")"
OUT=$(req a POST /companies/$CB/careers "{\"occupationId\":\"$O2\"}")
check "an admin adds a version for a company they are not in" 201 "$OUT" '"origin":"admin"'
expect "and that is on record"                     "career version added" "$(req a GET "/admin/audit?kind=company&record=$CB" | j 'entries[0].action')"
check "an admin's change to it"                    200 "$(req a PUT /companies/$CB/careers/$O2 "{\"leftOut\":[\"$S1\"],\"makes\":[\"$M6\"]}")"
check "the admin deletes it"                       200 "$(req a DELETE /companies/$CB/careers/$O2)" '"ok":true'
OUT=$(req a GET "/admin/audit?kind=company&record=$CB")
expect "and the line says what it held"            "career version deleted|$REC Skill 01|$REC Skill 06: Siemens" "$(printf '%s' "$OUT" | j 'entries[0].action + "|" + o.entries[0].detail.leavesOut.join(",") + "|" + o.entries[0].detail.runs.join(",")')"
check "the member of that company adds it again"   201 "$(req o POST /companies/$CB/careers "{\"occupationId\":\"$O2\"}")" '"origin":"member"'

# --- The version follows the standard ---------------------------------------------
# Now: the standard is 01 02 03 04; the version leaves out 01 and 03, adds 05, runs 02:Haas, 02:Okuma, 05:Fanuc.
req a PUT /occupations/$O/path "{\"skills\":[$(sk $S6)]}" >/dev/null
OUT=$(req anon GET $V/$O)
expect "a skill added to the standard is in the version" "02,04,05,06|01,03" "$(printf '%s' "$OUT" | names skills)|$(printf '%s' "$OUT" | names leftOut)"
expect "as a standard skill, not an addition"      false "$(printf '%s' "$OUT" | j "skills.find((s) => s.id === '$S6').added")"
path_is $O "$(sk $S2),$(sk $S3),$(sk $S4),$(sk $S6)"
OUT=$(req anon GET $V/$O)
check "a left-out skill leaves the standard: no error" 200 "$OUT"
expect "and it is gone from the version's changes" "02,04,05,06|03" "$(printf '%s' "$OUT" | names skills)|$(printf '%s' "$OUT" | names leftOut)"
expect "the lists count what applies"              "1 1" "$(req anon GET $V | j 'versions[0].added + " " + o.versions[0].leftOut')"
expect "the change is kept, unread"                "01:left_out,03:left_out,05:added" "$(stored $CA $O)"
path_is $O "$(sk $S1),$(sk $S2),$(sk $S3),$(sk $S4),$(sk $S6)"
expect "and applies again if the standard changes back" "01,03" "$(req anon GET $V/$O | names leftOut)"
path_is $O "$(sk $S2),$(sk $S3),$(sk $S4),$(sk $S6)"
check "the next save of the version"               200 "$(req m PUT $V/$O "{\"leftOut\":[\"$S3\"]}")"
expect "drops the change that no longer applies"   "03:left_out,05:added" "$(stored $CA $O)"
# The standard takes up the skill the version adds.
path_is $O "$(sk $S2),$(sk $S3),$(sk $S4),$(sk $S5),$(sk $S6)"
OUT=$(req anon GET $V/$O)
expect "a skill the standard takes up is no longer an addition" "02,04,05,06|false|0" "$(printf '%s' "$OUT" | names skills)|$(printf '%s' "$OUT" | j "skills.find((s) => s.id === '$S5').added")|$(req anon GET $V | j 'versions[0].added')"
expect "and its makes stay"                        "02:Haas,02:Okuma,05:Fanuc" "$(printf '%s' "$OUT" | runs)"
path_is $O "$(sk $S2),$(sk $S3),$(sk $S4),$(sk $S6)"
expect "dropped from the standard again, the company still adds it" true "$(req anon GET $V/$O | j "skills.find((s) => s.id === '$S5').added")"
# A standard path deleted and written again (as a migration might) touches no version.
sql "DELETE FROM occupation_skills WHERE occupation_id = '$O'" >/dev/null
OUT=$(req anon GET $V/$O)
check "a career with no path at all"               200 "$OUT"
expect "leaves the version what it adds"           "05|" "$(printf '%s' "$OUT" | names skills)|$(printf '%s' "$OUT" | names leftOut)"
path_is $O "$(sk $S2),$(sk $S3),$(sk $S4),$(sk $S6)"
OUT=$(req anon GET $V/$O)
expect "the path written again, the version is as it was" "02,04,05,06|03|02:Haas,02:Okuma,05:Fanuc" "$(printf '%s' "$OUT" | names skills)|$(printf '%s' "$OUT" | names leftOut)|$(printf '%s' "$OUT" | runs)"

# --- A job starts from the version ---------------------------------------------------
JOB=$(req m POST /jobs "{\"companyId\":\"$CA\",\"factoryId\":\"$FA\",\"occupationId\":\"$O\",\"payMin\":2400,\"payMax\":3000}" | j id)
OUT=$(req anon GET /jobs/$JOB)
check "a job posted without skills"                200 "$OUT" '"hasVersion":true'
expect "takes the version's, Advanced optional"    "02:true,04:true,05:true,06:false" "$(printf '%s' "$OUT" | j "skills.map((s) => s.name.replace('$REC Skill ', '') + ':' + s.required).sort().join(',')")"
expect "the version's page lists the job"          "$JOB" "$(req anon GET $V/$O | j 'jobs.map((job) => job.id).join(",")')"
JOB2=$(req m POST /jobs "{\"companyId\":\"$CA\",\"factoryId\":\"$FA\",\"occupationId\":\"$O2\",\"payMin\":2400,\"payMax\":3000}" | j id)
OUT=$(req anon GET /jobs/$JOB2)
check "a job for a career the company has no version of" 200 "$OUT" '"hasVersion":false'
expect "takes the standard's"                      "01,06" "$(printf '%s' "$OUT" | j "skills.map((s) => s.name.replace('$REC Skill ', '')).sort().join(',')")"

# --- A merge of skills carries a version's changes and makes ---------------------------
# The standard is 02 03 04 06; the version leaves out 03, adds 05 (Fanuc), runs 02:Haas, 02:Okuma.
# 1. The added skill is merged into one that is on no path: the addition and its make go with it.
S7=$(skill 07)
check "merge the added skill into another"         200 "$(req a POST /admin/records/skill/$S5/merge "{\"into\":\"$S7\"}")"
OUT=$(req anon GET $V/$O)
expect "the version adds the kept skill"           "02,04,07,06|true" "$(printf '%s' "$OUT" | names skills)|$(printf '%s' "$OUT" | j "skills.find((s) => s.id === '$S7').added")"
expect "and runs the make that moved with it"      "02:Haas,02:Okuma,07:Fanuc" "$(printf '%s' "$OUT" | runs)"
# 2. The left-out skill is merged into one that is on no path: the standard takes the kept skill, still left out.
S8=$(skill 08)
check "merge the left-out skill into another"      200 "$(req a POST /admin/records/skill/$S3/merge "{\"into\":\"$S8\"}")"
OUT=$(req anon GET $V/$O)
expect "the kept skill is on the standard"         "02,04,08,06" "$(req anon GET /occupations/$O | names skills)"
expect "and left out of the version"               "02,04,07,06|08" "$(printf '%s' "$OUT" | names skills)|$(printf '%s' "$OUT" | names leftOut)"
# 3. A skill whose makes are run is merged into one that already has a make of the same name.
S9=$(skill 09); M9=$(make $S9 "HAAS")
check "merge a skill with makes into one that has one of them" 200 "$(req a POST /admin/records/skill/$S2/merge "{\"into\":\"$S9\"}")"
OUT=$(req anon GET $V/$O)
expect "the makes are the kept skill's: its own, and the one that moved" "HAAS:true,Okuma:true" "$(printf '%s' "$OUT" | j "skills.find((s) => s.id === '$S9').makes.map((m) => m.name + ':' + m.runs).join(',')")"
expect "run under the kept skill's own make"       1 "$(sql "SELECT COUNT(*) FROM company_career_makes WHERE make_id = '$M9'")"
# 4. A skill left out is merged into one the version keeps: the kept skill stays on the path.
S10=$(skill 10)
req a PUT /occupations/$O/path "{\"skills\":[$(sk $S10)]}" >/dev/null
check "leave out one more"                         200 "$(req m PUT $V/$O "{\"leftOut\":[\"$S8\",\"$S10\"]}")"
check "merge it into a skill the version keeps"    200 "$(req a POST /admin/records/skill/$S10/merge "{\"into\":\"$S4\"}")"
OUT=$(req anon GET $V/$O)
expect "the kept skill is still on the version's path" "04,07,09,06|08" "$(printf '%s' "$OUT" | names skills)|$(printf '%s' "$OUT" | names leftOut)"
expect "no change is left for a skill that is gone" "07:added,08:left_out" "$(stored $CA $O)"

# --- A merge of careers, and of companies, carries versions ------------------------------
# Alpha has a version of Operator; Beta has one of Technician. Technician is merged into Operator.
check "Alpha adds its version of the second career" 201 "$(req m POST $V "{\"occupationId\":\"$O2\"}")"
check "merge the second career into the first"     200 "$(req a POST /admin/records/career/$O2/merge "{\"into\":\"$O\"}")"
expect "a version of the merged career is one of the kept career" "$CB" "$(sql "SELECT company_id FROM company_careers WHERE occupation_id = '$O' AND company_id = '$CB'")"
expect "a company with a version of both keeps the kept career's" "1|07:added,08:left_out" "$(sql "SELECT COUNT(*) FROM company_careers WHERE company_id = '$CA'")|$(stored $CA $O)"
expect "the career lists both companies"           2 "$(req anon GET /occupations/$O/versions | j versions.length)"
# Beta also has a version of a third career. Beta is merged into Alpha.
check "Beta adds a version of a third career"      201 "$(req o POST /companies/$CB/careers "{\"occupationId\":\"$O3\"}")"
check "merge the second company into the first"    200 "$(req a POST /admin/records/company/$CB/merge "{\"into\":\"$CA\"}")"
expect "its version of another career came along"  "$REC Operator,$REC Specialist" "$(req anon GET $V | j 'versions.map((v) => v.occupation.title).join(",")')"
expect "the kept company's own version stands"     "07:added,08:left_out" "$(stored $CA $O)"
expect "and nothing is left of the merged company's" "2 0" "$(sql "SELECT (SELECT COUNT(*) FROM company_careers WHERE company_id = '$CA') || ' ' || (SELECT COUNT(*) FROM company_careers WHERE company_id = '$CB')")"

# --- Deleting one ------------------------------------------------------------------------
check "401 delete, signed out"                     401 "$(req anon DELETE $V/$O3)"
check "403 delete, no tie to the company"          403 "$(req p DELETE $V/$O3)"
check "a member deletes a version"                 200 "$(req m DELETE $V/$O3)" "\"title\":\"$REC Alpha $REC Specialist\""
check "it is gone"                                 404 "$(req anon GET $V/$O3)"
check "deleting it again"                          404 "$(req m DELETE $V/$O3)"
expect "the career is still there"                 "$REC Specialist" "$(req anon GET /occupations/$O3 | j title)"
# A skill, a career or a company that is deleted takes what versions say of it.
check "delete a skill the version adds"            200 "$(req a DELETE /skills/$S7)"
expect "the addition goes with it"                 "08:left_out" "$(stored $CA $O)"
check "close the jobs' way: delete them"           200 "$(req m DELETE /jobs/$JOB)"
check "and the other"                              200 "$(req m DELETE /jobs/$JOB2)"
check "delete the career"                          200 "$(req a DELETE /occupations/$O)"
expect "its versions go with it"                   0 "$(sql "SELECT COUNT(*) FROM company_careers WHERE company_id = '$CA'")"

expect "no other company's version was touched"     "$OTHERS" "$(sql "SELECT COUNT(*) FROM company_careers")"
cleanup
expect "nothing of this run is left behind"        '0 0 0 0 0' "$(sql "SELECT (SELECT COUNT(*) FROM users WHERE email LIKE '%@versions.test') || ' ' || (SELECT COUNT(*) FROM companies WHERE name LIKE 'E2E Versions %') || ' ' || (SELECT COUNT(*) FROM occupations WHERE title LIKE 'E2E Versions %') || ' ' || (SELECT COUNT(*) FROM skills WHERE name LIKE 'E2E Versions %') || ' ' || (SELECT COUNT(*) FROM audit_log WHERE record_name LIKE 'E2E Versions %')")"
finish
