#!/usr/bin/env bash
# End-to-end check of data upkeep in Admin Tools: correcting, merging and
# deleting records, the audit log, people (roles, corrections, sessions, the
# first admin), access decisions taken back, and invites. Prints one line per
# check and exits non-zero if any fail.
#
# LOCAL ONLY: it creates and deletes users and invites (emails ending
# @admin.test), promotes one to admin with scripts/make-admin.mjs, and adds,
# merges and deletes companies, factories, careers and skills named
# "E2E Admin <run> ...". The audit lines it causes are removed at the end.
# Never point it at production.
#   API=http://localhost:3000/api DB=postgresql://... bash tests/api/admin.sh
# Needs a running dev API, and psql, curl and node on the PATH.
set -u
. "$(dirname "$0")/lib.sh"
D=$(mktemp -d)
RUN=$(date +%s)
# This suite's refusals run long: a failed check prints more of the body.
CHECK_SHOWS=240

REC="E2E Admin $RUN"
cleanup() {
  psql "$DB" -qtAc "
    DELETE FROM audit_log WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%@admin.test') OR record_name LIKE 'E2E Admin %' OR record_name LIKE '%@admin.test%';
    DELETE FROM jobs WHERE title LIKE 'E2E Admin %';
    DELETE FROM users WHERE email LIKE '%@admin.test';
    DELETE FROM invites WHERE email LIKE '%@admin.test';
    DELETE FROM external_references WHERE url LIKE 'https://e2e-admin.example.com/%';
    DELETE FROM record_merges WHERE from_name LIKE 'E2E Admin %';
    DELETE FROM companies WHERE name LIKE 'E2E Admin %';
    DELETE FROM occupations WHERE title LIKE 'E2E Admin %';
    DELETE FROM skills WHERE name LIKE 'E2E Admin %';" >/dev/null
}
cleanup
trap 'cleanup; rm -rf "$D"' EXIT
NOBODY=00000000-0000-4000-8000-000000000000
PW='"password":"correct horse"'

# --- Accounts ---------------------------------------------------------------
check "sign-up admin"                 201 "$(req a POST /auth/sign-up "{\"email\":\"admin-$RUN@admin.test\",\"name\":\"Ada Admin\",$PW}")"
check "sign-up second admin"          201 "$(req b POST /auth/sign-up "{\"email\":\"second-$RUN@admin.test\",\"name\":\"Bo Second\",$PW}")"
check "sign-up person"                201 "$(req p POST /auth/sign-up "{\"email\":\"person-$RUN@admin.test\",\"name\":\"Pat Person\",$PW}")"
check "a name over 80 characters says so" 400 "$(req x POST /auth/sign-up "{\"email\":\"long-$RUN@admin.test\",\"name\":\"$(printf 'n%.0s' $(seq 1 90))\",$PW}")" 'up to 80 characters'
check "one of the most common passwords" 400 "$(req x POST /auth/sign-up "{\"email\":\"weak-$RUN@admin.test\",\"name\":\"Weak\",\"password\":\"Password123\"}")" 'most common'
DATABASE_URL="$DB" node "$(cd "$(dirname "$0")/../.." && pwd)/scripts/make-admin.mjs" "admin-$RUN@admin.test" >/dev/null 2>&1
expect "make-admin made the admin"    0 "$?"
AID=$(sql "SELECT id FROM users WHERE email='admin-$RUN@admin.test'")
BID=$(sql "SELECT id FROM users WHERE email='second-$RUN@admin.test'")
PID=$(sql "SELECT id FROM users WHERE email='person-$RUN@admin.test'")
expect "make-admin records when"      t "$(sql "SELECT admin_since IS NOT NULL FROM users WHERE id='$AID'")"

# --- The new routes are closed to everyone but an admin ----------------------
for path in "/admin/records/company?q=te" "/admin/records/company/similar?name=Tesla" "/admin/records/company/$NOBODY" "/admin/audit" "/admin/invites/past" "/admin/quality"; do
  check "401 GET $path"               401 "$(req anon GET "$path")"
  check "403 GET $path"               403 "$(req p GET "$path")"
done
check "403 merge"                     403 "$(req p POST /admin/records/company/$NOBODY/merge "{\"into\":\"$NOBODY\"}")"
check "403 sign a person out"         403 "$(req p POST /admin/users/$AID/sign-out)"
check "403 correct a person"          403 "$(req p PATCH /admin/users/$AID '{"name":"Mallory"}')"
check "unknown kind of record"        404 "$(req a GET '/admin/records/widget?q=te')"

# --- Correcting a company ---------------------------------------------------
OUT=$(req a POST /companies "{\"name\":\"$REC Motors Inc\",\"industry\":\"Robotics\"}")
check "add a company"                 201 "$OUT"
CA=$(printf '%s' "$OUT" | j id)
OUT=$(req a POST /companies "{\"name\":\"$REC Motors\"}")
CB=$(printf '%s' "$OUT" | j id)
check "an empty name is refused"      400 "$(req a PUT /companies/$CA '{"name":"  "}')" '"field":"name"'
check "a taken name is refused"       409 "$(req a PUT /companies/$CA "{\"name\":\"$REC MOTORS\"}")" "\"existing\":{\"id\":\"$CB\""
check "a pasted address becomes a domain" 200 "$(req a PUT /companies/$CA '{"domain":"https://www.E2E-Admin.example.com/about?x=1"}')" '"domain":"e2e-admin.example.com"'
check "what is not a domain is refused" 400 "$(req a PUT /companies/$CA '{"domain":"not a domain"}')" '"field":"domain"'
check "headquarters need both"        400 "$(req a PUT /companies/$CA '{"headquartersLat":30.2}')" '"field":"headquartersLng"'
check "a latitude out of range"       400 "$(req a PUT /companies/$CA '{"headquartersLat":95,"headquartersLng":-97}')" '"field":"headquartersLat"'
check "featured must be a boolean"    400 "$(req a PUT /companies/$CA '{"featured":"yes"}')"
check "aliases must be a list"        400 "$(req a PUT /companies/$CA '{"aliases":"E2E"}')" '"field":"aliases"'
OUT=$(req a PUT /companies/$CA "{\"description\":\"  Makes   test cars. \",\"featured\":true,\"aliases\":[\"$REC Cars\",\" $REC cars \",\"$REC Motors Inc\"],\"headquartersLat\":30.2,\"headquartersLng\":-97.7}")
check "correct several fields"        200 "$OUT" '"description":"Makes test cars."'
expect "aliases drop repeats and the own name" "$REC Cars" "$(printf '%s' "$OUT" | j 'aliases.join("|")')"
check "a change keeps what it left out" 200 "$(req a GET /admin/records/company/$CA)" '"industry":"Robotics"'
expect "an unchanged save writes no line" 2 "$(req a PUT /companies/$CA '{"featured":true}' >/dev/null; sql "SELECT COUNT(*) FROM audit_log WHERE record_id='$CA' AND action='edited'")"
OUT=$(req a GET "/admin/audit?kind=company&record=$CA")
check "the company's history"         200 "$OUT" '"action":"edited"'
expect "a line says who"              "Ada Admin" "$(printf '%s' "$OUT" | j 'entries[0].actorName')"
expect "and what changed, before and after" 'false>true' "$(printf '%s' "$OUT" | j 'entries[0].detail.changes.featured.join(">")')"
expect "adding is on record too"      added "$(printf '%s' "$OUT" | j 'entries.slice(-1)[0].action')"
check "the admin profile route records the same" 200 "$(req a PATCH /admin/companies/$CA '{"featured":false}')" '"featured":false'
expect "one more line"                3 "$(sql "SELECT COUNT(*) FROM audit_log WHERE record_id='$CA' AND action='edited'")"

