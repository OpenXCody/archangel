#!/usr/bin/env bash
# End-to-end check of the careers catalogue as the API serves it: a career's
# home domain and its ladder (leadsTo, comesFrom), the Careers list narrowed
# to a domain, a career found by a title that was folded into it, and an
# admin's corrections to a home and a ladder, with their refusals. Prints one
# line per check and exits non-zero if any fail.
#
# It reads the careers the catalogue migration loaded (data/careers/catalogue.json:
# the database must have had migrations 0046 and 0047 applied over the sample
# data, as `scripts/create-db.mjs --sample` leaves it).
#
# LOCAL ONLY: it creates and deletes users (emails ending @careers.test),
# promotes one to admin with scripts/make-admin.mjs, and adds, links, merges
# and deletes careers named "E2E Careers <run> ...". The audit lines it causes
# are removed at the end. Never point it at production.
#   API=http://localhost:3000/api DB=postgresql://... bash tests/api/careers.sh
# Needs a running dev API, and psql, curl and node on the PATH.
set -u
. "$(dirname "$0")/lib.sh"
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
D=$(mktemp -d)
RUN=$(date +%s)
CHECK_SHOWS=240
REC="E2E Careers $RUN"

cleanup() {
  psql "$DB" -qtAc "
    UPDATE occupations o SET onet_code = (SELECT a.detail->'changes'->'onetCode'->>0 FROM audit_log a WHERE a.record_id = o.id AND a.detail->'changes'->'onetCode'->>1 LIKE 'E2E-%' ORDER BY a.at DESC LIMIT 1)
      WHERE o.onet_code LIKE 'E2E-%';
    DELETE FROM audit_log WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%@careers.test') OR record_name LIKE 'E2E Careers %';
    DELETE FROM users WHERE email LIKE '%@careers.test';
    DELETE FROM occupations WHERE title LIKE 'E2E Careers %';
    DELETE FROM companies WHERE name LIKE 'E2E Careers %';" >/dev/null
}
cleanup
trap 'cleanup; rm -rf "$D"' EXIT
NOBODY=00000000-0000-4000-8000-000000000000
PW='"password":"correct horse"'

# What the catalogue file says, to hold the API to: `cat <expression over the file>`.
cat_() { node -e "const c=JSON.parse(require('fs').readFileSync('$ROOT/data/careers/catalogue.json','utf8'));const careers=c.careers;const by=(t)=>careers.find((x)=>x.title===t);console.log(eval(process.argv[1]))" "$1"; }
# A career's id by its exact title.
id_of() { sql "SELECT id FROM occupations WHERE title = '$1'"; }
enc() { node -e "console.log(encodeURIComponent(process.argv[1]))" "$1"; }