# --- Correcting a factory ---------------------------------------------------
OUT=$(req a POST /factories "{\"companyId\":\"$CA\",\"name\":\"$REC Plant\",\"state\":\"TX\",\"latitude\":30.27,\"longitude\":-97.74}")
FA=$(printf '%s' "$OUT" | j id)
req a POST /factories "{\"companyId\":\"$CB\",\"name\":\"$REC Plant Two\",\"state\":\"TX\",\"latitude\":31.1,\"longitude\":-97.1}" >/dev/null
IND=$(sql "SELECT industry FROM industry_occupations ORDER BY 1 LIMIT 1")
check "address, city and industry"    200 "$(req a PUT /factories/$FA "{\"address\":\"1 Test Way\",\"city\":\"Austin\",\"industry\":\"$IND\"}")" '"city":"Austin"'
expect "the industry is stored"       "$IND" "$(sql "SELECT primary_naics_description FROM factories WHERE id='$FA'")"
check "an industry not on the list"   400 "$(req a PUT /factories/$FA '{"industry":"Made-up Manufacturing"}')" '"field":"industry"'
check "a latitude of thirty"          400 "$(req a PUT /factories/$FA '{"latitude":"thirty"}')" '"field":"latitude"'
check "a state that is not one"       400 "$(req a PUT /factories/$FA '{"state":"Texas"}')" '"field":"state"'
check "a company that does not exist" 400 "$(req a PUT /factories/$FA "{\"companyId\":\"$NOBODY\"}")" '"field":"company"'
check "the editor reads the factory"  200 "$(req a GET /admin/records/factory/$FA)" "\"companyName\":\"$REC Motors Inc\""
check "factories near a point"        200 "$(req a GET "/admin/records/factory/similar?name=Other&lat=30.2701&lng=-97.7401")" "\"id\":\"$FA\""
check "factories are not merged"      400 "$(req a POST /admin/records/factory/$FA/merge "{\"into\":\"$FA\"}")"

# --- A factory's depth: people, what it makes, when it opened ---------------
check "people with year, source and note" 200 "$(req a PUT /factories/$FA '{"workforceSize":4500,"workforceYear":2024,"workforceSource":"https://e2e-admin.example.com/fact-sheet","workforceNote":"Includes  contractors","products":"Logic chips","openedYear":1997,"status":"under construction"}')" '"workforceSize":4500'
expect "they are stored, and the plant counts as described" "4500|2024|https://e2e-admin.example.com/fact-sheet|Includes contractors|Logic chips|1997|under construction|t" \
  "$(sql "SELECT concat_ws('|', workforce_size, workforce_year, workforce_source, workforce_note, products, opened_year, status, curated) FROM factories WHERE id='$FA'")"
check "the editor reads them"         200 "$(req a GET /admin/records/factory/$FA)" '"workforceYear":2024'
check "the factory's page carries them" 200 "$(req p GET /factories/$FA)" '"products":"Logic chips","openedYear":1997,"status":"under construction","curated":true'
expect "the history has the figure, before and after" '>4500' "$(req a GET "/admin/audit?kind=factory&record=$FA" | j 'entries[0].detail.changes.workforceSize.join(">")')"
expect "and what it makes"            '>Logic chips' "$(req a GET "/admin/audit?kind=factory&record=$FA" | j 'entries[0].detail.changes.products.join(">")')"
check "a year that is not one"        400 "$(req a PUT /factories/$FA '{"workforceYear":"last year"}')" '"field":"workforceYear"'
check "a source that is not a web address" 400 "$(req a PUT /factories/$FA '{"workforceSource":"the plant manager"}')" '"field":"workforceSource"'
check "an opening year yet to come"   400 "$(req a PUT /factories/$FA '{"openedYear":2199}')" '"field":"openedYear"'
check "a status that is not one"      400 "$(req a PUT /factories/$FA '{"status":"closed"}')" '"field":"status"'
check "people that are not a number"  400 "$(req a PUT /factories/$FA '{"workforceSize":"many"}')" '"field":"workforceSize"'
check "a refused change changed nothing" 200 "$(req a GET /admin/records/factory/$FA)" '"status":"under construction"'
check "clearing the figure clears what described it" 200 "$(req a PUT /factories/$FA '{"workforceSize":null,"status":"operating"}')" '"workforceYear":null,"workforceSource":null,"workforceNote":null'

# --- A company's depth: what it is part of, and its headquarters ------------
check "part of, and headquarters"     200 "$(req a PUT /companies/$CB "{\"parentCompanyId\":\"$CA\",\"headquartersCity\":\"Fort Worth\",\"headquartersState\":\"tx\",\"headquartersCountry\":\"US\"}")" '"headquartersState":"TX"'
check "the editor reads them"         200 "$(req a GET /admin/records/company/$CB)" "\"parentCompanyId\":\"$CA\",\"parentName\":\"$REC Motors Inc\""
expect "the history names the parent" ">$REC Motors Inc" "$(req a GET "/admin/audit?kind=company&record=$CB" | j 'entries[0].detail.changes.parent.join(">")')"
check "the company's page says what it is part of" 200 "$(req p GET /companies/$CB)" "\"parent\":{\"id\":\"$CA\""
check "and its headquarters"          200 "$(req p GET /companies/$CB)" '"headquarters":{"city":"Fort Worth","state":"TX","country":"US"}'
check "the parent's page lists it"    200 "$(req p GET /companies/$CA)" "\"subsidiaries\":\[{\"id\":\"$CB\""
check "a company is not part of its own part" 400 "$(req a PUT /companies/$CA "{\"parentCompanyId\":\"$CB\"}")" '"field":"parent"'
check "nor of itself"                 400 "$(req a PUT /companies/$CB "{\"parentCompanyId\":\"$CB\"}")" '"field":"parent"'
check "nor of a company that is not there" 400 "$(req a PUT /companies/$CB "{\"parentCompanyId\":\"$NOBODY\"}")" '"field":"parent"'
check "a headquarters state that is not one" 400 "$(req a PUT /companies/$CB '{"headquartersState":"Texas"}')" '"field":"headquartersState"'
check "a company can stand alone again" 200 "$(req a PUT /companies/$CB '{"parentCompanyId":null}')" '"parentCompanyId":null'

# --- Near-duplicates ---------------------------------------------------------
OUT=$(req a GET "/admin/records/company/similar?name=$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "$REC Motors Corp")")
check "a name with another ending is close" 200 "$OUT" "\"id\":\"$CB\""
expect "both are found"               2 "$(printf '%s' "$OUT" | j records.length)"
check "the record being edited is left out" 200 "$(req a GET "/admin/records/company/similar?name=$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "$REC Motors")&exclude=$CB")" "\"id\":\"$CA\""
check "an alias finds its record"     200 "$(req a GET "/admin/records/company?q=$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "$REC Cars")")" "\"id\":\"$CA\""
expect "an unrelated name is not close" 0 "$(req a GET '/admin/records/company/similar?name=Qqzzxxyy%20Widgets' | j records.length)"