# --- The catalogue is what is stored ------------------------------------------
KEPT=$(cat_ 'careers.length')
expect "every career of the catalogue is stored"   "$KEPT" "$(sql "SELECT COUNT(*) FROM occupations o WHERE o.title IN ($(cat_ 'careers.map((x)=>"\x27"+x.title.replace(/\x27/g,"\x27\x27")+"\x27").join(",")'))")"
expect "each with its home"                        "$KEPT" "$(sql "SELECT COUNT(*) FROM occupations WHERE home_domain IS NOT NULL AND service_company_id IS NULL AND title NOT LIKE 'E2E %'")"
expect "no folded title is still a career"         0 "$(sql "SELECT COUNT(*) FROM occupations WHERE title IN ('Machinist', 'CNC Mill Operator', 'Cleanroom Technician', 'Certified Welder', 'Sheet Metal Worker')")"
expect "no removed title is still a career"        0 "$(sql "SELECT COUNT(*) FROM occupations WHERE title IN ('Tanker Boom Operator', 'Firmware Engineer', 'Nadcap Auditor')")"
expect "the links are the file's"                  "$(cat_ 'careers.reduce((n,x)=>n+x.leadsTo.length,0)')" "$(sql "SELECT COUNT(*) FROM occupation_links l INNER JOIN occupations f ON f.id = l.from_occupation_id WHERE f.title NOT LIKE 'E2E %'")"
expect "a folded title is another name for its career" "CNC Machinist" "$(sql "SELECT o.title FROM occupation_aliases a INNER JOIN occupations o ON o.id = a.canonical_occupation_id WHERE a.alias_text = 'Machinist'")"
expect "a name that is now a title is nobody's other name" 0 "$(sql "SELECT COUNT(*) FROM occupation_aliases a WHERE EXISTS (SELECT 1 FROM occupations o WHERE lower(o.title) = lower(a.alias_text))")"
expect "a name that meant another job did not follow" "Injection Molding Operator" "$(sql "SELECT o.title FROM occupation_aliases a INNER JOIN occupations o ON o.id = a.canonical_occupation_id WHERE lower(a.alias_text) = 'molder'")"
expect "nor did the polisher's"                    0 "$(sql "SELECT COUNT(*) FROM occupation_aliases WHERE lower(alias_text) IN ('deburrer', 'polisher', 'finisher')")"
expect "every career is listed for an industry"    0 "$(sql "SELECT COUNT(*) FROM occupations o WHERE o.title NOT LIKE 'E2E %' AND o.service_company_id IS NULL AND NOT EXISTS (SELECT 1 FROM industry_occupations io WHERE io.occupation_id = o.id)")"
expect "and no military career is"                 0 "$(sql "SELECT COUNT(*) FROM industry_occupations io INNER JOIN occupations o ON o.id = io.occupation_id WHERE o.service_company_id IS NOT NULL")"
expect "a link that followed a folded title where it does not fit is gone" 0 "$(sql "SELECT COUNT(*) FROM industry_occupations io INNER JOIN occupations o ON o.id = io.occupation_id WHERE o.title = 'Wafer Fab Operator' AND io.industry = 'Miscellaneous Manufacturing'")"
expect "the log has its summary"                   t "$(sql "SELECT COUNT(*) > 0 FROM load_log WHERE load = 'careers-catalogue' AND action = 'summary'")"

# --- A career's home and ladder -------------------------------------------------
MACHINIST=$(id_of 'CNC Machinist')
OUT=$(req anon GET /occupations/$MACHINIST)
check "a career's page"                            200 "$OUT" '"home":{"slug":"machining","name":"Machining"}'
expect "leads to, in the file's order"             "$(cat_ 'by("CNC Machinist").leadsTo.join("|")')" "$(printf '%s' "$OUT" | j 'leadsTo.map((c) => c.title).join("|")')"
expect "comes from"                                "$(cat_ 'careers.filter((x)=>x.leadsTo.includes("CNC Machinist")).map((x)=>x.title).sort().join("|")')" "$(printf '%s' "$OUT" | j 'comesFrom.map((c) => c.title).join("|")')"
# Seven careers lead to Maintenance Technician: the ones it is the first next step of come first, then by title.
expect "comes from: a career's first next step leads" "$(cat_ 'careers.filter((x)=>x.leadsTo.includes("Maintenance Technician")).sort((x,y)=>x.leadsTo.indexOf("Maintenance Technician")-y.leadsTo.indexOf("Maintenance Technician")||(x.title<y.title?-1:1)).map((x)=>x.title).join("|")')" "$(req anon GET /occupations/$(id_of 'Maintenance Technician') | j 'comesFrom.map((c) => c.title).join("|")')"
expect "each rung carries its id"                  "$(id_of 'CNC Programmer')" "$(printf '%s' "$OUT" | j 'leadsTo.find((c) => c.title === "CNC Programmer").id')"
expect "the stored column is not in the answer"    undefined "$(printf '%s' "$OUT" | j homeDomain)"
ALONE=$(cat_ 'careers.find((x)=>x.leadsTo.length===0 && !careers.some((y)=>y.leadsTo.includes(x.title))).title')
OUT=$(req anon GET /occupations/$(id_of "$ALONE"))
expect "a career on no ladder has both lists, empty" "0 0" "$(printf '%s' "$OUT" | j 'leadsTo.length + " " + o.comesFrom.length')"
FIRST=$(cat_ 'careers.find((x)=>x.leadsTo.length===3 && !careers.some((y)=>y.leadsTo.includes(x.title))).title')
OUT=$(req anon GET /occupations/$(id_of "$FIRST"))
expect "one with nothing before it and three after" "0 3" "$(printf '%s' "$OUT" | j 'comesFrom.length + " " + o.leadsTo.length')"

# --- The list, narrowed to a domain ---------------------------------------------
OUT=$(req anon GET '/occupations?domain=machining&limit=100')
check "careers of one domain"                      200 "$OUT"
expect "as many as the file has"                   "$(cat_ 'careers.filter((x)=>x.home==="machining").length')" "$(printf '%s' "$OUT" | j total)"
expect "each row carries its home"                 "Machining" "$(printf '%s' "$OUT" | j 'data.map((c) => c.home && c.home.name).filter((name, i, all) => all.indexOf(name) === i).join("|")')"
OUT=$(req anon GET '/occupations?limit=100')
expect "every row of the whole list has a home"    true "$(printf '%s' "$OUT" | j 'data.every((c) => c.title.startsWith("E2E") || (c.home && c.home.slug && c.home.name))')"
check "a domain nobody has is an empty list, not an error" 200 "$(req anon GET '/occupations?domain=not-a-domain')" '"total":0'
OUT=$(req anon GET '/occupations?domain=machining&search=programmer')
expect "a domain and a search together"            "CNC Programmer" "$(printf '%s' "$OUT" | j 'data.map((c) => c.title).join("|")')"
expect "a search outside the domain finds nothing in it" 0 "$(req anon GET '/occupations?domain=machining&search=welder' | j total)"
OUT=$(req anon GET /explore/facets)
expect "the domains that are a career's home, in the taxonomy's order" "$(TAXONOMY="$ROOT/data/skills/taxonomy.json" cat_ '(homes => JSON.parse(require("fs").readFileSync(process.env.TAXONOMY, "utf8")).domains.map((d) => d.slug).filter((slug) => homes.has(slug)).join("|"))(new Set(careers.map((x)=>x.home)))')" "$(printf '%s' "$OUT" | j 'careerDomains.map((d) => d.slug).join("|")')"
expect "each with its name"                        "Battery and electric drive" "$(printf '%s' "$OUT" | j 'careerDomains.find((d) => d.slug === "battery").name')"
expect "the counts follow the data: civilian careers" "$(sql "SELECT COUNT(*) FROM occupations WHERE service_company_id IS NULL")" "$(req anon GET /stats/counts | j occupations)"