# --- Merging a company -------------------------------------------------------
OCC=$(sql "SELECT occupation_id FROM occupation_skills GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 1")
sql "INSERT INTO jobs (company_id, factory_id, occupation_id, title, expires_at) VALUES ('$CA', '$FA', '$OCC', '$REC Job', now() + interval '30 days')" >/dev/null
sql "INSERT INTO company_members (company_id, user_id, status) VALUES ('$CA', '$PID', 'active'), ('$CB', '$PID', 'requested'), ('$CA', '$BID', 'active')" >/dev/null
# What a load of research leaves on a company: people in a state, where its facts came from, and a company that is part of it.
sql "INSERT INTO company_state_headcounts (company_id, state, people, year) VALUES ('$CA', 'TX', 1200, 2024);
     INSERT INTO external_references (entity_type, entity_id, source, external_id, url) VALUES ('companies', '$CA', 'CURATED', 'e2e-admin', 'https://e2e-admin.example.com/about');
     INSERT INTO companies (name, parent_company_id) VALUES ('$REC Part', '$CA')" >/dev/null
check "what a company carries"        200 "$(req a GET /admin/records/company/$CA)" '"attached":{"factories":1,"jobs":1,"members":2}'
check "merge needs a target"          400 "$(req a POST /admin/records/company/$CA/merge '{}')"
check "merge into itself"             400 "$(req a POST /admin/records/company/$CA/merge "{\"into\":\"$CA\"}")"
check "merge into nothing"            404 "$(req a POST /admin/records/company/$CA/merge "{\"into\":\"$NOBODY\"}")"
OUT=$(req a POST /admin/records/company/$CA/merge "{\"into\":\"$CB\"}")
check "merge one company into another" 200 "$OUT" "\"kept\":{\"id\":\"$CB\""
expect "the answer counts what moved" '1 1 2' "$(printf '%s' "$OUT" | j 'moved.factories + " " + o.moved.jobs + " " + o.moved.members')"
expect "the merged company is gone"   0 "$(sql "SELECT COUNT(*) FROM companies WHERE id='$CA'")"
expect "its factory and job moved"    '2 1' "$(sql "SELECT (SELECT COUNT(*) FROM factories WHERE company_id='$CB') || ' ' || (SELECT COUNT(*) FROM jobs WHERE company_id='$CB')")"
expect "so did its people in a state, its sources and the company that is part of it" '1200 1 1' \
  "$(sql "SELECT (SELECT people FROM company_state_headcounts WHERE company_id='$CB' AND state='TX') || ' ' || (SELECT COUNT(*) FROM external_references WHERE entity_type='companies' AND entity_id='$CB' AND source='CURATED') || ' ' || (SELECT COUNT(*) FROM companies WHERE name='$REC Part' AND parent_company_id='$CB')")"
check "the kept company's page lists its sources" 200 "$(req p GET /companies/$CB)" '"sources":\[{"label":"e2e-admin.example.com","url":"https://e2e-admin.example.com/about"}\]'
expect "a person at both keeps access" active "$(sql "SELECT status FROM company_members WHERE company_id='$CB' AND user_id='$PID'")"
expect "the other member moved"       active "$(sql "SELECT status FROM company_members WHERE company_id='$CB' AND user_id='$BID'")"
expect "the old name is kept as an alias" t "$(sql "SELECT aliases @> ARRAY['$REC Motors Inc', '$REC Cars'] FROM companies WHERE id='$CB'")"
expect "the kept company takes the profile it lacked" 'e2e-admin.example.com|Robotics' "$(sql "SELECT domain || '|' || industry FROM companies WHERE id='$CB'")"
check "merge again"                   404 "$(req a POST /admin/records/company/$CA/merge "{\"into\":\"$CB\"}")"
expect "the merge is on record"       "$REC Motors Inc" "$(req a GET "/admin/audit?kind=company&record=$CB" | j 'entries.find((e) => e.action === "merged").detail.merged.name')"
expect "and in the merge history"     "$CB admin" "$(sql "SELECT into_id || ' ' || via FROM record_merges WHERE kind = 'company' AND from_id = '$CA'")"

# --- Careers and skills: aliases, paths, merges ------------------------------
OUT=$(req a POST /occupations "{\"title\":\"$REC Welder\"}"); OA=$(printf '%s' "$OUT" | j id)
OUT=$(req a POST /occupations "{\"title\":\"$REC Welding Technician\",\"description\":\"Joins metal.\"}"); OB=$(printf '%s' "$OUT" | j id)
# Two skill groups in different domains: a skill is added into one, at a level, and can be moved to the other.
GRP=$(sql "SELECT slug FROM skill_groups ORDER BY position, slug LIMIT 1")
GRP2=$(sql "SELECT slug FROM skill_groups ORDER BY position DESC, slug DESC LIMIT 1")
domainOf() { sql "SELECT d.name FROM skill_groups g JOIN skill_domains d ON d.slug=g.domain_slug WHERE g.slug='$1'"; }
groupName() { sql "SELECT name FROM skill_groups WHERE slug='$1'"; }
expect "two groups in two domains to work with" true "$([ -n "$GRP" ] && [ "$(domainOf "$GRP")" != "$(domainOf "$GRP2")" ] && echo true)"
OUT=$(req a POST /skills "{\"name\":\"$REC Plasma Etch\",\"group\":\"$GRP\",\"level\":1}"); SA=$(printf '%s' "$OUT" | j id)
OUT=$(req a POST /skills "{\"name\":\"$REC Plasma Etching\",\"group\":\"$GRP\",\"level\":1}"); SB=$(printf '%s' "$OUT" | j id)
OUT=$(req a POST /skills "{\"name\":\"$REC Blueprint Reading\",\"group\":\"$GRP\",\"level\":2}"); SC=$(printf '%s' "$OUT" | j id)
check "a skill close to another"      200 "$(req a GET "/admin/records/skill/similar?name=$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "$REC Plasma Etch")&exclude=$SA")" "\"id\":\"$SB\""
check "other names for a career"      200 "$(req a PUT /occupations/$OA "{\"aliases\":[\"$REC Weldor\"]}")"
expect "are kept in the alias table"  1 "$(sql "SELECT COUNT(*) FROM occupation_aliases WHERE canonical_occupation_id='$OA' AND alias_text='$REC Weldor'")"
check "a name another career has"     409 "$(req a PUT /occupations/$OB "{\"aliases\":[\"$REC Weldor\"]}")" '"field":"aliases"'
check "nor another career's title"    409 "$(req a PUT /occupations/$OB "{\"aliases\":[\"$REC WELDER\"]}")" '"field":"aliases"'
check "a career with nothing to change" 400 "$(req a PUT /occupations/$OA '{}')"
OUT=$(req a PUT /skills/$SA "{\"group\":\"$GRP2\",\"level\":3,\"aliases\":[\"$REC Etch\"]}")
check "a skill's group, level and other names" 200 "$OUT" "\"level\":3,\"group\":{\"slug\":\"$GRP2\""
expect "the answer names its new domain" "$(domainOf "$GRP2")" "$(printf '%s' "$OUT" | j domain.name)"
expect "the group fixes the domain's name on the row" "$GRP2|3|$(domainOf "$GRP2")" "$(sql "SELECT group_slug || '|' || level || '|' || category FROM skills WHERE id='$SA'")"
expect "the change of group and level is on record, in words" "$(groupName "$GRP")>$(groupName "$GRP2")|$(domainOf "$GRP")>$(domainOf "$GRP2")|Fundamentals>Advanced" "$(req a GET "/admin/audit?kind=skill&record=$SA" | j "entries.map((e) => ((c) => c && c.group ? [c.group.join('>'), c.domain.join('>'), c.level.join('>')].join('|') : '')((e.detail || {}).changes))[0]")"
check "a group that does not exist"   400 "$(req a PUT /skills/$SA '{"group":"no-such-group"}')" '"field":"group"'
check "a level that is not one"       400 "$(req a PUT /skills/$SA '{"level":0}')" '"field":"level"'
check "a level cannot be cleared"     400 "$(req a PUT /skills/$SA '{"level":null}')" '"field":"level"'
expect "the refusals left it where it was" "$GRP2|3" "$(sql "SELECT group_slug || '|' || level FROM skills WHERE id='$SA'")"
check "the editor reads them back"    200 "$(req a GET /admin/records/skill/$SA)" "\"aliases\":\[\"$REC Etch\"\]"
expect "with the group's slug and the level" "$GRP2|3|$(domainOf "$GRP2")" "$(req a GET /admin/records/skill/$SA | j "fields.group + '|' + o.fields.level + '|' + o.fields.domain")"
expect "a search for it says its group and level" "$(groupName "$GRP2") · Advanced|3" "$(req a GET "/admin/records/skill?q=$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "$REC Plasma Etch")" | j "records.filter((r) => r.id === '$SA').map((r) => r.detail + '|' + r.level)[0]")"
check "how a skill is learned and what it is done with" 200 "$(req a PUT /skills/$SA "{\"howLearned\":\"  On the job.  \",\"tools\":[\"Etch tool\",\" etch tool \",\"Gas cabinet\",\"\"]}")" '"howLearned":"On the job."'
expect "the tools are kept as a list, once each" "Etch tool|Gas cabinet" "$(sql "SELECT array_to_string(tools, '|') FROM skills WHERE id='$SA'")"
check "the editor reads those back too" 200 "$(req a GET /admin/records/skill/$SA)" '"tools":\["Etch tool","Gas cabinet"\]'
check "tools that are not a list"     400 "$(req a PUT /skills/$SA '{"tools":"a wrench"}')" '"field":"tools"'
check "more tools than a short list holds" 400 "$(req a PUT /skills/$SA "{\"tools\":$(node -e 'console.log(JSON.stringify(Array.from({length:13},(_,i)=>"tool "+i)))')}")" '"field":"tools"'
check "how it is learned must be text" 400 "$(req a PUT /skills/$SA '{"howLearned":5}')" '"field":"howLearned"'
expect "the refusals changed nothing" "On the job.|2" "$(sql "SELECT how_learned || '|' || array_length(tools, 1) FROM skills WHERE id='$SA'")"
expect "the change is in the skill's history" "howLearned,tools" "$(req a GET "/admin/audit?kind=skill&record=$SA" | j 'entries.map((e) => Object.keys((e.detail || {}).changes || {}).sort().join(","))[0]')"
check "clearing them"                 200 "$(req a PUT /skills/$SA '{"howLearned":"","tools":[]}')"
expect "leaves both empty"            "true true" "$(sql "SELECT (how_learned IS NULL) || ' ' || (tools IS NULL) FROM skills WHERE id='$SA'")"
check "a new skill can carry them"    201 "$(req a POST /skills "{\"name\":\"$REC Etch Endpoint\",\"group\":\"$GRP\",\"level\":2,\"howLearned\":\"A course.\",\"tools\":[\"Spectrometer\"]}")" '"tools":\["Spectrometer"\]'