# --- The list, the picker, search and the counts are of civilian careers ----------
# Military careers (data/careers/military/, migrations 0063 and 0064) are careers with a service.
# They are listed only when asked for; tests/api/military.sh holds the rest of this to the files.
MILITARY=$(sql "SELECT COUNT(*) FROM occupations WHERE service_company_id IS NOT NULL")
CIVILIAN=$(sql "SELECT COUNT(*) FROM occupations WHERE service_company_id IS NULL")
expect "military careers are stored"               true "$([ "$MILITARY" -gt 0 ] && echo true || echo false)"
OUT=$(req anon GET '/occupations?limit=100')
expect "the list counts civilian careers"          "$CIVILIAN" "$(printf '%s' "$OUT" | j total)"
expect "and no row has a service"                  true "$(printf '%s' "$OUT" | j 'data.every((c) => c.service === null && c.kind === null && c.code === null)')"
expect "asked for, the military careers"           "$MILITARY" "$(req anon GET '/occupations?military=1&limit=1' | j total)"
expect "or one service's"                          "$(sql "SELECT COUNT(*) FROM occupations o INNER JOIN companies c ON c.id = o.service_company_id WHERE c.service = 'army'")" "$(req anon GET '/occupations?service=army&limit=1' | j total)"
check "a service that is not one is refused"       400 "$(req anon GET '/occupations?service=space-force')"
OUT=$(req anon GET "/occupations?search=$(enc 'technician')&limit=100")
expect "what the career picker searches offers no military career" 0 "$(printf '%s' "$OUT" | j 'data.filter((c) => c.service !== null).length')"
expect "the site search lists none either"         0 "$(req anon GET "/search?q=$(enc 'aviation machinist')&types=occupations" | j 'results.occupations.count')"
expect "the homes offered are civilian careers'"   "$(sql "SELECT COUNT(DISTINCT home_domain) FROM occupations WHERE service_company_id IS NULL AND home_domain IS NOT NULL")" "$(req anon GET /explore/facets | j 'careerDomains.length')"
expect "a skill's count of careers is of civilian ones" "$(sql "SELECT COUNT(*) FROM occupation_skills os INNER JOIN occupations o ON o.id = os.occupation_id INNER JOIN skills s ON s.id = os.skill_id WHERE s.name = 'Shop Safety Practices' AND o.service_company_id IS NULL")" "$(req anon GET "/skills?search=$(enc 'Shop Safety Practices')" | j 'data[0].occupationCount')"

# --- Found by a title that was folded in -----------------------------------------
OUT=$(req anon GET "/occupations?search=$(enc 'Cleanroom Technician')")
expect "the list finds the career a folded title belongs to" "Wafer Fab Operator" "$(printf '%s' "$OUT" | j 'data[0].title')"
expect "and says which name found it"              "Cleanroom Technician" "$(printf '%s' "$OUT" | j 'data[0].alsoCalled')"
OUT=$(req anon GET "/occupations?search=$(enc 'machinist')")
expect "a title that matches has no other name to say" "CNC Machinist null" "$(printf '%s' "$OUT" | j 'data[0].title + " " + o.data[0].alsoCalled')"
expect "browsing says none either"                 null "$(req anon GET '/occupations?limit=1' | j 'data[0].alsoCalled')"
OUT=$(req anon GET "/search?q=$(enc 'Cleanroom Technician')&types=occupations")
expect "the site search finds it too"              "Wafer Fab Operator" "$(printf '%s' "$OUT" | j 'results.occupations.items[0].name')"
expect "and says Also called"                      "Also called Cleanroom Technician" "$(printf '%s' "$OUT" | j 'results.occupations.items[0].subtitle')"
OUT=$(req anon GET "/search?q=QA&types=occupations")
expect "an everyday name leads with the career it is"  "Quality Control Inspector|Also called QA" "$(printf '%s' "$OUT" | j 'results.occupations.items[0].name + "|" + o.results.occupations.items[0].subtitle')"
OUT=$(req anon GET "/search?q=welder&types=occupations")
expect "a title that matches keeps its description" false "$(printf '%s' "$OUT" | j 'results.occupations.items[0].subtitle.startsWith("Also called")')"
expect "a removed title finds nothing"             0 "$(req anon GET "/occupations?search=$(enc 'Tanker Boom Operator')" | j total)"

# --- An admin corrects a home and a ladder ---------------------------------------
check "sign-up admin"                              201 "$(req a POST /auth/sign-up "{\"email\":\"admin-$RUN@careers.test\",\"name\":\"Cara Admin\",$PW}")"
check "sign-up person"                             201 "$(req p POST /auth/sign-up "{\"email\":\"person-$RUN@careers.test\",\"name\":\"Pat Person\",$PW}")"
DATABASE_URL="$DB" node "$ROOT/scripts/make-admin.mjs" "admin-$RUN@careers.test" >/dev/null 2>&1
expect "make-admin made the admin"                 0 "$?"