# A path is a career's skills. Each sits at its own level (SA 3, SB 1, SC 2), whatever stage a request sends.
stages() { sql "SELECT string_agg(s.name || ':' || COALESCE(os.stage::text, 'none'), ' ' ORDER BY s.name) FROM occupation_skills os JOIN skills s ON s.id=os.skill_id WHERE os.occupation_id='$1'" | sed "s/$REC //g"; }
check "write a path"                  200 "$(req a PUT /occupations/$OA/path "{\"skills\":[{\"skillId\":\"$SA\",\"stage\":1},{\"skillId\":\"$SC\"}],\"status\":\"draft\"}")"
expect "each skill is stored at its own level, not the stage sent" "Blueprint Reading:2 Plasma Etch:3" "$(stages $OA)"
sql "UPDATE occupation_skills SET importance='preferred' WHERE occupation_id='$OA' AND skill_id='$SC'" >/dev/null
check "replace it, keeping one skill" 200 "$(req a PUT /occupations/$OA/path "{\"skills\":[{\"skillId\":\"$SC\",\"stage\":3},{\"skillId\":\"$SB\",\"stage\":3}],\"replace\":true}")"
expect "the skill left out is gone"   0 "$(sql "SELECT COUNT(*) FROM occupation_skills WHERE occupation_id='$OA' AND skill_id='$SA'")"
expect "the one kept keeps what else is recorded, at its level" 'preferred 2' "$(sql "SELECT importance || ' ' || stage FROM occupation_skills WHERE occupation_id='$OA' AND skill_id='$SC'")"
expect "the one added is at its own level too" "Blueprint Reading:2 Plasma Etching:1" "$(stages $OA)"
check "a path entry needs a skill"    400 "$(req a PUT /occupations/$OA/path '{"skills":[{"stage":1}]}')"
check "the editor reads the path fresh" 200 "$(req a GET /admin/records/career/$OA)" "\"path\":\[{\"id\":\"$SB\""
expect "each skill with its level and group" "1:$GRP 2:$GRP" "$(req a GET /admin/records/career/$OA | j "path.map((s) => s.level + ':' + s.group.slug).join(' ')")"
# The career's page: every skill of the path carries its level, group and domain.
OUT=$(req p GET /occupations/$OA)
expect "a career's path carries level, group and domain" "$REC Plasma Etching|1|$GRP|$(groupName "$GRP")|$(domainOf "$GRP")" "$(printf '%s' "$OUT" | j "skills.map((s) => [s.name, s.level, s.group.slug, s.group.name, s.domain.name].join('|'))[0]")"
expect "lowest level first"           "1 2" "$(printf '%s' "$OUT" | j "skills.map((s) => s.level).join(' ')")"
expect "and no stage or category of its own" "domain,group,id,importance,level,name" "$(printf '%s' "$OUT" | j "skills.map((s) => Object.keys(s).sort().join())[0]")"
# A skill's level is the skill's: changing it moves the skill in every path it is on.
sql "INSERT INTO occupation_skills (occupation_id, skill_id) VALUES ('$OB', '$SC')" >/dev/null
check "change a skill's level"        200 "$(req a PUT /skills/$SC '{"level":3}')" '"level":3'
expect "it moved in every path it is on" "3 3" "$(sql "SELECT string_agg(stage::text, ' ') FROM occupation_skills WHERE skill_id='$SC'")"
expect "and on the career's page"     "1 3" "$(req p GET /occupations/$OA | j "skills.map((s) => s.level).join(' ')")"
expect "the change of level is on record" "Intermediate>Advanced" "$(req a GET "/admin/audit?kind=skill&record=$SC" | j "entries[0].detail.changes.level.join('>')")"
expect "no stage anywhere differs from its skill's level" 0 "$(sql "SELECT COUNT(*) FROM occupation_skills os JOIN skills s ON s.id=os.skill_id WHERE os.stage IS DISTINCT FROM s.level")"
sql "DELETE FROM occupation_skills WHERE occupation_id='$OB' AND skill_id='$SC'" >/dev/null
check "approve the path"              200 "$(req a PUT /occupations/$OA/path '{"skills":[],"status":"approved"}')"
check "approved paths are listed"     200 "$(req a GET '/admin/paths?status=approved')" "\"id\":\"$OA\""
check "return it to draft"            200 "$(req a PUT /occupations/$OA/path '{"skills":[],"status":"draft"}')"
expect "the path's history, newest first" 'path returned to draft,path approved,path edited,path edited,edited,added' "$(req a GET "/admin/audit?kind=career&record=$OA" | j 'entries.map((e) => e.action).join(",")')"
expect "a path line names the skills" "$REC Plasma Etching" "$(req a GET "/admin/audit?kind=career&record=$OA" | j 'entries[2].detail.skillsAdded.join("|")')"

# Skill A into B: a path, a job and people's marks follow; the stronger mark wins.
# A third career lists only A: its row moves to B and takes B's level (A is at 3, B at 1).
sql "INSERT INTO occupations (title) VALUES ('$REC Etcher')" >/dev/null
OC=$(sql "SELECT id FROM occupations WHERE title='$REC Etcher'")
sql "INSERT INTO occupation_skills (occupation_id, skill_id, stage) VALUES ('$OB', '$SA', 2), ('$OB', '$SB', 2), ('$OC', '$SA', 2)" >/dev/null
expect "a row written straight to the table takes the skill's level too" "3 1 3" "$(sql "SELECT string_agg(os.stage::text, ' ' ORDER BY os.occupation_id = '$OC', s.name) FROM occupation_skills os JOIN skills s ON s.id=os.skill_id WHERE os.occupation_id IN ('$OB', '$OC')")"
sql "INSERT INTO user_skills (user_id, skill_id, status) VALUES ('$PID', '$SA', 'held'), ('$PID', '$SB', 'learning'), ('$BID', '$SA', 'learning')" >/dev/null
OUT=$(req a POST /admin/records/skill/$SA/merge "{\"into\":\"$SB\"}")
check "merge one skill into another"  200 "$OUT" "\"merged\":{\"id\":\"$SA\""
expect "the merged skill is gone"     0 "$(sql "SELECT COUNT(*) FROM skills WHERE id='$SA'")"
expect "a path that listed both lists one" 1 "$(sql "SELECT COUNT(*) FROM occupation_skills WHERE occupation_id='$OB'")"
expect "the stronger mark wins"       held "$(sql "SELECT status FROM user_skills WHERE user_id='$PID' AND skill_id='$SB'")"
expect "a mark on the merged skill moves" learning "$(sql "SELECT status FROM user_skills WHERE user_id='$BID' AND skill_id='$SB'")"
expect "both old names are aliases"   2 "$(sql "SELECT COUNT(*) FROM skill_aliases WHERE canonical_skill_id='$SB' AND alias_text IN ('$REC Plasma Etch', '$REC Etch')")"
expect "the kept skill keeps its own group and level" "$GRP|1" "$(sql "SELECT group_slug || '|' || level FROM skills WHERE id='$SB'")"
expect "a path that listed only the merged skill lists the kept one, at its level" "Plasma Etching:1" "$(stages $OC)"
sql "DELETE FROM occupations WHERE id='$OC'" >/dev/null

# A skill's makes: added, renamed, reordered and removed one act at a time, each on record in words.
makes() { sql "SELECT COALESCE(string_agg(name, '|' ORDER BY position, lower(name)), '') FROM skill_makes WHERE skill_id='$1'"; }
check "401 add a make"                401 "$(req anon POST /skills/$SB/makes '{"name":"Haas"}')"
check "403 add a make"                403 "$(req p POST /skills/$SB/makes '{"name":"Haas"}')"
check "403 reorder makes"             403 "$(req p PUT /skills/$SB/makes '{"order":[]}')"
check "403 remove a make"             403 "$(req p DELETE /skills/$SB/makes/$NOBODY)"
OUT=$(req a POST /skills/$SB/makes '{"name":"  Haas  "}'); MH=$(printf '%s' "$OUT" | j id)
check "add a make"                    201 "$OUT" '"name":"Haas"'
check "the same make in other letters" 409 "$(req a POST /skills/$SB/makes '{"name":"HAAS"}')" '"field":"make"'
check "a make needs a name"           400 "$(req a POST /skills/$SB/makes '{"name":"  "}')" '"field":"make"'
check "a name of 61 characters"       400 "$(req a POST /skills/$SB/makes "{\"name\":\"$(printf 'm%.0s' $(seq 1 61))\"}")" '"field":"make"'
check "a make for a skill that is not there" 404 "$(req a POST /skills/$NOBODY/makes '{"name":"Haas"}')"
MF=$(req a POST /skills/$SB/makes '{"name":"Fanuc"}' | j id)
MO=$(req a POST /skills/$SB/makes '{"name":"Okuma"}' | j id)
expect "added after the ones it has"  "Haas|Fanuc|Okuma" "$(makes $SB)"
check "the skill's page lists them"   200 "$(req p GET /skills/$SB)" "\"makes\":\[{\"id\":\"$MH\",\"name\":\"Haas\"}"
OUT=$(req a GET /admin/records/skill/$SB)
expect "the editor reads them with how many people marked each" "Haas:0|Fanuc:0|Okuma:0" "$(printf '%s' "$OUT" | j "makes.map((m) => m.name + ':' + m.people).join('|')")"
expect "and counts them among what hangs from the skill" 3 "$(printf '%s' "$OUT" | j attached.makes)"
check "rename a make"                 200 "$(req a PATCH /skills/$SB/makes/$MH '{"name":"Haas Automation"}')" '"name":"Haas Automation"'
check "rename to a name it already has" 409 "$(req a PATCH /skills/$SB/makes/$MH '{"name":"fanuc"}')" '"field":"make"'
check "rename a make that is not there" 404 "$(req a PATCH /skills/$SB/makes/$NOBODY '{"name":"Mazak"}')"
check "rename a make of another skill" 404 "$(req a PATCH /skills/$SC/makes/$MH '{"name":"Mazak"}')"
check "a make id that is not one"     400 "$(req a PATCH /skills/$SB/makes/not-an-id '{"name":"Mazak"}')"
check "reorder the makes"             200 "$(req a PUT /skills/$SB/makes "{\"order\":[\"$MO\",\"$MH\",\"$MF\"]}")" '"makes":\[{"id":"'"$MO"'"'
expect "the new order is stored"      "Okuma|Haas Automation|Fanuc" "$(makes $SB)"
check "an order that leaves one out"  409 "$(req a PUT /skills/$SB/makes "{\"order\":[\"$MO\",\"$MH\"]}")" '"field":"make"'
check "an order that names one twice" 409 "$(req a PUT /skills/$SB/makes "{\"order\":[\"$MO\",\"$MH\",\"$MH\"]}")"
check "an order that is not a list"   400 "$(req a PUT /skills/$SB/makes '{"order":"Okuma"}')" '"field":"make"'
expect "the refusals left the order"  "Okuma|Haas Automation|Fanuc" "$(makes $SB)"
# Pat holds the skill (the merge above moved the mark) and has run two of its makes.
sql "INSERT INTO user_skill_makes (user_id, skill_id, make_id) VALUES ('$PID', '$SB', '$MH'), ('$PID', '$SB', '$MF')" >/dev/null
expect "the editor says how many people marked each" "Okuma:0|Haas Automation:1|Fanuc:1" "$(req a GET /admin/records/skill/$SB | j "makes.map((m) => m.name + ':' + m.people).join('|')")"
check "remove a make people marked"   200 "$(req a DELETE /skills/$SB/makes/$MH)" '"name":"Haas Automation","people":1'
expect "their mark on it goes, the other stays" "Fanuc" "$(sql "SELECT string_agg(m.name, '|') FROM user_skill_makes um JOIN skill_makes m ON m.id=um.make_id WHERE um.user_id='$PID'")"
check "remove it twice"               404 "$(req a DELETE /skills/$SB/makes/$MH)"
check "remove one nobody marked"      200 "$(req a DELETE /skills/$SB/makes/$MO)" '"people":0'
expect "each act is on record, in words" "make removed:Okuma|make removed:Haas Automation with 1|makes reordered:Haas Automation,Fanuc,Okuma>Okuma,Haas Automation,Fanuc|make renamed:Haas>Haas Automation|make added:Okuma|make added:Fanuc|make added:Haas" "$(req a GET "/admin/audit?kind=skill&record=$SB&limit=7" | j "entries.map((e) => e.action + ':' + ((d) => d.changes ? (d.changes.make || d.changes.makeOrder).join('>') : d.make + (d.removed ? ' with ' + d.removed.people : ''))(e.detail)).join('|')")"
for n in 2 3 4 5 6 7 8 9 10 11 12; do req a POST /skills/$SB/makes "{\"name\":\"Make $n\"}" >/dev/null; done
check "a thirteenth make"             400 "$(req a POST /skills/$SB/makes '{"name":"One too many"}')" 'at most 12'
sql "DELETE FROM skill_makes WHERE skill_id='$SB' AND name LIKE 'Make %'" >/dev/null
# A merge takes the merged skill's makes: one the kept skill lacks moves after its own; one it has, in any letter case, keeps its own and takes the marks.
SX=$(req a POST /skills "{\"name\":\"$REC Mill Running\",\"group\":\"$GRP\",\"level\":2}" | j id)
XA=$(req a POST /skills/$SX/makes '{"name":"Mazak"}' | j id)
XB=$(req a POST /skills/$SX/makes '{"name":"FANUC"}' | j id)
sql "INSERT INTO user_skills (user_id, skill_id, status) VALUES ('$PID', '$SX', 'held'), ('$BID', '$SX', 'held');
     INSERT INTO user_skill_makes (user_id, skill_id, make_id) VALUES ('$PID', '$SX', '$XA'), ('$BID', '$SX', '$XA'), ('$BID', '$SX', '$XB')" >/dev/null