OUT=$(req a POST /occupations "{\"title\":\"$REC Operator\",\"home\":\"machining\"}")
check "add a career with a home"                   201 "$OUT" '"home":{"slug":"machining","name":"Machining"}'
A=$(printf '%s' "$OUT" | j id)
check "a home that is not a domain"                400 "$(req a POST /occupations "{\"title\":\"$REC Nowhere\",\"home\":\"not-a-domain\"}")" '"field":"home"'
expect "and nothing was added"                     0 "$(sql "SELECT COUNT(*) FROM occupations WHERE title = '$REC Nowhere'")"
OUT=$(req a POST /occupations "{\"title\":\"$REC Technician\"}")
check "add one without"                            201 "$OUT" '"home":null'
B=$(printf '%s' "$OUT" | j id)
C=$(req a POST /occupations "{\"title\":\"$REC Specialist\"}" | j id)
E=$(req a POST /occupations "{\"title\":\"$REC Engineer\"}" | j id)
F=$(req a POST /occupations "{\"title\":\"$REC Fifth\"}" | j id)

check "401 signed out"                             401 "$(req anon PUT /occupations/$A "{\"leadsTo\":[\"$B\"]}")"
check "403 not an admin"                           403 "$(req p PUT /occupations/$A "{\"leadsTo\":[\"$B\"]}")"
OUT=$(req a PUT /occupations/$A "{\"leadsTo\":[\"$B\",\"$C\"]}")
check "a career leads to two others"               200 "$OUT"
expect "the answer has them in order"              "$REC Technician|$REC Specialist" "$(printf '%s' "$OUT" | j 'leadsTo.map((c) => c.title).join("|")')"
expect "the page has them in order"                "$REC Technician|$REC Specialist" "$(req anon GET /occupations/$A | j 'leadsTo.map((c) => c.title).join("|")')"
expect "and the next rung says where it comes from" "$REC Operator" "$(req anon GET /occupations/$B | j 'comesFrom.map((c) => c.title).join("|")')"
OUT=$(req a PUT /occupations/$A "{\"leadsTo\":[\"$C\",\"$B\"]}")
expect "the order can be changed"                  "$REC Specialist|$REC Technician" "$(req anon GET /occupations/$A | j 'leadsTo.map((c) => c.title).join("|")')"
OUT=$(req a GET "/admin/audit?kind=career&record=$A")
expect "the history names the ladder in words"     "$REC Technician,$REC Specialist>$REC Specialist,$REC Technician" "$(printf '%s' "$OUT" | j 'entries[0].detail.changes.leadsTo.map((l) => l.join(",")).join(">")')"
expect "an unchanged ladder writes no line"        2 "$(req a PUT /occupations/$A "{\"leadsTo\":[\"$C\",\"$B\"]}" >/dev/null; sql "SELECT COUNT(*) FROM audit_log WHERE record_id='$A' AND action='edited'")"