check "merge a skill that has makes"  200 "$(req a POST /admin/records/skill/$SX/merge "{\"into\":\"$SB\"}")" '"moved":{"people":2,"makes":2}'
expect "the kept skill's makes, then the one it lacked" "Fanuc|Mazak" "$(makes $SB)"
marks() { sql "SELECT COALESCE(string_agg(m.name, '+' ORDER BY m.position), '') FROM user_skill_makes um JOIN skill_makes m ON m.id=um.make_id WHERE um.user_id='$1' AND um.skill_id='$SB'"; }
expect "a person who held both keeps their marks and gains the moved one" "Fanuc+Mazak" "$(marks $PID)"
expect "a person who held only the merged skill keeps theirs on the kept one" "Fanuc+Mazak" "$(marks $BID)"
expect "no mark is left on the merged skill" 0 "$(sql "SELECT COUNT(*) FROM user_skill_makes WHERE skill_id='$SX'")"

# Career A into B: its path, goals and aliases follow.
sql "INSERT INTO user_goals (user_id, occupation_id) VALUES ('$PID', '$OA')" >/dev/null
OUT=$(req a POST /admin/records/career/$OA/merge "{\"into\":\"$OB\"}")
check "merge one career into another" 200 "$OUT" "\"kept\":{\"id\":\"$OB\""
expect "the goal follows"             1 "$(sql "SELECT COUNT(*) FROM user_goals WHERE user_id='$PID' AND occupation_id='$OB'")"
expect "the paths are joined"         2 "$(sql "SELECT COUNT(*) FROM occupation_skills WHERE occupation_id='$OB'")"
expect "title and earlier alias are kept" 2 "$(sql "SELECT COUNT(*) FROM occupation_aliases WHERE canonical_occupation_id='$OB' AND alias_text IN ('$REC Welder', '$REC Weldor')")"
expect "the kept career takes the path's state" draft "$(sql "SELECT path_status FROM occupations WHERE id='$OB'")"
check "a search by the old title finds it" 200 "$(req a GET "/admin/records/career?q=$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "$REC Welder")")" "\"id\":\"$OB\""

# --- Deleting ----------------------------------------------------------------
OUT=$(req a DELETE /occupations/$OB)
check "delete a career"               200 "$OUT" '"removed":{"skills":2,"goals":1}'
OUT=$(req a DELETE /companies/$CB)
check "delete a company"              200 "$OUT" '"removed":{"factories":2,"jobs":1,"members":2}'
expect "the deletion is on record with what went" 2 "$(req a GET "/admin/audit?kind=company&record=$CB" | j 'entries[0].detail.removed.factories')"
check "delete it twice"               404 "$(req a DELETE /companies/$CB)"
check "its editor says it is gone"    404 "$(req a GET /admin/records/company/$CB)"

# --- Data quality -------------------------------------------------------------
# GET /api/admin/quality counts the plants state by state. Checked two ways:
# against the database's own counts, and by what five plants of ours add.
quality() { req a GET /admin/quality; }
QST=WY
BEFORE=$(quality)
check "the quality table"             200 "$BEFORE" '"total":{'
expect "it counts every plant"        "$(sql "SELECT COUNT(*) FROM factories")" "$(printf '%s' "$BEFORE" | j total.plants)"
expect "the states add up to the total" true "$(printf '%s' "$BEFORE" | j "states.reduce((ok, s) => ok && Object.keys(s).every((k) => k === 'state' || Number.isInteger(s[k])), true) && ['plants','industry','code','county','people','address','outsideId','onePlantCompanies','duplicates','duplicateGroups'].every((k) => o.states.reduce((n, s) => n + s[k], 0) === o.total[k])")"
expect "largest state first"          true "$(printf '%s' "$BEFORE" | j "states.every((s, i, a) => i === 0 || a[i - 1].plants >= s.plants)")"
expect "no share can pass the whole"  true "$(printf '%s' "$BEFORE" | j "states.every((s) => ['industry','code','county','people','address','outsideId','onePlantCompanies','duplicates'].every((k) => s[k] >= 0 && s[k] <= s.plants))")"
expect "companies are those with a plant" "$(sql "SELECT COUNT(DISTINCT company_id) FROM factories")" "$(printf '%s' "$BEFORE" | j total.companies)"
expect "one-plant companies, as the database counts them" "$(sql "SELECT COUNT(*) FROM (SELECT company_id FROM factories WHERE company_id IS NOT NULL GROUP BY company_id HAVING COUNT(*) = 1) one")" "$(printf '%s' "$BEFORE" | j total.onePlantCompanies)"
expect "industry, code, county and people, as the database counts them" \
  "$(sql "SELECT COUNT(*) FILTER (WHERE primary_naics_description IN (SELECT name FROM industry_profiles)) || ' ' || COUNT(naics) || ' ' || COUNT(county_fips) || ' ' || COUNT(*) FILTER (WHERE workforce_size > 0) FROM factories")" \
  "$(printf '%s' "$BEFORE" | j "total.industry + ' ' + o.total.code + ' ' + o.total.county + ' ' + o.total.people")"