OUT=$(req a PUT /occupations/$B "{\"leadsTo\":[\"$A\"]}")
check "a link straight back is refused"            400 "$OUT" '"field":"leadsTo"'
check "with the reason"                            400 "$OUT" "$REC Operator already leads to $REC Technician"
check "a link down one more rung"                  200 "$(req a PUT /occupations/$C "{\"leadsTo\":[\"$E\"]}")"
OUT=$(req a PUT /occupations/$E "{\"leadsTo\":[\"$A\"]}")
check "a link that would close a longer ladder"    400 "$OUT" '"field":"leadsTo"'
check "names the steps"                            400 "$OUT" "$REC Operator → $REC Specialist → $REC Engineer"
expect "a refused link changed nothing"            0 "$(sql "SELECT COUNT(*) FROM occupation_links WHERE from_occupation_id = '$E'")"
check "a career does not lead to itself"           400 "$(req a PUT /occupations/$A "{\"leadsTo\":[\"$A\"]}")" '"field":"leadsTo"'
check "nor to the same career twice"               400 "$(req a PUT /occupations/$A "{\"leadsTo\":[\"$B\",\"$B\"]}")" '"field":"leadsTo"'
THIRTEEN=$(node -e 'console.log(JSON.stringify({leadsTo: Array.from({length: 13}, () => crypto.randomUUID())}))')
check "nor to thirteen"                            400 "$(req a PUT /occupations/$A "$THIRTEEN")" '"field":"leadsTo"'
check "with the most it takes"                     400 "$(req a PUT /occupations/$A "$THIRTEEN")" 'at most 12'
check "nor to a career that is not there"          400 "$(req a PUT /occupations/$A "{\"leadsTo\":[\"$NOBODY\"]}")" '"field":"leadsTo"'
check "nor to something that is not a list"        400 "$(req a PUT /occupations/$A '{"leadsTo":"Welder"}')" '"field":"leadsTo"'
expect "the ladder is as it was"                   "$REC Specialist|$REC Technician" "$(req anon GET /occupations/$A | j 'leadsTo.map((c) => c.title).join("|")')"
check "a ladder may reach a career of the catalogue" 200 "$(req a PUT /occupations/$F "{\"leadsTo\":[\"$MACHINIST\"]}")"
expect "which then comes from it"                  true "$(req anon GET /occupations/$MACHINIST | j "comesFrom.some((c) => c.id === '$F')")"

check "a home is corrected"                        200 "$(req a PUT /occupations/$A '{"home":"quality"}')" '"home":{"slug":"quality","name":"Quality"}'
expect "the history names the domains"             "Machining>Quality" "$(req a GET "/admin/audit?kind=career&record=$A" | j 'entries[0].detail.changes.home.join(">")')"
check "a home that is not a domain"                400 "$(req a PUT /occupations/$A '{"home":"not-a-domain"}')" '"field":"home"'
check "the editor reads the home and the ladder"   200 "$(req a GET /admin/records/career/$A)" '"home":"quality","homeName":"Quality"'
expect "the editor's ladder"                       "$REC Specialist|$REC Technician" "$(req a GET /admin/records/career/$A | j 'leadsTo.map((c) => c.title).join("|")')"
expect "and counts its links"                      2 "$(req a GET /admin/records/career/$A | j attached.links)"
check "a home can be emptied"                      200 "$(req a PUT /occupations/$A '{"home":null}')" '"home":null'
check "the list finds it under its domain no more" 200 "$(req anon GET "/occupations?domain=quality&search=$(enc "$REC")")" '"total":0'
check "a change that says nothing"                 400 "$(req a PUT /occupations/$A '{}')" 'Nothing to change'
# The form sends every other name back with a correction: a career that 42 titles were folded into can still be saved.
MANY=$(id_of 'Aircraft Structures Mechanic')
ONET=$(sql "SELECT COALESCE(onet_code, '') FROM occupations WHERE id = '$MANY'")
NAMES=$(req a GET /admin/records/career/$MANY | j 'aliases.length + "|" + JSON.stringify(o.aliases)')
check "a career with dozens of other names is saved with them" 200 "$(req a PUT /occupations/$MANY "{\"onetCode\":\"E2E-$RUN\",\"aliases\":${NAMES#*|}}")"
expect "and keeps every one"                       "${NAMES%%|*}" "$(sql "SELECT COUNT(*) FROM occupation_aliases WHERE canonical_occupation_id = '$MANY'")"
sql "UPDATE occupations SET onet_code = NULLIF('$ONET', '') WHERE id = '$MANY'" >/dev/null

# --- A career's service --------------------------------------------------------
# A military career is a career with a service (a company whose `service` is set), the service's
# code and its own title for the job. The Navy is used: the one that is stored, or one made here.
NAVY=$(sql "SELECT id FROM companies WHERE service = 'navy'")
if [ -z "$NAVY" ]; then
  NAVY=$(sql "INSERT INTO companies (name, service) VALUES ('$REC Navy', 'navy') RETURNING id" | head -n1)