# Five plants in one state: two companies, one of them with a single plant.
QA=$(sql "INSERT INTO companies (name) VALUES ('$REC Quality A') RETURNING id")
QB=$(sql "INSERT INTO companies (name) VALUES ('$REC Quality B') RETURNING id")
sql "INSERT INTO factories (name, company_id, latitude, longitude, state, city, address, primary_naics, primary_naics_description, workforce_size) VALUES
  ('$REC Q1', '$QA', '41.14001', '-104.82002', '$QST', 'CHEYENNE', '100 Plant Road', '311611', 'Food Manufacturing', 250),
  ('$REC Q2', '$QA', '41.14049', '-104.81951', '$QST', 'CHEYENNE', 'Cheyenne', '311', 'Food Manufacturing', 0),
  ('$REC Q3', '$QA', '41.2', '-104.9', '$QST', 'CHEYENNE', NULL, NULL, 'Robots', NULL),
  ('$REC Q4', '$QA', 'north', '-104.9', '$QST', NULL, '  ', '541110', NULL, NULL),
  ('$REC Q5', '$QB', '41.14001', '-104.82002', '$QST', 'CHEYENNE', '100 Plant Road', '336111', 'Transportation Equipment Manufacturing', 12)" >/dev/null
Q1=$(sql "SELECT id FROM factories WHERE name='$REC Q1'")
sql "UPDATE factories SET county_fips = '56021', cbsa_code = '16940' WHERE id='$Q1';
     INSERT INTO external_references (entity_type, entity_id, source, external_id, url) VALUES
       ('factories', '$Q1', 'EPA_ECHO', '110000000001', 'https://e2e-admin.example.com/echo'),
       ('factories', '$Q1', 'EPA_ECHO', '110000000002', 'https://e2e-admin.example.com/echo-2'),
       ('factories', (SELECT id FROM factories WHERE name='$REC Q2'), 'CURATED', 'https://e2e-admin.example.com/source', 'https://e2e-admin.example.com/source')" >/dev/null
AFTER=$(quality)
delta() { # field -> how much the state's count grew
  echo $(( $(printf '%s' "$AFTER" | j "states.find((s) => s.state === '$QST').$1") - $(printf '%s' "$BEFORE" | j "states.find((s) => s.state === '$QST')?.$1 ?? 0") ))
}
expect "five plants more"             5 "$(delta plants)"
expect "an industry is one of the 21" 3 "$(delta industry)"
expect "a code is one that means one national industry" 2 "$(delta code)"
expect "a county is one a plant was placed in" 1 "$(delta county)"
expect "a headcount of zero is not a headcount" 2 "$(delta people)"
expect "the city again, or blanks, is not an address" 2 "$(delta address)"
expect "an outside id counts the plant once, a source address not at all" 1 "$(delta outsideId)"
expect "a company with one plant"     1 "$(delta onePlantCompanies)"
expect "the same company at the same spot, to a hundred metres" "2 1" "$(delta duplicates) $(delta duplicateGroups)"
expect "the total follows"            "5 1" "$(( $(printf '%s' "$AFTER" | j total.plants) - $(printf '%s' "$BEFORE" | j total.plants) )) $(( $(printf '%s' "$AFTER" | j total.duplicateGroups) - $(printf '%s' "$BEFORE" | j total.duplicateGroups) ))"
HDR=$(curl -s -D - -o /dev/null -b "$D/a" "$API/admin/quality" | tr -d '\r' | grep -i '^cache-control')
case "$HDR" in *no-store*) echo "ok    the quality table is not cacheable";; *) echo "FAIL  quality cache header: $HDR"; fail=1;; esac
sql "DELETE FROM companies WHERE id IN ('$QA', '$QB'); DELETE FROM external_references WHERE url LIKE 'https://e2e-admin.example.com/echo%' OR url = 'https://e2e-admin.example.com/source'" >/dev/null
expect "and returns to what it was"   "$(printf '%s' "$BEFORE" | j "total.plants + ' ' + o.total.duplicates")" "$(quality | j "total.plants + ' ' + o.total.duplicates")"

# --- People ------------------------------------------------------------------
sql "INSERT INTO companies (name) VALUES ('$REC Access Co')" >/dev/null
CC=$(sql "SELECT id FROM companies WHERE name='$REC Access Co'")
check "ask to join a company"         201 "$(req p POST /employer/memberships "{\"companyId\":\"$CC\"}")" '"status":"requested"'
OUT=$(req a GET "/admin/users?role=waiting&q=person-$RUN")
expect "people waiting on a request"  1 "$(printf '%s' "$OUT" | j users.length)"
expect "people by company"            "person-$RUN@admin.test" "$(req a GET "/admin/users?q=$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "$REC Access")" | j 'users.map((u) => u.email).join(",")')"
expect "admins only"                  1 "$(req a GET "/admin/users?role=admin&q=-$RUN@admin.test" | j users.length)"
expect "people with no role"          "second-$RUN@admin.test" "$(req a GET "/admin/users?role=user&q=-$RUN@admin.test" | j 'users.map((u) => u.email).sort().join(",").replace("person-'"$RUN"'@admin.test,", "")')"
OUT=$(req a GET '/admin/memberships?status=requested')
expect "a request says when the account was made" true "$(printf '%s' "$OUT" | j "memberships.filter((m) => m.userId === '$PID').every((m) => typeof m.userCreatedAt === 'string' && Array.isArray(m.otherCompanies))")"
check "approve it"                    200 "$(req a PATCH /admin/memberships "{\"companyId\":\"$CC\",\"userId\":\"$PID\",\"decision\":\"approve\"}")" '"status":"active"'
check "take the approval back"        200 "$(req a PATCH /admin/memberships "{\"companyId\":\"$CC\",\"userId\":\"$PID\",\"decision\":\"reopen\"}")" '"status":"requested"'
expect "the request waits again"      'requested true' "$(sql "SELECT status || ' ' || (decided_at IS NULL) FROM company_members WHERE company_id='$CC' AND user_id='$PID'")"
check "nothing to take back twice"    404 "$(req a PATCH /admin/memberships "{\"companyId\":\"$CC\",\"userId\":\"$PID\",\"decision\":\"reopen\"}")"
check "decline, then take it back"    200 "$(req a PATCH /admin/memberships "{\"companyId\":\"$CC\",\"userId\":\"$PID\",\"decision\":\"decline\"}" >/dev/null; req a PATCH /admin/memberships "{\"companyId\":\"$CC\",\"userId\":\"$PID\",\"decision\":\"reopen\"}")" '"status":"requested"'
expect "access decisions are on record" 'decision taken back,declined,decision taken back,approved' "$(req a GET '/admin/audit?kind=access' | j "entries.filter((e) => e.recordId === '$PID').map((e) => e.action).join(',')")"

check "correct a name"                200 "$(req a PATCH /admin/users/$PID '{"name":" Patricia Person "}')" '"name":"Patricia Person"'
check "a name that is empty"          400 "$(req a PATCH /admin/users/$PID '{"name":" "}')" '"field":"name"'
check "an address that is not one"    400 "$(req a PATCH /admin/users/$PID '{"email":"nope"}')" '"field":"email"'
check "an address another account has" 409 "$(req a PATCH /admin/users/$PID "{\"email\":\"SECOND-$RUN@admin.test\"}")" '"field":"email"'
check "correct an address"            200 "$(req a PATCH /admin/users/$PID "{\"email\":\"Pat-$RUN@Admin.test\"}")" "\"email\":\"pat-$RUN@admin.test\""
check "the person signs in with the new one" 200 "$(req p2 POST /auth/sign-in "{\"email\":\"pat-$RUN@admin.test\",$PW}")" '"name":"Patricia Person"'
check "nothing given is refused"      400 "$(req a PATCH /admin/users/$PID '{}')"
check "end the person's sessions"     200 "$(req a POST /admin/users/$PID/sign-out)" '"ended":2'
check "they are signed out everywhere" 200 "$(req p2 GET /auth/me)" '"user":null'
check "nothing left to end"           200 "$(req a POST /admin/users/$PID/sign-out)" '"ended":0'
check "an admin's own: this session stays" 200 "$(req a2 POST /auth/sign-in "{\"email\":\"admin-$RUN@admin.test\",$PW}" >/dev/null; req a POST /admin/users/$AID/sign-out)" '"ended":1'
check "the session that asked carries on" 200 "$(req a GET /admin/overview)"
check "sign out an unknown person"    404 "$(req a POST /admin/users/$NOBODY/sign-out)"
expect "corrections and sign-outs are on record" 'sessions ended,sessions ended,edited,edited' "$(req a GET '/admin/audit?kind=person' | j "entries.filter((e) => e.recordId === '$PID' || (e.recordId === '$AID' && e.action === 'sessions ended')).map((e) => e.action).join(',')")"

# The first admin: the one who has had the role longest. Another admin can
# neither take that role away nor delete the account.
check "make a second admin"           200 "$(req a PATCH /admin/users/$BID '{"isAdmin":true}')" '"isAdmin":true'
FIRST=$(sql "SELECT id FROM users WHERE is_admin ORDER BY admin_since ASC NULLS FIRST, created_at, id LIMIT 1")
expect "the list marks the first admin" "$FIRST" "$(req a GET '/admin/users?role=admin&limit=200' | j 'users.filter((u) => u.isFirstAdmin).map((u) => u.id).join(",")')"
check "a later admin cannot demote the first" 409 "$(req b PATCH /admin/users/$FIRST '{"isAdmin":false}')" 'first admin'
check "nor delete the first"          409 "$(req b DELETE /admin/users/$FIRST)" 'first admin'
expect "the first admin is still one" t "$(sql "SELECT is_admin FROM users WHERE id='$FIRST'")"
check "a later admin's role can be removed" 200 "$(req a PATCH /admin/users/$BID '{"isAdmin":false}')" '"isAdmin":false'
expect "and the date goes with it"    t "$(sql "SELECT admin_since IS NULL FROM users WHERE id='$BID'")"
expect "role changes are on record"   'admin role removed,made admin' "$(req a GET '/admin/audit?kind=person' | j "entries.filter((e) => e.recordId === '$BID').map((e) => e.action).join(',')")"
check "a reset link is on record"     201 "$(req a POST /admin/users/$PID/reset-link)"
expect "as a line, without the link"  'password reset link null' "$(req a GET '/admin/audit?kind=person' | j "entries.filter((e) => e.recordId === '$PID').map((e) => e.action + ' ' + JSON.stringify(e.detail))[0]")"
OUT=$(req a DELETE /admin/users/$PID)
check "delete a person"               200 "$OUT"
expect "the deletion names who and what went" "pat-$RUN@admin.test 1" "$(req a GET '/admin/audit?kind=person' | j "entries.filter((e) => e.action === 'deleted' && e.recordId === '$PID').map((e) => e.recordName + ' ' + e.detail.removed.memberships)[0]")"

# --- Invites -----------------------------------------------------------------
INV="invited-$RUN@admin.test"
OUT=$(req a POST /admin/invites "{\"email\":\"SECOND-$RUN@admin.test\",\"role\":\"user\"}")
check "an address with an account"    409 "$OUT" "\"existing\":{\"id\":\"$BID\""
OUT=$(req a POST /admin/invites "{\"email\":\"$INV\",\"role\":\"user\"}")
check "create an invite"              201 "$OUT" '"replaced":false'
T0=$(printf '%s' "$OUT" | j token)
expect "an ordinary invite lasts 14 days" 14 "$(printf '%s' "$OUT" | j 'invite.expiresAt.length && Math.round((new Date(o.invite.expiresAt) - Date.now()) / 86400000)')"
check "the link says who invited"     200 "$(req anon GET /auth/invite/$T0)" '"invitedBy":"Ada Admin"'
OUT=$(req a POST /admin/invites "{\"email\":\"$INV\",\"role\":\"admin\"}")
check "invite the address again"      201 "$OUT" '"replaced":true'
T1=$(printf '%s' "$OUT" | j token)
expect "an admin invite lasts 3 days" 3 "$(printf '%s' "$OUT" | j 'invite.expiresAt.length && Math.round((new Date(o.invite.expiresAt) - Date.now()) / 86400000)')"
check "the replaced link is unknown"  404 "$(req anon GET /auth/invite/$T0)" '"reason":"unknown"'
check "pending invites say who invited" 200 "$(req a GET /admin/invites)" '"invitedBy":"Ada Admin"'
check "sign up through it"            201 "$(req i POST /auth/sign-up "{\"email\":\"$INV\",\"name\":\"Ivy Invited\",$PW,\"invite\":\"$T1\"}")" '"isAdmin":true'
expect "an invited admin has a date"  t "$(sql "SELECT admin_since IS NOT NULL FROM users WHERE email='$INV'")"
check "a used link says so"           404 "$(req anon GET /auth/invite/$T1)" '"reason":"used"'
OUT=$(req a POST /admin/invites "{\"email\":\"old-$RUN@admin.test\",\"role\":\"user\"}")
T2=$(printf '%s' "$OUT" | j token)
sql "UPDATE invites SET expires_at = now() - interval '1 hour' WHERE email='old-$RUN@admin.test'" >/dev/null
check "an expired link says so"       404 "$(req anon GET /auth/invite/$T2)" '"reason":"expired"'
OUT=$(req a GET /admin/invites/past)
expect "earlier invites: accepted and expired" 'accepted expired' "$(printf '%s' "$OUT" | j "invites.filter((i) => i.email.endsWith('-$RUN@admin.test')).map((i) => i.state).sort().join(' ')")"
OUT=$(req a POST /admin/invites "{\"email\":\"rev-$RUN@admin.test\",\"role\":\"user\"}")
check "revoke an invite"              200 "$(req a DELETE /admin/invites/$(printf '%s' "$OUT" | j invite.id))"
expect "invites are on record"        'invite revoked,invited,invited,invited,invited' "$(req a GET '/admin/audit?kind=invite' | j "entries.filter((e) => e.recordName.endsWith('-$RUN@admin.test')).map((e) => e.action).join(',')")"

# --- The log itself ----------------------------------------------------------
OUT=$(req a GET '/admin/audit?limit=3')
expect "the log pages"                '3 true' "$(printf '%s' "$OUT" | j 'entries.length + " " + o.hasMore')"
expect "a kind that is not one is ignored" 3 "$(req a GET '/admin/audit?kind=widget&limit=3' | j entries.length)"
HDR=$(curl -s -D - -o /dev/null -b "$D/a" "$API/admin/audit" | tr -d '\r' | grep -i '^cache-control')
case "$HDR" in *no-store*) echo "ok    the log is not cacheable";; *) echo "FAIL  audit cache header: $HDR"; fail=1;; esac

cleanup
expect "nothing of this run is left behind" '0 0 0 0 0' "$(sql "SELECT (SELECT COUNT(*) FROM users WHERE email LIKE '%@admin.test') || ' ' || (SELECT COUNT(*) FROM invites WHERE email LIKE '%@admin.test') || ' ' || (SELECT COUNT(*) FROM companies WHERE name LIKE 'E2E Admin %') || ' ' || (SELECT COUNT(*) FROM skills WHERE name LIKE 'E2E Admin %') || ' ' || (SELECT COUNT(*) FROM audit_log WHERE record_name LIKE 'E2E Admin %' OR record_name LIKE '%@admin.test%')")"
finish