fi
OUT=$(req anon GET /occupations/$A)
expect "a civilian career has no service"          "null null null null null" "$(printf '%s' "$OUT" | j 'service + " " + o.code + " " + o.codeSystem + " " + o.kind + " " + o.officialTitle')"
expect "and the stored columns are not in the answer" "undefined undefined" "$(printf '%s' "$OUT" | j 'serviceCompanyId + " " + o.code_system')"
G=$(req a POST /occupations "{\"title\":\"$REC Rating\",\"home\":\"fabrication\"}" | j id)
check "a service takes a code"                     400 "$(req a PUT /occupations/$G '{"service":"navy"}')" '"field":"code"'
check "a code takes a service"                     400 "$(req a PUT /occupations/$G '{"code":"E2E"}')" '"field":"code"'
check "a service is one of the four"               400 "$(req a PUT /occupations/$G '{"service":"coast-guard","code":"E2E"}')" '"field":"service"'
check "one with no code system yet is refused"     400 "$(req a PUT /occupations/$G '{"service":"marine-corps","code":"E2E"}')" '"field":"service"'
check "a code system is its service's"             400 "$(req a PUT /occupations/$G '{"service":"navy","code":"E2E","codeSystem":"army-mos"}')" '"field":"codeSystem"'
expect "a refused change wrote nothing"            "" "$(sql "SELECT COALESCE(code, '') FROM occupations WHERE id = '$G'")"
OUT=$(req a PUT /occupations/$G "{\"service\":\"navy\",\"code\":\" E2E$RUN \",\"officialTitle\":\"Rating\"}")
check "a career is given its service"              200 "$OUT" "\"service\":{\"id\":\"$NAVY\""
expect "the answer derives the system and the kind" "navy navy-rating|Navy rating|E2E$RUN|Rating" "$(printf '%s' "$OUT" | j 'service.key + " " + o.codeSystem + "|" + o.kind + "|" + o.code + "|" + o.officialTitle')"
OUT=$(req anon GET /occupations/$G)
expect "its page carries them"                     "navy|Navy rating|E2E$RUN|Rating" "$(printf '%s' "$OUT" | j 'service.key + "|" + o.kind + "|" + o.code + "|" + o.officialTitle')"
expect "and names the employer"                    "$(sql "SELECT name FROM companies WHERE id = '$NAVY'")" "$(printf '%s' "$OUT" | j 'service.name')"
OUT=$(req anon GET "/occupations?military=1&search=$(enc "$REC Rating")")
expect "a list row carries them too"               "navy|Navy rating|E2E$RUN" "$(printf '%s' "$OUT" | j 'data[0].service.key + "|" + o.data[0].kind + "|" + o.data[0].code')"
OUT=$(req a GET /admin/records/career/$G)
expect "the editor reads them"                     "navy|E2E$RUN|navy-rating|Navy rating|Rating" "$(printf '%s' "$OUT" | j 'fields.service + "|" + o.fields.code + "|" + o.fields.codeSystem + "|" + o.fields.kind + "|" + o.fields.officialTitle')"
OUT=$(req a GET "/admin/audit?kind=career&record=$G")
expect "the history names the service in words"    "$(sql "SELECT name FROM companies WHERE id = '$NAVY'")|Navy rating|E2E$RUN" "$(printf '%s' "$OUT" | j 'entries[0].detail.changes.service[1] + "|" + o.entries[0].detail.changes.codeSystem[1] + "|" + o.entries[0].detail.changes.code[1]')"
OUT=$(req a PUT /occupations/$B "{\"service\":\"navy\",\"code\":\"e2e$RUN\"}")
check "a code names one career of its system"      409 "$OUT" '"field":"code"'
check "and the refusal names the career that has it" 409 "$OUT" "\"existing\":{\"id\":\"$G\""
check "the code alone can be corrected"            200 "$(req a PUT /occupations/$G "{\"code\":\"E2X$RUN\"}")" "\"code\":\"E2X$RUN\""
expect "and the service stays"                     "$NAVY" "$(sql "SELECT service_company_id FROM occupations WHERE id = '$G'")"
check "a service with careers cannot be deleted"   409 "$(req a DELETE /companies/$NAVY)" 'military career'
expect "the company says it is a service"          navy "$(req anon GET /companies/$NAVY | j service)"
check "the service is taken off"                   200 "$(req a PUT /occupations/$G '{"service":null}')" '"service":null'
expect "and its code and title go with it"         "||" "$(sql "SELECT COALESCE(code, '') || '|' || COALESCE(code_system, '') || '|' || COALESCE(official_title, '') FROM occupations WHERE id = '$G'")"
expect "the database refuses a code with no service" 1 "$(psql "$DB" -qtAc "UPDATE occupations SET code = 'X' WHERE id = '$G'" 2>&1 | grep -c occupations_service_code_check)"
expect "and a code system that is not one of the three" 1 "$(psql "$DB" -qtAc "UPDATE occupations SET service_company_id = '$NAVY', code = 'X', code_system = 'rating' WHERE id = '$G'" 2>&1 | grep -c occupations_code_system_check)"
expect "and a service that is not one of the four" 1 "$(psql "$DB" -qtAc "UPDATE companies SET service = 'coast-guard' WHERE id = '$NAVY'" 2>&1 | grep -c companies_service_check)"
check "delete the career"                          200 "$(req a DELETE /occupations/$G)"

# --- A merge moves the ladder -----------------------------------------------------
# Operator leads to Specialist and Technician; Specialist leads to Engineer; Fifth leads to CNC Machinist.
# Merging Specialist into Technician: Operator's two links become one, and Technician leads to Engineer.
OUT=$(req a POST /admin/records/career/$C/merge "{\"into\":\"$B\"}")
check "merge one career into another"              200 "$OUT" "\"kept\":{\"id\":\"$B\""
expect "the kept career leads where the merged one led" "$REC Engineer" "$(req anon GET /occupations/$B | j 'leadsTo.map((c) => c.title).join("|")')"
expect "what led to both leads to the kept one once" "$REC Technician" "$(req anon GET /occupations/$A | j 'leadsTo.map((c) => c.title).join("|")')"
# Technician leads to Engineer. Merging Engineer into Technician must not leave Technician leading to itself.
OUT=$(req a POST /admin/records/career/$E/merge "{\"into\":\"$B\"}")
check "merge the next rung into the one before it" 200 "$OUT"
expect "no career leads to itself"                 0 "$(sql "SELECT COUNT(*) FROM occupation_links WHERE from_occupation_id = to_occupation_id")"
expect "and the link between the two is gone"      "" "$(req anon GET /occupations/$B | j 'leadsTo.map((c) => c.title).join("|")')"
check "delete a career on a ladder"                200 "$(req a DELETE /occupations/$B)"
expect "its links go with it"                      "" "$(req anon GET /occupations/$A | j 'leadsTo.map((c) => c.title).join("|")')"
check "delete the one that led to a catalogue career" 200 "$(req a DELETE /occupations/$F)"
expect "the catalogue career no longer comes from it" false "$(req anon GET /occupations/$MACHINIST | j "comesFrom.some((c) => c.id === '$F')")"

cleanup
expect "nothing of this run is left behind"        '0 0 0' "$(sql "SELECT (SELECT COUNT(*) FROM users WHERE email LIKE '%@careers.test') || ' ' || (SELECT COUNT(*) FROM occupations WHERE title LIKE 'E2E Careers %') || ' ' || (SELECT COUNT(*) FROM audit_log WHERE record_name LIKE 'E2E Careers %')")"
expect "and the catalogue's links are as the file has them" "$(cat_ 'careers.reduce((n,x)=>n+x.leadsTo.length,0)')" "$(sql "SELECT COUNT(*) FROM occupation_links")"
finish
