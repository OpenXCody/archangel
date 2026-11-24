#!/usr/bin/env bash
# End-to-end check of the military careers' data: the four services as employers
# (migration 0062, their descriptions brought up to date by 0077), the careers with their service and code (0063) and their paths
# (0064), all from scripts/build-military-sql.mjs, as the database holds them and
# as the API serves them: a military career has its page and is listed when asked
# for, and every default list, count, search and suggestion is of civilian careers.
# Then where a military career is used: the site's search when the query names it,
# reach between a military career's path and a civilian one's, a skill's and a
# service's careers, and Profile's door (its skills marked held, and the Undo).
# Prints one line per check and exits non-zero if any fail.
#
# It reads what the migrations loaded (data/careers/military/: the database must
# have had 0059 to 0064 applied, as `scripts/create-db.mjs --sample` leaves it),
# then lays out rows as production might hold them (a service stored in other
# letters and with plants, a company that carries a service under another name, a
# name that only resembles a service's; a career that carries a code under another
# title, a civilian career with a military career's title, a path a person
# approved), applies migrations generated from small files twice and reads what
# they did, each inside one transaction that is rolled back.
#
# LOCAL ONLY: it creates and deletes users (emails ending @military.test), promotes
# one to admin with scripts/make-admin.mjs, and leaves nothing else behind. Never
# point it at production.
#   API=http://localhost:3000/api DB=postgresql://... bash tests/api/military.sh
# Needs a running dev API, and psql, curl and node on the PATH.
set -u
. "$(dirname "$0")/lib.sh"
case "$DB" in *@localhost[:/]*|*@127.0.0.1[:/]*) ;; *) echo "Refusing to run against that database: local only."; exit 2;; esac
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
D=$(mktemp -d)
RUN=$(date +%s)
cleanup() {
  psql "$DB" -qtAc "
    DELETE FROM audit_log WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%@military.test');
    DELETE FROM users WHERE email LIKE '%@military.test';" >/dev/null
}
cleanup
trap 'cleanup; rm -rf "$D"' EXIT
PW='"password":"correct horse"'
# This suite's expect puts each value in brackets: many of its values are lists, or empty.
expect() { # name wanted got
  if [ "$2" = "$3" ]; then echo "ok    $1"; else echo "FAIL  $1: wanted [$2] got [$3]"; fail=1; fi
}
# What the employers file says, to hold the API to: `emp <expression over the file's companies>`.
emp() { node -e "const companies=JSON.parse(require('fs').readFileSync('$ROOT/data/careers/military/employers.json','utf8')).companies;console.log(eval(process.argv[1]))" "$1"; }
# The same over the careers and their paths: `mil <expression over careers and paths>`.
mil() { node -e "const read=(f)=>JSON.parse(require('fs').readFileSync('$ROOT/data/careers/military/'+f,'utf8')).careers;const careers=read('careers.json');const paths=read('paths.json');const by=(t)=>careers.find((x)=>x.title===t);const path=(t)=>paths.find((x)=>x.title===t);console.log(eval(process.argv[1]))" "$1"; }
enc() { node -e "console.log(encodeURIComponent(process.argv[1]))" "$1"; }
id_of() { sql "SELECT id FROM occupations WHERE title = '$1'"; }

# --- The real files ----------------------------------------------------------------
(cd "$ROOT" && node scripts/build-military-sql.mjs --check) > "$D/check.log" 2>&1
expect "the military files pass their check" 0 "$?"
(cd "$ROOT" && node scripts/build-military-sql.mjs employers "$D/employers.sql") > /dev/null 2>&1
expect "the employers' migration in the repository is what the file generates" 0 "$(cmp -s "$D/employers.sql" "$ROOT/migrations/0077_military_employers_2.sql"; echo $?)"
(cd "$ROOT" && node scripts/build-military-sql.mjs careers "$D/careers.sql" && node scripts/build-military-sql.mjs paths "$D/paths.sql") > /dev/null 2>&1
expect "so is the careers'"                        0 "$(cmp -s "$D/careers.sql" "$ROOT/migrations/0063_military_careers.sql"; echo $?)"
expect "and the paths'"                            0 "$(cmp -s "$D/paths.sql" "$ROOT/migrations/0064_military_paths.sql"; echo $?)"

# --- The four services are stored ----------------------------------------------------
expect "one company for each service"              "$(emp 'companies.map((c)=>c.service+"="+c.name).sort().join("|")')" "$(sql "SELECT string_agg(service || '=' || name, '|' ORDER BY service) FROM companies WHERE service IS NOT NULL")"
expect "none has a plant"                          0 "$(sql "SELECT COUNT(*) FROM factories f INNER JOIN companies c ON c.id = f.company_id WHERE c.service IS NOT NULL")"
expect "each has its slug, domain and headquarters" 4 "$(sql "SELECT COUNT(*) FROM companies WHERE service IS NOT NULL AND slug IS NOT NULL AND domain IS NOT NULL AND headquarters_city = 'Arlington' AND headquarters_state = 'VA' AND headquarters_country = 'US'")"
expect "none is a featured employer"               0 "$(sql "SELECT COUNT(*) FROM companies WHERE service IS NOT NULL AND featured")"
expect "the log has its summary"                   t "$(sql "SELECT COUNT(*) > 0 FROM load_log WHERE load = 'military-employers' AND action = 'summary'")"
NAVY=$(sql "SELECT id FROM companies WHERE service = 'navy'")

# --- A service is an employer, and is not browsed to as a manufacturer -------------
OUT=$(req anon GET /companies/us-navy)
check "a service's page, by its slug"              200 "$OUT" '"service":"navy"'
expect "it is the company the file names"          "$(emp 'companies.find((c)=>c.service==="navy").name')" "$(printf '%s' "$OUT" | j name)"
expect "with no plants, and nothing broken by that" "0 0 0 0" "$(printf '%s' "$OUT" | j 'factories.length + " " + o.factoryCount + " " + o.jobs.length + " " + o.occupations.length')"
expect "its headquarters"                          "Arlington, VA, US" "$(printf '%s' "$OUT" | j 'headquarters.city + ", " + o.headquarters.state + ", " + o.headquarters.country')"
check "by its id too"                              200 "$(req anon GET /companies/$NAVY)" '"slug":"us-navy"'
expect "a company that is not a service says so"   null "$(req anon GET "/companies/$(sql "SELECT id FROM companies WHERE service IS NULL ORDER BY name LIMIT 1")" | j service)"
expect "the Companies list leaves the services out" "$(sql "SELECT COUNT(*) FROM companies WHERE service IS NULL AND name ~ '[A-Za-z]{2,}' AND name !~ '^[#(]' AND name !~ '^\\d+\\s' AND name !~ '^\\d+/\\d'")" "$(req anon GET '/companies?limit=1' | j total)"
for NAME in 'U.S. Navy' 'U.S. Army' 'U.S. Air Force' 'U.S. Marine Corps'; do
  expect "the list does not find $NAME"            0 "$(req anon GET "/companies?search=$(enc "$NAME")" | j total)"
done
expect "Explore's count of companies is the list's" "$(req anon GET '/companies?limit=1' | j total)" "$(req anon GET /stats/counts | j companies)"
OUT=$(req anon GET '/search?q=navy')
expect "search lists no service among the companies" 0 "$(printf '%s' "$OUT" | j 'results.companies.items.filter((c) => /^U\.S\. /.test(c.name)).length')"
expect "the overview's employers have plants, so no service" 0 "$(req anon GET /explore/overview | j 'employers.filter((c) => /^U\.S\. (Navy|Army|Air Force|Marine Corps)$/.test(c.name)).length')"
OUT=$(req anon GET "/factories/pins?company=$NAVY")
check "the map's pins for a service: none, and no error" 200 "$OUT" '"pins":\[\]'
check "sign-up"                                    201 "$(req p POST /auth/sign-up "{\"email\":\"person-$RUN@military.test\",\"name\":\"Pat Person\",\"purpose\":\"hire\",$PW}")"
OUT=$(req p GET '/employer/companies?q=U.S.%20Navy')
check "the employer's company finder answers"      200 "$OUT"
# A service is an employer with careers and nothing else here: nobody joins it to post jobs, so the finder that
# leads to "request access" does not offer it, by its name, a part of it or the closest match.
expect "and does not offer the service"            0 "$(printf '%s' "$OUT" | j 'companies.filter((c) => /^U\.S\. (Navy|Army|Air Force|Marine Corps)$/.test(c.name)).length')"
for TERM in 'nav' 'navy' 'usn' 'navy yard' 'force' 'corps' 'U.S. Army' 'air force'; do
  expect "nor for “$TERM”"                          0 "$(req p GET "/employer/companies?q=$(enc "$TERM")" | j 'companies.filter((c) => /^U\.S\. (Navy|Army|Air Force|Marine Corps)$/.test(c.name)).length')"
done
check "a service is not asked to be joined"        400 "$(req p POST /employer/memberships "{\"companyId\":\"$NAVY\"}")" 'is a military service'
check "asking for it to be added says what it is"  400 "$(req p POST /employer/company-requests '{"name":"u.s. navy","place":"Norfolk, VA"}')" 'is a military service'
expect "nothing was asked of the admins"           "0 0" "$(sql "SELECT (SELECT COUNT(*) FROM company_members WHERE company_id = '$NAVY') || ' ' || (SELECT COUNT(*) FROM company_requests r INNER JOIN users u ON u.id = r.user_id WHERE u.email = 'person-$RUN@military.test')")"

# --- The careers are stored, each with its service, its code and a draft path ----------
MIL="o.service_company_id IS NOT NULL AND o.title NOT LIKE '% E2E %'"
expect "every career of the file is stored"        "$(mil 'careers.length')" "$(sql "SELECT COUNT(*) FROM occupations o WHERE $MIL")"
expect "each under its service"                    "$(mil '["air-force","army","navy"].map((s)=>s+"="+careers.filter((c)=>c.service===s).length).join("|")')" "$(sql "SELECT string_agg(x, '|' ORDER BY x) FROM (SELECT c.service || '=' || COUNT(*) AS x FROM occupations o INNER JOIN companies c ON c.id = o.service_company_id WHERE $MIL GROUP BY c.service) q")"
expect "the Marine Corps has none yet"             0 "$(sql "SELECT COUNT(*) FROM occupations o INNER JOIN companies c ON c.id = o.service_company_id WHERE c.service = 'marine-corps'")"
expect "each with its code, its system, the service's title and a home" "$(mil 'careers.length')" "$(sql "SELECT COUNT(*) FROM occupations o WHERE $MIL AND o.code IS NOT NULL AND o.code_system IS NOT NULL AND o.official_title IS NOT NULL AND o.home_domain IS NOT NULL AND o.description IS NOT NULL")"
expect "a code system is its service's"            0 "$(sql "SELECT COUNT(*) FROM occupations o INNER JOIN companies c ON c.id = o.service_company_id WHERE (c.service, o.code_system) NOT IN (('navy', 'navy-rating'), ('army', 'army-mos'), ('air-force', 'afsc'))")"
expect "every path is a draft"                     "$(mil 'careers.length')" "$(sql "SELECT COUNT(*) FROM occupations o WHERE $MIL AND o.path_status = 'draft'")"
expect "with exactly the file's lines"             "$(mil 'paths.reduce((n,p)=>n+p.skills.length,0)')" "$(sql "SELECT COUNT(*) FROM occupation_skills os INNER JOIN occupations o ON o.id = os.occupation_id WHERE $MIL")"
expect "each line at its skill's level"            0 "$(sql "SELECT COUNT(*) FROM occupation_skills os INNER JOIN skills s ON s.id = os.skill_id WHERE os.stage IS DISTINCT FROM s.level")"
expect "its other names are stored"                "$(mil 'careers.reduce((n,c)=>n+c.was.length,0)')" "$(sql "SELECT COUNT(*) FROM occupation_aliases a INNER JOIN occupations o ON o.id = a.canonical_occupation_id WHERE $MIL")"
expect "no military career is typical of an industry" 0 "$(sql "SELECT COUNT(*) FROM industry_occupations io INNER JOIN occupations o ON o.id = io.occupation_id WHERE o.service_company_id IS NOT NULL")"
expect "none is on a ladder"                       0 "$(sql "SELECT COUNT(*) FROM occupation_links l INNER JOIN occupations o ON o.id IN (l.from_occupation_id, l.to_occupation_id) WHERE o.service_company_id IS NOT NULL")"
expect "none is a company's version of a career"   0 "$(sql "SELECT COUNT(*) FROM company_careers cc INNER JOIN occupations o ON o.id = cc.occupation_id WHERE o.service_company_id IS NOT NULL")"
expect "the civilian catalogue is as it was"       "$(node -e "console.log(JSON.parse(require('fs').readFileSync('$ROOT/data/careers/catalogue.json','utf8')).careers.length)")" "$(sql "SELECT COUNT(*) FROM occupations WHERE service_company_id IS NULL AND title NOT LIKE 'E2E %'")"
expect "the log has both summaries"                2 "$(sql "SELECT COUNT(DISTINCT load) FROM load_log WHERE load IN ('military-careers', 'military-paths') AND action = 'summary'")"
CIVILIAN=$(sql "SELECT COUNT(*) FROM occupations WHERE service_company_id IS NULL")
HT=$(id_of 'Navy Hull Maintenance Technician')

# --- A military career's page ------------------------------------------------------------
OUT=$(req anon GET /occupations/$HT)
check "a military career's page"                   200 "$OUT" '"kind":"Navy rating"'
expect "its service, code and the service's title" "navy|U.S. Navy|us-navy|HT|navy-rating|Hull Maintenance Technician" "$(printf '%s' "$OUT" | j 'service.key + "|" + o.service.name + "|" + o.service.slug + "|" + o.code + "|" + o.codeSystem + "|" + o.officialTitle')"
expect "its home, and a draft path of the file's skills" "fabrication draft $(mil 'path("Navy Hull Maintenance Technician").skills.length')" "$(printf '%s' "$OUT" | j 'home.slug + " " + o.pathStatus + " " + o.skills.length')"
expect "no industry, no ladder, no plants, no versions" "0 false 0 0 0 0" "$(printf '%s' "$OUT" | j 'industries.length + " " + o.everywhere + " " + o.leadsTo.length + " " + o.comesFrom.length + " " + o.factories.length + " " + o.versions.length')"
expect "an Army career's words"                    "Army MOS|15T" "$(req anon GET "/occupations/$(sql "SELECT id FROM occupations WHERE code_system = 'army-mos' AND code = '15T'")" | j 'kind + "|" + o.code')"
expect "an Air Force career's"                     "Air Force specialty|2A3X3" "$(req anon GET "/occupations/$(sql "SELECT id FROM occupations WHERE code_system = 'afsc' AND code = '2A3X3'")" | j 'kind + "|" + o.code')"

# --- The Careers list is civilian unless asked ---------------------------------------------
OUT=$(req anon GET '/occupations?limit=100')
expect "the list counts civilian careers"          "$CIVILIAN" "$(printf '%s' "$OUT" | j total)"
expect "and no row is a service's"                 0 "$(printf '%s' "$OUT" | j 'data.filter((c) => c.service !== null || c.kind !== null || c.code !== null).length')"
expect "by name too"                               "$CIVILIAN" "$(req anon GET '/occupations?sort=name&limit=1' | j total)"
OUT=$(req anon GET '/occupations?military=1&limit=100')
expect "asked for, the military careers"           "$(mil 'careers.length')" "$(printf '%s' "$OUT" | j total)"
expect "each row with its service, kind and code"  100 "$(printf '%s' "$OUT" | j 'data.filter((c) => c.service && c.service.key && c.kind && c.code && c.codeSystem && c.officialTitle).length')"
expect "one service's"                             "$(mil 'careers.filter((c)=>c.service==="navy").length')" "$(req anon GET '/occupations?service=navy&limit=1' | j total)"
expect "every row of it that service's"            "navy" "$(req anon GET '/occupations?service=navy&limit=100' | j 'data.map((c) => c.service.key).filter((k, i, all) => all.indexOf(k) === i).join("|")')"
expect "a service with no careers yet is an empty list" 0 "$(req anon GET '/occupations?service=marine-corps' | j total)"
check "a service that is not one"                  400 "$(req anon GET '/occupations?service=coast-guard')" 'navy, army, air-force or marine-corps'
expect "a domain narrows the civilian list"        "$(sql "SELECT COUNT(*) FROM occupations WHERE home_domain = 'fabrication' AND service_company_id IS NULL")" "$(req anon GET '/occupations?domain=fabrication' | j total)"
expect "and the military one"                      "$(mil 'careers.filter((c)=>c.home==="fabrication").length')" "$(req anon GET '/occupations?military=1&domain=fabrication' | j total)"
expect "a search does not find a military career"  0 "$(req anon GET "/occupations?search=$(enc 'hull maintenance')" | j 'data.filter((c) => c.service !== null).length')"
expect "not by its code-first name"                0 "$(req anon GET "/occupations?search=$(enc 'Navy HT')" | j 'data.filter((c) => /^Navy /.test(c.title)).length')"
expect "nor by the closest titles"                 0 "$(req anon GET "/occupations?search=$(enc 'Navy Hull Maintenance Technican')" | j 'data.filter((c) => c.service !== null).length')"
expect "Electronics Technician is the civilian career" "Electronics Technician|null" "$(req anon GET "/occupations?search=$(enc 'Electronics Technician')" | j 'data[0].title + "|" + o.data[0].service')"
expect "asked for, a search finds it"              "Navy Hull Maintenance Technician" "$(req anon GET "/occupations?military=1&search=$(enc 'hull maintenance')" | j 'data[0].title')"
expect "by another name, which it says"            "Navy Hull Maintenance Technician|HT Hull Maintenance Technician" "$(req anon GET "/occupations?military=1&search=$(enc 'HT Hull Maintenance')" | j 'data[0].title + "|" + o.data[0].alsoCalled')"
expect "by its service and code, which its own line says" "Navy Hull Maintenance Technician|null|HT" "$(req anon GET "/occupations?military=1&search=$(enc 'Navy HT')" | j 'data[0].title + "|" + o.data[0].alsoCalled + "|" + o.data[0].code')"
expect "and never a civilian career"               0 "$(req anon GET "/occupations?military=1&search=welder&limit=100" | j 'data.filter((c) => c.service === null).length')"

# --- Search, counts and Explore are civilian -----------------------------------------------
OUT=$(req anon GET "/search?q=$(enc 'hull maintenance')")
expect "the site search lists no military career"  0 "$(printf '%s' "$OUT" | j 'results.occupations.count')"
expect "nor for a service's name"                  0 "$(req anon GET '/search?q=navy&types=occupations' | j 'results.occupations.items.filter((c) => /^Navy /.test(c.name)).length')"
expect "nor for a code"                            0 "$(req anon GET '/search?q=2A3X3&types=occupations' | j 'results.occupations.count')"
OUT=$(req anon GET "/search?q=$(enc 'electronics technician')&types=occupations")
expect "a plain title finds civilian careers only" "Electronics Technician|0" "$(printf '%s' "$OUT" | j 'results.occupations.items[0].name + "|" + o.results.occupations.items.filter((c) => /^(Navy|Army|Air Force) /.test(c.name)).length')"
expect "its count is of civilian careers"          "$(sql "SELECT COUNT(*) FROM occupations o WHERE o.service_company_id IS NULL AND (o.title ILIKE '%electronics technician%' OR o.description ILIKE '%electronics technician%' OR EXISTS (SELECT 1 FROM occupation_aliases a WHERE a.canonical_occupation_id = o.id AND a.alias_text ILIKE '%electronics technician%'))")" "$(printf '%s' "$OUT" | j 'results.occupations.count')"
expect "Explore's count of careers is civilian"    "$CIVILIAN" "$(req anon GET /stats/counts | j occupations)"
OUT=$(req anon GET /explore/overview)
expect "the overview shows no military career"     0 "$(printf '%s' "$OUT" | j 'careers.filter((c) => /^(Navy|Army|Air Force) /.test(c.title)).length')"
OUT=$(req anon GET /explore/facets)
expect "the homes offered are civilian careers'"   "$(sql "SELECT string_agg(d.slug, '|' ORDER BY d.position) FROM skill_domains d WHERE EXISTS (SELECT 1 FROM occupations o WHERE o.home_domain = d.slug AND o.service_company_id IS NULL)")" "$(printf '%s' "$OUT" | j 'careerDomains.map((d) => d.slug).join("|")')"
expect "a group only military careers use is not a filter" false "$(printf '%s' "$OUT" | j 'skillDomains.some((d) => d.groups.some((g) => g.slug === "weapons-and-munitions"))')"

# --- How many careers use a skill: civilian careers ----------------------------------------
TORPEDO=$(sql "SELECT id FROM skills WHERE name = 'Torpedo Maintenance'")
PRINT=$(sql "SELECT id FROM skills WHERE name = 'Blueprint Reading'")
CIVIL_PRINT=$(sql "SELECT COUNT(*) FROM occupation_skills os INNER JOIN occupations o ON o.id = os.occupation_id WHERE os.skill_id = '$PRINT' AND o.service_company_id IS NULL")
expect "a military career does use each"           "true true" "$(sql "SELECT (SELECT COUNT(*) > 0 FROM occupation_skills os INNER JOIN occupations o ON o.id = os.occupation_id WHERE os.skill_id = '$TORPEDO' AND o.service_company_id IS NOT NULL) || ' ' || (SELECT COUNT(*) > 0 FROM occupation_skills os INNER JOIN occupations o ON o.id = os.occupation_id WHERE os.skill_id = '$PRINT' AND o.service_company_id IS NOT NULL)")"
OUT=$(req anon GET /skills/taxonomy)
expect "the taxonomy counts civilian careers"      "0 $CIVIL_PRINT" "$(printf '%s' "$OUT" | j "domains.flatMap((d) => d.groups).flatMap((g) => g.skills).find((s) => s.id === '$TORPEDO').careers + ' ' + o.domains.flatMap((d) => d.groups).flatMap((g) => g.skills).find((s) => s.id === '$PRINT').careers")"
expect "and still has every skill"                 "$(sql "SELECT COUNT(*) FROM skills WHERE group_slug IS NOT NULL AND level IS NOT NULL")" "$(printf '%s' "$OUT" | j 'domains.flatMap((d) => d.groups).flatMap((g) => g.skills).length')"
expect "the Skills list is of skills a civilian career uses" "$(sql "SELECT COUNT(*) FROM skills s WHERE EXISTS (SELECT 1 FROM occupation_skills os INNER JOIN occupations o ON o.id = os.occupation_id WHERE os.skill_id = s.id AND o.service_company_id IS NULL)")" "$(req anon GET '/skills?limit=1' | j total)"
# A skill only military careers use is reached on purpose: the list leaves it out, its domain's list leaves it out,
# and the list narrowed to its own group (where its page and the Atlas lead) is that group's skills, in every order.
ONLY_MILITARY="EXISTS (SELECT 1 FROM occupation_skills os WHERE os.skill_id = s.id) AND NOT EXISTS (SELECT 1 FROM occupation_skills os INNER JOIN occupations o ON o.id = os.occupation_id WHERE os.skill_id = s.id AND o.service_company_id IS NULL)"
expect "some skills are used by military careers alone" true "$(sql "SELECT COUNT(*) > 0 FROM skills s WHERE $ONLY_MILITARY" | sed 's/^t$/true/')"
expect "its domain's list leaves them out"         "$(sql "SELECT COUNT(*) FROM skills s INNER JOIN skill_groups g ON g.slug = s.group_slug WHERE g.domain_slug = 'assembly' AND EXISTS (SELECT 1 FROM occupation_skills os INNER JOIN occupations o ON o.id = os.occupation_id WHERE os.skill_id = s.id AND o.service_company_id IS NULL)")" "$(req anon GET '/skills?domain=assembly&limit=1' | j total)"
GROUP_SIZE=$(sql "SELECT COUNT(*) FROM skills s WHERE s.group_slug = 'weapons-and-munitions' AND EXISTS (SELECT 1 FROM occupation_skills os WHERE os.skill_id = s.id)")
expect "narrowed to a group only military careers use, the list is that group's skills" "$GROUP_SIZE" "$(req anon GET '/skills?group=weapons-and-munitions' | j total)"
expect "in name order too"                         "$GROUP_SIZE" "$(req anon GET '/skills?domain=assembly&group=weapons-and-munitions&sort=name' | j total)"
expect "each with no civilian career to count"     0 "$(req anon GET '/skills?group=weapons-and-munitions&limit=100' | j 'data.filter((s) => s.occupationCount !== 0).length')"
expect "the group filter still does not offer it"  0 "$(req anon GET /explore/facets | j 'skillDomains.flatMap((d) => d.groups).filter((g) => g.slug === "weapons-and-munitions").length')"
expect "Explore's count of skills leaves them out" "$(sql "SELECT COUNT(*) FROM skills s WHERE NOT ($ONLY_MILITARY)")" "$(req anon GET /stats/counts | j skills)"
OUT=$(req anon GET '/skills?search=torpedo')
expect "a search still finds the skill, used by no civilian career" "Torpedo Maintenance 0" "$(printf '%s' "$OUT" | j 'data[0].name + " " + o.data[0].occupationCount')"
expect "a row's count is civilian"                 "$CIVIL_PRINT" "$(req anon GET "/skills?search=$(enc 'Blueprint Reading')" | j 'data[0].occupationCount')"
OUT=$(req anon GET /skills/$TORPEDO)
check "the skill's page"                           200 "$OUT" '"name":"Torpedo Maintenance"'
expect "lists no career, and no related skill from a military path" "0 0" "$(printf '%s' "$OUT" | j 'occupations.length + " " + o.relatedSkills.length')"
OUT=$(req anon GET /skills/$PRINT)
expect "a shared skill's page lists its civilian careers" "$CIVIL_PRINT 0" "$(printf '%s' "$OUT" | j 'occupations.length + " " + o.occupations.filter((c) => /^(Navy|Army|Air Force) /.test(c.title)).length')"

# --- A seeker is offered civilian careers ----------------------------------------------------
check "sign-up seeker"                             201 "$(req s POST /auth/sign-up "{\"email\":\"seeker-$RUN@military.test\",\"name\":\"Sam Seeker\",\"purpose\":\"work\",$PW}")"
for SKILL in $(sql "SELECT skill_id FROM occupation_skills WHERE occupation_id = '$HT'"); do req s PUT /me/skills/$SKILL '{"status":"held"}' > /dev/null; done
expect "a person holds every skill of the rating"  "$(mil 'path("Navy Hull Maintenance Technician").skills.length')" "$(req s GET /me/skills | j 'skills.filter((s) => s.status === "held").length')"
OUT=$(req s GET /me/careers/reach)
check "careers within reach"                       200 "$OUT"
expect "are civilian careers, though the rating is held whole" "true 0" "$(printf '%s' "$OUT" | j 'careers.length > 0') $(sql "SELECT COUNT(*) FROM occupations WHERE service_company_id IS NOT NULL AND id IN ($(printf '%s' "$OUT" | j 'careers.map((c) => "\x27" + c.id + "\x27").join(",")'))")"
expect "the welding careers its path covers lead"  true "$(printf '%s' "$OUT" | j 'careers.slice(0, 3).some((c) => /Welder|Fabricator/.test(c.title))')"
OUT=$(req s GET '/me/skills/suggested?limit=40')
expect "suggested skills come from civilian careers" 0 "$(printf '%s' "$OUT" | j 'skills.filter((s) => /^(Navy|Army|Air Force) /.test(s.career)).length')"
check "a military career is not a goal"            400 "$(req s PUT /me/goals/$HT)" 'cannot be set as a goal'
expect "and none was set"                          0 "$(sql "SELECT COUNT(*) FROM user_goals g INNER JOIN users u ON u.id = g.user_id WHERE u.email = 'seeker-$RUN@military.test'")"

# --- Nobody posts a job, or writes a company's version, for a military career ------------------
check "sign-up admin"                              201 "$(req a POST /auth/sign-up "{\"email\":\"admin-$RUN@military.test\",\"name\":\"Ada Admin\",$PW}")"
DATABASE_URL="$DB" node "$ROOT/scripts/make-admin.mjs" "admin-$RUN@military.test" >/dev/null 2>&1
expect "make-admin made the admin"                 0 "$?"
PLANT=$(sql "SELECT f.id || ' ' || f.company_id FROM factories f WHERE f.company_id IS NOT NULL ORDER BY f.id LIMIT 1")
check "a job for a military career is refused"     400 "$(req a POST /jobs "{\"companyId\":\"${PLANT#* }\",\"factoryId\":\"${PLANT% *}\",\"occupationId\":\"$HT\",\"payMin\":20,\"payMax\":30}")" 'military career'
check "so is a company's version of one"           400 "$(req a POST /companies/${PLANT#* }/careers "{\"occupationId\":\"$HT\"}")" 'military career'
# Nor does a service have what a manufacturer has: people who post for it, plants, or a version of a civilian
# career (which would list the service on that career's page). Each is refused, an admin's hand included.
PERSON=$(sql "SELECT id FROM users WHERE email = 'person-$RUN@military.test'")
CIVIL=$(sql "SELECT id FROM occupations WHERE title = 'Welder'")
check "an admin does not join a service"           400 "$(req a POST /employer/memberships "{\"companyId\":\"$NAVY\"}")" 'is a military service'
check "nor add a person to one"                    400 "$(req a POST /admin/memberships "{\"companyId\":\"$NAVY\",\"userId\":\"$PERSON\"}")" 'is a military service'
check "a plant is not asked for it"                400 "$(req a POST /employer/company-requests "{\"companyId\":\"$NAVY\",\"place\":\"Norfolk, VA\"}")" 'is a military service'
check "a plant is not added to it"                 400 "$(req a POST /factories "{\"companyId\":\"$NAVY\",\"name\":\"E2E Mil Yard\",\"state\":\"VA\",\"latitude\":36.85,\"longitude\":-76.3}")" '"field":"company"'
check "nor moved to it"                            400 "$(req a PUT /factories/${PLANT% *} "{\"companyId\":\"$NAVY\"}")" 'is a military service'
check "a service has no version of a civilian career" 400 "$(req a POST /companies/$NAVY/careers "{\"occupationId\":\"$CIVIL\"}")" 'is a military service'
expect "none of it was written"                    "0 0 0 0" "$(sql "SELECT (SELECT COUNT(*) FROM company_members WHERE company_id = '$NAVY') || ' ' || (SELECT COUNT(*) FROM factories WHERE company_id = '$NAVY') || ' ' || (SELECT COUNT(*) FROM company_careers WHERE company_id = '$NAVY') || ' ' || (SELECT COUNT(*) FROM company_requests WHERE company_id = '$NAVY')")"
expect "and the civilian career lists no service"  0 "$(req anon GET /occupations/$CIVIL | j 'versions.filter((v) => /^U\.S\. /.test(v.companyName || v.name || "")).length')"
# An admin's writes keep a military career where it is: on no ladder at either end, nobody's goal, and never
# merged with a civilian career (which would hand it that career's goals, jobs, industries and ladder).
LADDER=$(req anon GET /occupations/$CIVIL | j 'leadsTo.map((c) => c.id).join(",")')
check "a civilian career does not lead to a military one" 400 "$(req a PUT /occupations/$CIVIL "{\"leadsTo\":[\"$HT\"]}")" '"field":"leadsTo"'
check "nor a military career to a civilian one"    400 "$(req a PUT /occupations/$HT "{\"leadsTo\":[\"$CIVIL\"]}")" 'is on no ladder'
expect "the ladder is as it was"                   "$LADDER|" "$(req anon GET /occupations/$CIVIL | j 'leadsTo.map((c) => c.id).join(",")')|$(req anon GET /occupations/$HT | j 'leadsTo.concat(o.comesFrom).map((c) => c.id).join(",")')"
AIMED=$(req a POST /occupations "{\"title\":\"E2E Mil Aimed $RUN\"}" | j id)
SERVED=$(req a POST /occupations "{\"title\":\"E2E Mil Served $RUN\"}" | j id)
check "a test career is made a military one"       200 "$(req a PUT /occupations/$SERVED "{\"service\":\"navy\",\"code\":\"ZZ$RUN\",\"officialTitle\":\"Served $RUN\"}")" '"kind":"Navy rating"'
check "another is a person's goal"                 200 "$(req p PUT /me/goals/$AIMED)"
check "a career that is somebody's goal is not made a military one" 400 "$(req a PUT /occupations/$AIMED "{\"service\":\"navy\",\"code\":\"ZY$RUN\",\"officialTitle\":\"Aimed $RUN\"}")" '1 goal'
check "it is not merged into a military career"    409 "$(req a POST /admin/records/career/$AIMED/merge "{\"into\":\"$SERVED\"}")" 'are not merged'
check "nor a military career into it"              409 "$(req a POST /admin/records/career/$SERVED/merge "{\"into\":\"$AIMED\"}")" 'are not merged'
expect "the person's goal is still the civilian career" "E2E Mil Aimed $RUN|null" "$(req p GET /me/goals | j 'goals.map((g) => g.title).join(",")')|$(req anon GET /occupations/$AIMED | j service)"
expect "both careers are still there"              2 "$(sql "SELECT COUNT(*) FROM occupations WHERE id IN ('$AIMED', '$SERVED')")"
req p DELETE /me/goals/$AIMED > /dev/null
check "the test careers are removed"               200 "$(req a DELETE /occupations/$AIMED)"
check "both"                                       200 "$(req a DELETE /occupations/$SERVED)"
expect "the career picker offers none"             0 "$(req a GET "/occupations?search=$(enc 'technician')&limit=100" | j 'data.filter((c) => c.service !== null).length')"
OUT=$(req a GET '/admin/paths?status=draft')
expect "the admin's draft paths include them, each with its service and code" "navy HT" "$(printf '%s' "$OUT" | j "paths.find((p) => p.id === '$HT').service + ' ' + o.paths.find((p) => p.id === '$HT').code")"
expect "and a civilian draft says it has neither"  "null null" "$(printf '%s' "$OUT" | j 'paths.find((p) => !/^(Navy|Army|Air Force) /.test(p.title)).service + " " + o.paths.find((p) => !/^(Navy|Army|Air Force) /.test(p.title)).code')"
check "the admin's record search finds one to correct" 200 "$(req a GET "/admin/records/career?q=$(enc 'Navy Hull')")" 'Navy Hull Maintenance Technician'

# --- The site's search lists a military career only when the query names it ------------------
# `military=named` is what the header's search sends; the map's search never sends it.
named() { req anon GET "/search?q=$(enc "$1")&types=occupations&military=named${2:-}"; }
titles() { j 'results.occupations.items.filter((c) => c.named).map((c) => c.name).join("|")'; }
OUT=$(named 'HT')
check "a code typed alone names its career"         200 "$OUT" '"named":true'
expect "the career, first, with its kind and code"  "Navy Hull Maintenance Technician|Navy rating · HT|true" "$(printf '%s' "$OUT" | j 'results.occupations.items[0].name + "|" + o.results.occupations.items[0].subtitle + "|" + o.results.occupations.items[0].named')"
expect "and it is counted with the civilian careers found" "$(( $(req anon GET '/search?q=HT&types=occupations' | j results.occupations.count) + 1 ))" "$(printf '%s' "$OUT" | j results.occupations.count)"
expect "the civilian careers follow it"             true "$(printf '%s' "$OUT" | j 'results.occupations.items.slice(1).every((c) => !c.named)')"
expect "in any letter case"                         "Navy Hull Maintenance Technician" "$(named 'ht' | titles)"
expect "an Army code"                               "Army UH-60 Helicopter Repairer/Aircrew Member" "$(named '15t' | titles)"
expect "an Air Force code"                          "Air Force Tactical Aircraft Maintenance" "$(named '2A3X3' | titles)"
expect "with a skill level where it has its X"      "Air Force Tactical Aircraft Maintenance" "$(named '2a353' | titles)"
expect "the service with a word of the title"       "Navy Hull Maintenance Technician" "$(named 'Navy hull' | titles)"
expect "and nothing else is listed for it"          1 "$(named 'Navy hull' | j results.occupations.items.length)"
expect "the service with the code"                  "Navy Hull Maintenance Technician" "$(named 'navy ht' | titles)"
expect "the employer's name with words of the title" "Navy Hull Maintenance Technician" "$(named 'U.S. Navy hull maintenance' | titles)"
expect "a code with its system's word"              "Army UH-60 Helicopter Repairer/Aircrew Member" "$(named 'MOS 15T' | titles)"
for PLAIN in 'welder' 'electronics technician' 'hull maintenance technician' 'navy' 'air force' 'technician' 'rating' 'navy yard'; do
  expect "“$PLAIN” names no military career"        "" "$(named "$PLAIN" | titles)"
done
expect "a plain title finds the civilian career first" "Electronics Technician" "$(named 'electronics technician' | j 'results.occupations.items[0].name')"
# Codes that are also a word, a state, a unit or another name of a skill: nothing by themselves.
for PLAIN in AM ET IT MT UT MM GM; do
  expect "“$PLAIN” alone names no military career"  "" "$(named "$PLAIN" | titles)"
done
expect "with the service, such a code names its career first" "Navy Aviation Structural Mechanic" "$(named 'navy am' | j 'results.occupations.items[0].name')"
expect "with its system's word alone it still names none" "" "$(named 'ET rating' | titles)"
for PLAIN in 'ic rating' 'pr rating' 'mm rating' 'ft rating' 'AM rating'; do
  expect "“$PLAIN” is said of other things"        "" "$(named "$PLAIN" | titles)"
done
expect "with the service and the word, only it"     "Navy Electronics Technician" "$(named 'navy ET rating' | titles)"
# One or two letters begin no word of a title: nothing on the way to "Air Force Plant 42" or "Army Corps of Engineers".
for PLAIN in 'navy a' 'navy m' 'army c' 'army 1' 'army 9' 'air force p' 'air force 2' 'navy and'; do
  expect "“$PLAIN” names no military career"        "" "$(named "$PLAIN" | titles)"
done
expect "three letters begin a word"                 "Navy Hull Maintenance Technician" "$(named 'navy hul' | titles)"
expect "a code as its holder writes it, with the skill level" "Army Wheeled Vehicle Mechanic" "$(named '91B10' | titles)"
expect "specialty is the Army's word too"           "Army UH-60 Helicopter Repairer/Aircrew Member" "$(named 'army specialty 15t' | titles)"
expect "a name typed whole is that career, first"   "Navy Electronics Technician" "$(named 'Navy Electronics Technician' | j 'results.occupations.items[0].name')"
# Naming a career lists it; it leads the results only when the query can be nothing else. Letters alone are also
# how companies' names begin (AO, FC, HT), and a service's word beside a word of a title is also a plant's.
leads() { j 'results.occupations.items.filter((c) => c.leads).map((c) => c.name).join("|")'; }
expect "a code with a digit leads"                  "Army UH-60 Helicopter Repairer/Aircrew Member" "$(named '15T' | leads)"
expect "so does a code beside its service"          "Navy Hull Maintenance Technician" "$(named 'navy ht' | leads)"
expect "and beside its system's word"               "Navy Hull Maintenance Technician" "$(named 'HT rating' | leads)"
for ALONE in HT AO FC RW ABE ABF AME STS; do
  expect "“$ALONE” alone is listed"                 1 "$(named "$ALONE" | j 'results.occupations.items.filter((c) => c.named).length')"
  expect "and leads nothing"                        "" "$(named "$ALONE" | leads)"
done
for ALONE in FCA MMA; do
  expect "“$ALONE” is an abbreviation in general use: nothing alone" "" "$(named "$ALONE" | titles)"
done
expect "a service and a word of a title is listed"  "Army Ammunition Specialist" "$(named 'army ammunition' | titles)"
expect "and leads nothing"                          "" "$(named 'army ammunition' | leads)"
# A service has no plants, so the search of manufacturers never finds it: its name, and nothing else, lists it.
service() { req anon GET "/search?q=$(enc "$1")&types=companies&military=named" | j 'results.companies.items.filter((c) => c.service).map((c) => c.name + " · " + c.subtitle).join("|")'; }
expect "a service's name lists the service"         "U.S. Navy · Military service" "$(service 'navy')"
expect "first among the companies"                  "true" "$(req anon GET '/search?q=navy&military=named' | j 'results.companies.items[0].service === true && o.results.companies.items[0].id.length === 36')"
expect "by the employer's name"                     "U.S. Navy · Military service" "$(service 'U.S. Navy')"
expect "by its letters"                             "U.S. Marine Corps · Military service" "$(service 'usmc')"
expect "two words"                                  "U.S. Air Force · Military service" "$(service 'Air Force')"
for PLAIN in 'nav' 'navy yard' 'navy hull' 'force' 'corps' 'marine'; do
  expect "“$PLAIN” lists no service"               "" "$(service "$PLAIN")"
done
expect "the map's search, which does not ask, lists no service" 0 "$(req anon GET '/search?q=navy&types=companies,factories,occupations,skills' | j 'results.companies.items.filter((c) => c.service || /^U\.S\. /.test(c.name)).length')"
OUT=$(named 'navy ratings')
expect "a service's ratings, when asked for by that word: the first five, and all of them counted" "5 5 $(( $(mil 'careers.filter((c)=>c.service==="navy").length') + $(req anon GET "/search?q=$(enc 'navy ratings')&types=occupations" | j results.occupations.count) ))" "$(printf '%s' "$OUT" | j 'results.occupations.items.filter((c) => c.named).length + " " + o.results.occupations.items.length + " " + o.results.occupations.count')"
expect "another service's word names none"          "" "$(named 'navy mos' | titles)"
expect "as production sends it, with the path the rewrite adds" "Navy Hull Maintenance Technician" "$(named 'HT' '&path=search' | titles)"
expect "the map's search, which does not ask, lists none for a code" 0 "$(req anon GET '/search?q=HT&types=companies,factories,occupations,skills' | j 'results.occupations.items.filter((c) => c.named || /^(Navy|Army|Air Force) /.test(c.name)).length')"
expect "nor for a service and a title"              0 "$(req anon GET "/search?q=$(enc 'navy hull')&types=companies,factories,occupations,skills" | j 'results.occupations.count')"
expect "nor for any other value of the parameter"   0 "$(req anon GET '/search?q=HT&types=occupations&military=1' | j 'results.occupations.items.filter((c) => c.named).length')"

# --- The list that was asked for military careers finds one by its code ------------------------
OUT=$(req anon GET '/occupations?military=1&search=ht&limit=5')
expect "by its whole code, first"                   "Navy Hull Maintenance Technician|HT" "$(printf '%s' "$OUT" | j 'data[0].title + "|" + o.data[0].code')"
expect "by the start of a code"                     "true" "$(req anon GET '/occupations?military=1&search=15&limit=100' | j 'data.length > 5 && o.data.every((c) => c.code.startsWith("15"))')"
expect "an Air Force code"                          "2A3X3" "$(req anon GET '/occupations?military=1&search=2a3x3' | j 'data[0].code')"
expect "one service's, by code"                     "HT" "$(req anon GET '/occupations?service=navy&search=HT' | j 'data[0].code')"
expect "the civilian list is not searched by code"  0 "$(req anon GET '/occupations?search=15t' | j 'data.filter((c) => c.service !== null).length')"
# The list reads what is typed as the header's rule does, and as its holder writes it: there every code counts.
door() { req anon GET "/occupations?military=1&limit=8&search=$(enc "$1")${2:-}" | j 'data.length + " " + (o.data[0] ? o.data[0].code : "")'; }
expect "an Air Force code with its skill level"     "1 2A3X3" "$(door '2A353')"
expect "another level"                              "1 2A3X3" "$(door '2a373')"
expect "an Army code with its system's word"        "1 15T" "$(door 'MOS 15T')"
expect "the word after it"                          "1 15T" "$(door '15T MOS')"
expect "a rating with its word"                     "1 HT" "$(door 'ht rating')"
expect "AFSC and the code"                          "1 2A3X3" "$(door 'AFSC 2A3X3')"
expect "the service's letters and the code"         "1 HT" "$(door 'usn ht')"
expect "an Army code with its skill level"          "1 91B" "$(door '91B10')"
expect "the service, a word of the title and the code" "1 91B" "$(door 'army mechanic 91b')"
expect "letters that are plain elsewhere are a code here" "AM" "$(req anon GET '/occupations?military=1&search=am' | j 'data[0].code')"
expect "and with their system's word"               "1 IC" "$(door 'ic rating')"
expect "the words beside a service are looked for among its careers" "true" "$(req anon GET "/occupations?military=1&search=$(enc 'air force maintenance')&limit=100" | j 'data.length > 3 && o.data.every((c) => c.service.key === "air-force")')"
expect "within one service, another's code is not found" "0 " "$(door 'usn ht' '&service=army')"
expect "the civilian list reads none of it"         0 "$(req anon GET "/occupations?search=$(enc 'MOS 15T')" | j 'data.filter((c) => c.service !== null).length')"
expect "each home says which services have a career in it" "$(sql "SELECT string_agg(x.slug || ':' || x.services, '|' ORDER BY x.position) FROM (SELECT d.slug, d.position, string_agg(DISTINCT c.service, ',' ORDER BY c.service) AS services FROM skill_domains d INNER JOIN occupations o ON o.home_domain = d.slug INNER JOIN companies c ON c.id = o.service_company_id GROUP BY d.slug, d.position) x")" "$(req anon GET /explore/facets | j 'militaryCareerDomains.map((d) => d.slug + ":" + d.services.join(",")).join("|")')"
expect "and no service is offered a home it has no career in" 0 "$(for KEY in navy army air-force; do for SLUG in $(req anon GET /explore/facets | j "militaryCareerDomains.filter((d) => d.services.includes('$KEY')).map((d) => d.slug).join(' ')"); do [ "$(req anon GET "/occupations?service=$KEY&domain=$SLUG&limit=1" | j total)" = 0 ] && echo empty; done; done | wc -l | tr -d ' ')"
expect "the homes the military list is narrowed by" "$(sql "SELECT string_agg(d.slug, '|' ORDER BY d.position) FROM skill_domains d WHERE EXISTS (SELECT 1 FROM occupations o WHERE o.home_domain = d.slug AND o.service_company_id IS NOT NULL)")" "$(req anon GET /explore/facets | j 'militaryCareerDomains.map((d) => d.slug).join("|")')"

# --- Reach, computed from the two paths --------------------------------------------------------
# A hand count: the skills of a civilian career's path that are on a military career's, of how many the path has.
shared() { sql "SELECT COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM occupation_skills m WHERE m.occupation_id = (SELECT id FROM occupations WHERE title = '$1') AND m.skill_id = c.skill_id)) || ' of ' || COUNT(*) FROM occupation_skills c WHERE c.occupation_id = (SELECT id FROM occupations WHERE title = '$2')"; }
expect "the hand count for MIG Welder"              "10 of 14" "$(shared 'Navy Hull Maintenance Technician' 'MIG Welder')"
expect "for Metal Fabricator"                       "13 of 19" "$(shared 'Navy Hull Maintenance Technician' 'Metal Fabricator')"
expect "for Welder"                                 "12 of 19" "$(shared 'Navy Hull Maintenance Technician' 'Welder')"
OUT=$(req anon GET /occupations/$HT)
expect "a military career's civilian careers within reach, the most covered first" "MIG Welder 10 of 14|Metal Fabricator 13 of 19|Welder 12 of 19" "$(printf '%s' "$OUT" | j 'withinReach.slice(0, 3).map((c) => c.title + " " + c.held + " of " + c.total).join("|")')"
# The floor: a third of the civilian career's path, which is written and has five skills or more.
FLOOR="WITH pairs AS (SELECT c.id, (SELECT COUNT(*) FROM occupation_skills x WHERE x.occupation_id = c.id) AS total, (SELECT COUNT(*) FROM occupation_skills x INNER JOIN occupation_skills y ON y.skill_id = x.skill_id AND y.occupation_id = '$HT' WHERE x.occupation_id = c.id) AS held FROM occupations c WHERE c.service_company_id IS NULL AND c.path_status IS NOT NULL) SELECT COUNT(*) FROM pairs WHERE total >= 5 AND held * 3 >= total"
expect "every career of the floor, and no other"    "$(sql "$FLOOR")" "$(printf '%s' "$OUT" | j withinReach.length)"
expect "each holds a third or more of a path of five or more" true "$(printf '%s' "$OUT" | j 'withinReach.every((c) => c.total >= 5 && c.held * 3 >= c.total)')"
expect "in order of the share held"                 true "$(printf '%s' "$OUT" | j 'withinReach.every((c, i, all) => i === 0 || all[i - 1].held * c.total >= c.held * all[i - 1].total)')"
expect "each names the skills missing, all of them" true "$(printf '%s' "$OUT" | j 'withinReach.every((c) => c.missing.length === c.total - c.held && c.missing.every((s, i, all) => s.id && s.name && (i === 0 || all[i - 1].level <= s.level)))')"
# In the order Welder's own page draws them: the route's (level, then the taxonomy's order), not the alphabet.
expect "Welder's missing skills are the ones the rating's path lacks, in Welder's route order" "$(sql "SELECT string_agg(s.name, '|' ORDER BY s.level NULLS LAST, sd.position NULLS LAST, sg.position NULLS LAST, s.group_position NULLS LAST, s.name) FROM occupation_skills c INNER JOIN skills s ON s.id = c.skill_id LEFT JOIN skill_groups sg ON sg.slug = s.group_slug LEFT JOIN skill_domains sd ON sd.slug = sg.domain_slug WHERE c.occupation_id = (SELECT id FROM occupations WHERE title = 'Welder') AND NOT EXISTS (SELECT 1 FROM occupation_skills m WHERE m.occupation_id = '$HT' AND m.skill_id = c.skill_id)")" "$(printf '%s' "$OUT" | j 'withinReach.find((c) => c.title === "Welder").missing.map((s) => s.name).join("|")')"
MISSING=$(printf '%s' "$OUT" | j 'withinReach.find((c) => c.title === "Welder").missing.map((s) => s.id).join(",")')
expect "which is the order those skills stand in on Welder's own page" "$(req anon GET /occupations/$(id_of 'Welder') | j "skills.filter((s) => '$MISSING'.split(',').includes(s.id)).map((s) => s.name).join('|')")" "$(printf '%s' "$OUT" | j 'withinReach.find((c) => c.title === "Welder").missing.map((s) => s.name).join("|")')"
expect "none of them a military career"             0 "$(sql "SELECT COUNT(*) FROM occupations WHERE service_company_id IS NOT NULL AND id IN ($(printf '%s' "$OUT" | j 'withinReach.map((c) => "\x27" + c.id + "\x27").join(",")'))")"
# What the page's flow draws: the skills that carry, by id, and the industries each career is typical of.
expect "each names the skills that carry, one for each held, none of them missing too" true "$(printf '%s' "$OUT" | j 'withinReach.every((c) => c.shared.length === c.held && new Set(c.shared).size === c.held && c.shared.every((id) => !c.missing.some((s) => s.id === id)))')"
expect "every one of them on the rating's own path" true "$(printf '%s' "$OUT" | j 'withinReach.every((c) => c.shared.every((id) => o.skills.some((s) => s.id === id)))')"
expect "Welder's are the skills the two paths share, in the route's order" "$(sql "SELECT string_agg(s.id::text, '|' ORDER BY s.level NULLS LAST, sd.position NULLS LAST, sg.position NULLS LAST, s.group_position NULLS LAST, s.name) FROM occupation_skills c INNER JOIN skills s ON s.id = c.skill_id LEFT JOIN skill_groups sg ON sg.slug = s.group_slug LEFT JOIN skill_domains sd ON sd.slug = sg.domain_slug WHERE c.occupation_id = (SELECT id FROM occupations WHERE title = 'Welder') AND EXISTS (SELECT 1 FROM occupation_skills m WHERE m.occupation_id = '$HT' AND m.skill_id = c.skill_id)")" "$(printf '%s' "$OUT" | j 'withinReach.find((c) => c.title === "Welder").shared.join("|")')"
expect "Welder's industries are the ones it is typical of, in the list's order" "$(sql "SELECT string_agg(industry, '|' ORDER BY rank, industry) FROM industry_occupations WHERE occupation_id = (SELECT id FROM occupations WHERE title = 'Welder') AND NOT common")" "$(printf '%s' "$OUT" | j 'withinReach.find((c) => c.title === "Welder").industries.join("|")')"
expect "and it is not found in every industry"      false "$(printf '%s' "$OUT" | j 'withinReach.find((c) => c.title === "Welder").everywhere')"
expect "a career found in every industry names none of its own" true "$(printf '%s' "$OUT" | j 'withinReach.every((c) => typeof c.everywhere === "boolean" && Array.isArray(c.industries) && (!c.everywhere || c.industries.length === 0))')"
EVERYWHERE=$(sql "SELECT COUNT(*) FROM occupations o WHERE o.id IN ($(printf '%s' "$OUT" | j 'withinReach.map((c) => "\x27" + c.id + "\x27").join(",")')) AND EXISTS (SELECT 1 FROM industry_occupations io WHERE io.occupation_id = o.id AND io.common) AND NOT EXISTS (SELECT 1 FROM industry_occupations io WHERE io.occupation_id = o.id AND NOT io.common)")
expect "as many are found everywhere as the lists say" "$EVERYWHERE" "$(printf '%s' "$OUT" | j 'withinReach.filter((c) => c.everywhere).length')"
expect "and it is reached by none"                  0 "$(printf '%s' "$OUT" | j reachedBy.length)"
WELDER=$(id_of 'Welder')
OUT=$(req anon GET /occupations/$WELDER)
expect "a civilian career's military careers that reach it" "Navy Hull Maintenance Technician|Navy rating|HT|12 of 19" "$(printf '%s' "$OUT" | j 'reachedBy.filter((c) => c.code === "HT").map((c) => c.title + "|" + c.kind + "|" + c.code + "|" + c.held + " of " + c.total).join("")')"
expect "every one of the floor"                     "$(sql "WITH pairs AS (SELECT m.id, (SELECT COUNT(*) FROM occupation_skills x WHERE x.occupation_id = '$WELDER') AS total, (SELECT COUNT(*) FROM occupation_skills x INNER JOIN occupation_skills y ON y.skill_id = x.skill_id AND y.occupation_id = m.id WHERE x.occupation_id = '$WELDER') AS held FROM occupations m WHERE m.service_company_id IS NOT NULL) SELECT COUNT(*) FROM pairs WHERE total >= 5 AND held * 3 >= total")" "$(printf '%s' "$OUT" | j reachedBy.length)"
expect "the most covering first, each a military career with its kind and code" true "$(printf '%s' "$OUT" | j 'reachedBy.length > 0 && o.reachedBy.every((c, i, all) => c.kind && c.code && c.total === 19 && c.held * 3 >= c.total && (i === 0 || all[i - 1].held >= c.held))')"
expect "and nothing within its own reach is listed" 0 "$(printf '%s' "$OUT" | j withinReach.length)"
NONE=$(sql "SELECT c.id FROM occupations c WHERE c.service_company_id IS NULL AND c.path_status IS NOT NULL AND NOT EXISTS (SELECT 1 FROM occupations m WHERE m.service_company_id IS NOT NULL AND 3 * (SELECT COUNT(*) FROM occupation_skills x INNER JOIN occupation_skills y ON y.skill_id = x.skill_id AND y.occupation_id = m.id WHERE x.occupation_id = c.id) >= (SELECT COUNT(*) FROM occupation_skills x WHERE x.occupation_id = c.id)) ORDER BY c.title LIMIT 1")
expect "a civilian career no military career reaches lists none" 0 "$(req anon GET /occupations/$NONE | j reachedBy.length)"

# --- A skill's military careers, and a service's ------------------------------------------------
OUT=$(req anon GET /skills/$TORPEDO)
expect "a skill only military careers use lists them" "Navy Torpedoman's Mate|Navy rating|TM" "$(printf '%s' "$OUT" | j 'militaryOccupations.map((c) => c.title + "|" + c.kind + "|" + c.code).join(";")')"
expect "apart from its careers, of which it has none" 0 "$(printf '%s' "$OUT" | j occupations.length)"
expect "a shared skill lists its military careers too" "$(sql "SELECT COUNT(*) FROM occupation_skills os INNER JOIN occupations o ON o.id = os.occupation_id WHERE os.skill_id = '$PRINT' AND o.service_company_id IS NOT NULL")" "$(req anon GET /skills/$PRINT | j militaryOccupations.length)"
expect "the taxonomy says how many military careers use a skill" "0 1" "$(req anon GET /skills/taxonomy | j "domains.flatMap((d) => d.groups).flatMap((g) => g.skills).filter((s) => s.id === '$TORPEDO').map((s) => s.careers + ' ' + s.militaryCareers).join('')")"
OUT=$(req anon GET /companies/us-navy)
expect "a service's page lists its careers"         "$(mil 'careers.filter((c)=>c.service==="navy").length')" "$(printf '%s' "$OUT" | j serviceCareers.length)"
expect "each with its code, its home and its path"  true "$(printf '%s' "$OUT" | j 'serviceCareers.every((c) => /^Navy /.test(c.title) && c.kind === "Navy rating" && c.code && c.home && c.skillCount >= 5)')"
expect "the Marine Corps has none to list"          "marine-corps 0" "$(req anon GET /companies/us-marine-corps | j 'service + " " + o.serviceCareers.length')"
expect "a company that is not a service lists none" 0 "$(req anon GET "/companies/$(sql "SELECT id FROM companies WHERE service IS NULL ORDER BY name LIMIT 1")" | j serviceCareers.length)"

# --- Profile's door: a military career's skills marked held in one write, and its Undo ---------
check "sign-up for the door"                        201 "$(req d POST /auth/sign-up "{\"email\":\"door-$RUN@military.test\",\"name\":\"Dee Door\",\"purpose\":\"work\",$PW}")"
MIG=$(sql "SELECT s.id FROM skills s INNER JOIN occupation_skills os ON os.skill_id = s.id WHERE os.occupation_id = '$HT' AND s.name = 'MIG Welding'")
TIG=$(sql "SELECT s.id FROM skills s INNER JOIN occupation_skills os ON os.skill_id = s.id WHERE os.occupation_id = '$HT' AND s.name = 'TIG Welding'")
OTHER=$(sql "SELECT id FROM skills WHERE id NOT IN (SELECT skill_id FROM occupation_skills WHERE occupation_id = '$HT') ORDER BY name LIMIT 1")
req d PUT /me/skills/$MIG '{"status":"held"}' > /dev/null
req d PUT /me/skills/$TIG '{"status":"learning"}' > /dev/null
req d PUT /me/skills/$OTHER '{"status":"held"}' > /dev/null
PATH_SIZE=$(mil 'path("Navy Hull Maintenance Technician").skills.length')
check "signed out, nothing is marked"               401 "$(req anon POST /me/careers/$HT/held)"
check "a civilian career is not marked this way"    400 "$(req d POST /me/careers/$WELDER/held)" 'Only a military career'
check "nor a career that does not exist"            404 "$(req d POST /me/careers/00000000-0000-4000-8000-000000000000/held)"
expect "and nothing was marked by those"            3 "$(req d GET /me/skills | j skills.length)"
DONE=$(req d POST /me/careers/$HT/held)
check "I have done this"                            200 "$DONE" '"added"'
expect "it added the skills that were not on the list, and raised the one being learned" "$((PATH_SIZE - 2)) 1 $PATH_SIZE" "$(printf '%s' "$DONE" | j 'added.length + " " + o.raised.length + " " + o.total')"
expect "the raised one is the skill that was being learned" "$TIG" "$(printf '%s' "$DONE" | j 'raised[0]')"
expect "a skill held before is in neither list"     false "$(printf '%s' "$DONE" | j "added.concat(o.raised).includes('$MIG')")"
expect "every skill of the path is held now"        "$PATH_SIZE" "$(sql "SELECT COUNT(*) FROM user_skills us INNER JOIN users u ON u.id = us.user_id WHERE u.email = 'door-$RUN@military.test' AND us.status = 'held' AND us.skill_id IN (SELECT skill_id FROM occupation_skills WHERE occupation_id = '$HT')")"
expect "nothing is kept about which career it was"  0 "$(sql "SELECT (SELECT COUNT(*) FROM user_goals g INNER JOIN users u ON u.id = g.user_id WHERE u.email = 'door-$RUN@military.test') + (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'users' AND column_name ~ 'military|service|rating')")"
OUT=$(req d GET /me/careers/reach)
expect "what follows is civilian careers within reach" "true 0" "$(printf '%s' "$OUT" | j 'careers.length > 0') $(sql "SELECT COUNT(*) FROM occupations WHERE service_company_id IS NOT NULL AND id IN ($(printf '%s' "$OUT" | j 'careers.map((c) => "\x27" + c.id + "\x27").join(",")'))")"
expect "Welder among them, with the page's own figure" "12 of 19" "$(printf '%s' "$OUT" | j 'careers.filter((c) => c.title === "Welder").map((c) => c.held + " of " + c.total).join("")')"
expect "each says how many jobs are open for it"    true "$(printf '%s' "$OUT" | j 'careers.every((c) => Number.isInteger(c.openJobs) && c.openJobs >= 0)')"
expect "and its count is the Jobs list's"           "$(req anon GET "/jobs?occupationId=$WELDER&limit=1" | j total)" "$(printf '%s' "$OUT" | j 'careers.find((c) => c.title === "Welder").openJobs')"
check "the rating is still no goal"                 400 "$(req d PUT /me/goals/$HT)" 'cannot be set as a goal'
expect "and no goal offers one"                     0 "$(req d GET /me/goals | j goals.length)"
expect "suggested skills come from civilian careers" 0 "$(req d GET '/me/skills/suggested?limit=30' | j 'skills.filter((s) => /^(Navy|Army|Air Force) /.test(s.career)).length')"
AGAIN=$(req d POST /me/careers/$HT/held)
expect "marked again, it changes nothing"           "0 0 null" "$(printf '%s' "$AGAIN" | j 'added.length + " " + o.raised.length + " " + o.at')"
UNDO=$(printf '%s' "$DONE" | sed '$d' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s);console.log(JSON.stringify({at:o.at,added:o.added,raised:o.raised}))})")
# A list that names skills the write did not change: one held before, on the path and off it.
FORGED=$(printf '%s' "$UNDO" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s);console.log(JSON.stringify({at:o.at,added:['$MIG','$OTHER'],raised:[]}))})")
check "an Undo that names skills held before"       200 "$(req d POST /me/careers/$HT/held/undo "$FORGED")" '"removed":0'
check "an Undo without the moment of the write"     400 "$(req d POST /me/careers/$HT/held/undo '{"added":[],"raised":[]}')"
check "an Undo with a list that is not ids"         400 "$(req d POST /me/careers/$HT/held/undo '{"at":"2026-01-01 00:00:00","added":["x"],"raised":[]}')"
check "an Undo with a moment that is none"          400 "$(req d POST /me/careers/$HT/held/undo "{\"at\":\"2026-13-45 99:99:99\",\"added\":[\"$MIG\"],\"raised\":[]}")" 'at is the moment'
check "Undo"                                        200 "$(req d POST /me/careers/$HT/held/undo "$UNDO")" "\"removed\":$((PATH_SIZE - 2)),\"lowered\":1"
expect "takes back exactly what the tap added: the three from before are left" "held|learning|held" "$(req d GET /me/skills | j "skills.length === 3 && ['$MIG', '$TIG', '$OTHER'].map((id) => o.skills.find((s) => s.skillId === id).status).join('|')")"
check "a second Undo finds nothing to take back"    200 "$(req d POST /me/careers/$HT/held/undo "$UNDO")" '"removed":0,"lowered":0'
# A skill the person marks again after the tap is theirs: Undo leaves it.
DONE=$(req d POST /me/careers/$HT/held)
KEPT=$(printf '%s' "$DONE" | j 'added[0]')
req d PUT /me/skills/$KEPT '{"status":"held"}' > /dev/null
UNDO=$(printf '%s' "$DONE" | sed '$d' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s);console.log(JSON.stringify({at:o.at,added:o.added,raised:o.raised}))})")
check "Undo after one was marked again by hand"     200 "$(req d POST /me/careers/$HT/held/undo "$UNDO")" "\"removed\":$((PATH_SIZE - 3)),\"lowered\":1"
expect "leaves that one held"                       "held 4" "$(req d GET /me/skills | j "skills.find((s) => s.skillId === '$KEPT').status + ' ' + o.skills.length")"
# A make marked on a skill the tap added is the person's own hand on it too: Undo leaves the skill, with its make.
MADE=$(sql "SELECT o.id || ' ' || sm.skill_id || ' ' || sm.id FROM skill_makes sm INNER JOIN occupation_skills os ON os.skill_id = sm.skill_id INNER JOIN occupations o ON o.id = os.occupation_id WHERE o.service_company_id IS NOT NULL AND sm.skill_id NOT IN (SELECT us.skill_id FROM user_skills us INNER JOIN users u ON u.id = us.user_id WHERE u.email = 'door-$RUN@military.test') ORDER BY o.title, sm.name LIMIT 1")
MAKE_CAREER=${MADE%% *}; MAKE=${MADE##* }; MAKE_SKILL=${MADE#* }; MAKE_SKILL=${MAKE_SKILL% *}
DONE=$(req d POST /me/careers/$MAKE_CAREER/held)
ADDED=$(printf '%s' "$DONE" | j added.length)
expect "the tap added the skill that has makes"     true "$(printf '%s' "$DONE" | j "added.includes('$MAKE_SKILL')")"
check "a make is marked on it"                      200 "$(req d PUT /me/skills/$MAKE_SKILL/makes "{\"makes\":[\"$MAKE\"]}")"
UNDO=$(printf '%s' "$DONE" | sed '$d' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s);console.log(JSON.stringify({at:o.at,added:o.added,raised:o.raised}))})")
check "Undo after a make was marked"                200 "$(req d POST /me/careers/$MAKE_CAREER/held/undo "$UNDO")" "\"removed\":$((ADDED - 1)),"
expect "leaves that skill held, with its make"      "held $MAKE" "$(req d GET /me/skills | j "skills.filter((s) => s.skillId === '$MAKE_SKILL').map((s) => s.status + ' ' + (s.makes || []).map((m) => m.id || m).join(','))[0]")"

# --- The loader, on rows as production might hold them --------------------------------
cat > "$D/employers.json" <<'JSON'
{ "companies": [
  { "name": "E2E Mil Navy", "service": "navy", "slug": "e2e-mil-navy", "domain": "navy.e2e.test", "description": "A fixture.", "headquarters": { "city": "Arlington", "state": "VA", "country": "US" } },
  { "name": "E2E Mil Army", "service": "army", "slug": "e2e-mil-army", "domain": "army.e2e.test", "description": "A fixture.", "headquarters": { "city": "Arlington", "state": "VA", "country": "US" } },
  { "name": "E2E Mil Air Force", "service": "air-force", "slug": "e2e-mil-air-force", "domain": "af.e2e.test", "description": "A fixture.", "headquarters": { "city": "Arlington", "state": "VA", "country": "US" } },
  { "name": "E2E Mil Marine Corps", "service": "marine-corps", "slug": "e2e-mil-marine-corps", "domain": "marines.e2e.test", "description": "A fixture.", "headquarters": { "city": "Arlington", "state": "VA", "country": "US" } } ] }
JSON
cat > "$D/build.mjs" <<'JS'
// build.mjs <repository root> <employers file> <output>: the builder's own functions over a fixture.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const [root, input, output] = process.argv.slice(2);
const { employerProblems, employersSql } = await import(pathToFileURL(`${root}/scripts/build-military-sql.mjs`).href);
const file = JSON.parse(readFileSync(input, 'utf8'));
const problems = employerProblems(file);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
writeFileSync(output, employersSql(file, 'a fixture'));
JS
node "$D/build.mjs" "$ROOT" "$D/employers.json" "$D/migration.sql" > "$D/build.log" 2>&1
expect "the builder turns an employers file into a migration" 0 "$?"

cat > "$D/read.sql" <<'SQL'
SELECT :'at' || ' state', md5(string_agg(c::text, '~' ORDER BY c.id)) FROM companies c WHERE c.name ILIKE 'E2E Mil %' OR c.service IS NOT NULL;
SELECT :'at' || ' services', string_agg(c.service || '=' || c.name || ' (' || COALESCE(c.slug, 'no slug') || ', ' || COALESCE(c.domain, 'no domain') || ', ' || COALESCE(c.headquarters_city, 'no city') || ', ' || left(COALESCE(c.description, 'no description'), 12) || ')', '; ' ORDER BY c.service)
  FROM companies c WHERE c.service IS NOT NULL;
SELECT :'at' || ' look', string_agg(action || ': ' || detail, ' / ' ORDER BY id) FROM load_log WHERE load = 'military-employers' AND id > :mark AND look;
SELECT :'at' || ' quiet', string_agg(action || ': ' || detail, ' / ' ORDER BY id) FROM load_log WHERE load = 'military-employers' AND id > :mark AND NOT look;
SQL
cat > "$D/run.sql" <<SQL
BEGIN;
-- The real services stand aside for the fixture's: a service's key is one company's.
UPDATE companies SET service = NULL WHERE service IS NOT NULL;
-- The Navy is stored already, in other letters, with a plant and a description of its own.
INSERT INTO companies (name, description) VALUES ('e2e mil NAVY', 'Stored before.');
INSERT INTO factories (company_id, name, state, latitude, longitude) SELECT id, 'E2E Mil Yard', 'VA', '36.8', '-76.3' FROM companies WHERE name = 'e2e mil NAVY';
-- The Army is stored as the service already, under another name.
INSERT INTO companies (name, service) VALUES ('E2E Mil Department of the Army', 'army');
-- A company whose name only resembles the Marine Corps', and one that has the slug the Air Force would take.
INSERT INTO companies (name) VALUES ('E2E Mil Marine');
INSERT INTO companies (name, slug) VALUES ('E2E Mil Other', 'e2e-mil-air-force');
SELECT COALESCE(MAX(id), 0) AS mark FROM load_log \\gset

\\i $D/migration.sql
\\set at first
\\i $D/read.sql
SELECT 'others', string_agg(name || '=' || COALESCE(service, 'none'), '; ' ORDER BY name) FROM companies WHERE name IN ('E2E Mil Marine', 'E2E Mil Other');
SELECT 'plants', COUNT(*) FROM factories f INNER JOIN companies c ON c.id = f.company_id WHERE c.name ILIKE 'E2E Mil %';

SELECT COALESCE(MAX(id), 0) AS mark FROM load_log \\gset
\\i $D/migration.sql
\\set at second
\\i $D/read.sql

-- A company that carries another service under one of the file's names: neither is changed.
UPDATE companies SET service = NULL WHERE name = 'E2E Mil Marine Corps';
UPDATE companies SET service = NULL WHERE name = 'E2E Mil Air Force';
UPDATE companies SET service = 'marine-corps' WHERE name = 'E2E Mil Air Force';
SELECT COALESCE(MAX(id), 0) AS mark FROM load_log \\gset
\\i $D/migration.sql
\\set at third
\\i $D/read.sql
ROLLBACK;
SQL
psql "$DB" -qtA -v ON_ERROR_STOP=1 -f "$D/run.sql" > "$D/run.out" 2> "$D/run.err"
expect "the migration applies, three times over"   0 "$?"
got() { grep "^$1|" "$D/run.out" | head -n1 | cut -d'|' -f2-; }
expect "the services after the first run" \
  "air-force=E2E Mil Air Force (no slug, af.e2e.test, Arlington, A fixture.); army=E2E Mil Department of the Army (e2e-mil-army, army.e2e.test, Arlington, A fixture.); marine-corps=E2E Mil Marine Corps (e2e-mil-marine-corps, marines.e2e.test, Arlington, A fixture.); navy=e2e mil NAVY (e2e-mil-navy, navy.e2e.test, Arlington, Stored befor)" \
  "$(got 'first services')"
expect "what a person is asked to read" \
  "found: e2e mil NAVY was stored already, with 1 plants, which a service does not have. It is now the service \"navy\"; filled: slug, domain, headquarters" \
  "$(got 'first look')"
expect "what it did quietly" \
  "kept: E2E Mil Department of the Army is the service \"army\" (the file calls it E2E Mil Army; the stored name is kept); filled: slug, domain, description, headquarters / created: E2E Mil Air Force: no company has that name. Created as the service \"air-force\", with no plants / created: E2E Mil Marine Corps: no company has that name. Created as the service \"marine-corps\", with no plants / summary: 4 services of the file: 2 created, 1 found by name, 1 already stored as the service, 0 not set; companies that are a service: 4" \
  "$(got 'first quiet')"
expect "a name that only resembles a service's is left alone, and so is the company with its slug" "E2E Mil Marine=none; E2E Mil Other=none" "$(got others)"
expect "no plant was added or moved"               1 "$(got plants)"
expect "a second run changes nothing"              "$(got 'first state')" "$(got 'second state')"
expect "and asks nobody to look again"             "" "$(got 'second look')"
expect "its summary"                               "kept: E2E Mil Department of the Army is the service \"army\" (the file calls it E2E Mil Army; the stored name is kept) / summary: 4 services of the file: 0 created, 0 found by name, 4 already stored as the service, 0 not set; companies that are a service: 4" "$(got 'second quiet')"
expect "a name that carries another service is not given a second" \
  "not set: E2E Mil Air Force is stored as the service \"marine-corps\". It was not made \"air-force\", and no company is" \
  "$(got 'third look')"
expect "and no company is created beside it"       "3 already stored as the service, 1 not set; companies that are a service: 3" "$(got 'third quiet' | sed 's/.*found by name, //')"
expect "nothing of the fixture is left"            0 "$(sql "SELECT COUNT(*) FROM companies WHERE name ILIKE 'E2E Mil %'")"

# --- A description the file wrote before is brought up to date; one a person wrote is kept ---------
cat > "$D/employers-2.json" <<'JSON'
{ "companies": [
  { "name": "E2E Mil Navy", "service": "navy", "slug": "e2e-mil-navy", "domain": "navy.e2e.test", "description": "Newer words.", "descriptionWas": ["Older words."], "headquarters": { "city": "Arlington", "state": "VA", "country": "US" } },
  { "name": "E2E Mil Army", "service": "army", "slug": "e2e-mil-army", "domain": "army.e2e.test", "description": "Newer words.", "descriptionWas": ["Older words."], "headquarters": { "city": "Arlington", "state": "VA", "country": "US" } },
  { "name": "E2E Mil Air Force", "service": "air-force", "slug": "e2e-mil-air-force", "domain": "af.e2e.test", "description": "Newer words.", "descriptionWas": ["Oldest words.", "Older words."], "headquarters": { "city": "Arlington", "state": "VA", "country": "US" }, "sources": ["A fixture: not loaded."] },
  { "name": "E2E Mil Marine Corps", "service": "marine-corps", "slug": "e2e-mil-marine-corps", "domain": "marines.e2e.test", "description": "Newer words.", "descriptionWas": ["Older words."], "headquarters": { "city": "Arlington", "state": "VA", "country": "US" } } ] }
JSON
node "$D/build.mjs" "$ROOT" "$D/employers-2.json" "$D/migration-2.sql" > "$D/build-2.log" 2>&1
expect "the builder takes a file's earlier descriptions" 0 "$?"
expect "and loads no source"                       0 "$(grep -c 'A fixture: not loaded' "$D/migration-2.sql")"
cat > "$D/read-2.sql" <<'SQL'
SELECT :'at' || ' state', md5(string_agg(c::text, '~' ORDER BY c.id)) FROM companies c WHERE c.service IS NOT NULL;
SELECT :'at' || ' said', string_agg(c.service || '=' || COALESCE(c.description, 'none'), '; ' ORDER BY c.service) FROM companies c WHERE c.service IS NOT NULL;
SELECT :'at' || ' quiet', string_agg(action || ': ' || detail, ' / ' ORDER BY id) FROM load_log WHERE load = 'military-employers' AND id > :mark AND NOT look;
SELECT :'at' || ' look', COUNT(*) FROM load_log WHERE load = 'military-employers' AND id > :mark AND look;
SQL
cat > "$D/run-2.sql" <<SQL
BEGIN;
UPDATE companies SET service = NULL WHERE service IS NOT NULL;
-- The Navy still says what the file said before. The Army's was written by a person. The Air Force's is an
-- earlier one of the file's, with a space after it. The Marine Corps is not stored.
INSERT INTO companies (name, service, slug, domain, description, headquarters_city, headquarters_state, headquarters_country) VALUES
  ('E2E Mil Navy', 'navy', 'e2e-mil-navy', 'navy.e2e.test', 'Older words.', 'Arlington', 'VA', 'US'),
  ('E2E Mil Army', 'army', 'e2e-mil-army', 'army.e2e.test', 'Written by a person.', 'Arlington', 'VA', 'US'),
  ('E2E Mil Air Force', 'air-force', 'e2e-mil-air-force', 'af.e2e.test', 'Oldest words. ', 'Arlington', 'VA', 'US');
SELECT COALESCE(MAX(id), 0) AS mark FROM load_log \\gset
\\i $D/migration-2.sql
\\set at first
\\i $D/read-2.sql
SELECT COALESCE(MAX(id), 0) AS mark FROM load_log \\gset
\\i $D/migration-2.sql
\\set at second
\\i $D/read-2.sql
ROLLBACK;
SQL
psql "$DB" -qtA -v ON_ERROR_STOP=1 -f "$D/run-2.sql" > "$D/run-2.out" 2> "$D/run-2.err"
expect "the migration applies, twice"              0 "$?"
got2() { grep "^$1|" "$D/run-2.out" | head -n1 | cut -d'|' -f2-; }
expect "the file's earlier words are replaced, a person's are kept" \
  "air-force=Newer words.; army=Written by a person.; marine-corps=Newer words.; navy=Newer words." \
  "$(got2 'first said')"
expect "and the log says which" \
  "kept: E2E Mil Navy is the service \"navy\"; description: the file's earlier one, replaced by the file's / kept: E2E Mil Air Force is the service \"air-force\"; description: the file's earlier one, replaced by the file's / created: E2E Mil Marine Corps: no company has that name. Created as the service \"marine-corps\", with no plants / summary: 4 services of the file: 1 created, 0 found by name, 3 already stored as the service, 0 not set; companies that are a service: 4" \
  "$(got2 'first quiet')"
expect "with nothing to look at"                   0 "$(got2 'first look')"
expect "a second run changes nothing"              "$(got2 'first state')" "$(got2 'second state')"
expect "and says only its summary"                 "summary: 4 services of the file: 0 created, 0 found by name, 4 already stored as the service, 0 not set; companies that are a service: 4" "$(got2 'second quiet')"
expect "nothing of this fixture is left"           0 "$(sql "SELECT COUNT(*) FROM companies WHERE name ILIKE 'E2E Mil %'")"

# --- The careers' and the paths' loaders, on rows as production might hold them ---------------
# Five careers. Alpha is new. Beta is stored with its code under another title. Gamma's title is a
# civilian career's. Delta's service is not stored. Epsilon is stored, with a path a person approved.
cat > "$D/mil-careers.json" <<'JSON'
{ "careers": [
  { "title": "Navy E2E Mil Alpha", "officialTitle": "E2E Mil Alpha", "service": "navy", "code": "E2EA", "codeSystem": "navy-rating", "home": "fabrication", "what": "A fixture.", "was": ["Navy E2EA", "E2E Mil Taken Name", "E2E Mil Civilian"] },
  { "title": "Navy E2E Mil Beta", "officialTitle": "E2E Mil Beta", "service": "navy", "code": "E2EB", "codeSystem": "navy-rating", "home": "fabrication", "what": "A fixture.", "was": [] },
  { "title": "Army E2E Mil Gamma", "officialTitle": "E2E Mil Gamma", "service": "army", "code": "E2EG", "codeSystem": "army-mos", "home": "fabrication", "what": "A fixture.", "was": [] },
  { "title": "Air Force E2E Mil Delta", "officialTitle": "E2E Mil Delta", "service": "air-force", "code": "E2ED", "codeSystem": "afsc", "home": "fabrication", "what": "A fixture.", "was": [] },
  { "title": "Army E2E Mil Epsilon", "officialTitle": "E2E Mil Epsilon", "service": "army", "code": "E2EE", "codeSystem": "army-mos", "home": "fabrication", "what": "A fixture.", "was": [] } ] }
JSON
cat > "$D/mil-paths.json" <<'JSON'
{ "careers": [
  { "title": "Navy E2E Mil Alpha", "basis": "A fixture.", "skills": ["Stick Welding", "MIG Welding", "TIG Welding", "Weld Joint Fit-Up", "Blueprint Reading"] },
  { "title": "Navy E2E Mil Beta", "basis": "A fixture.", "skills": ["Stick Welding", "MIG Welding", "TIG Welding", "Weld Joint Fit-Up", "Shop Math"] },
  { "title": "Army E2E Mil Gamma", "basis": "A fixture.", "skills": ["Stick Welding", "MIG Welding", "TIG Welding", "Weld Joint Fit-Up", "Shop Math"] },
  { "title": "Air Force E2E Mil Delta", "basis": "A fixture.", "skills": ["Stick Welding", "MIG Welding", "TIG Welding", "Weld Joint Fit-Up", "Shop Math"] },
  { "title": "Army E2E Mil Epsilon", "basis": "A fixture.", "skills": ["Stick Welding", "MIG Welding", "TIG Welding", "Weld Joint Fit-Up", "Shop Math"] } ] }
JSON
cat > "$D/build2.mjs" <<'JS'
// build2.mjs <repository root> <careers file> <paths file> <careers out> <paths out>: the builder's own checks and SQL over a fixture.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const [root, careersFile, pathsFile, careersOut, pathsOut] = process.argv.slice(2);
const builder = await import(pathToFileURL(`${root}/scripts/build-military-sql.mjs`).href);
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const data = (file) => read(`${root}/data/${file}`);
const careers = read(careersFile);
const paths = read(pathsFile);
const problems = [
  ...builder.careerProblems(careers, data('skills/taxonomy.json'), data('careers/military/employers.json'), builder.civilianNames(data('careers/catalogue.json'), data('careers/aliases.json'))),
  ...builder.militaryPathProblems(paths, careers, data('skills/catalogue.json'), data('skills/taxonomy.json')),
];
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
writeFileSync(careersOut, builder.careersSql(careers, 'a fixture'));
writeFileSync(pathsOut, builder.militaryPathsSql(paths, 'a fixture'));
JS
node "$D/build2.mjs" "$ROOT" "$D/mil-careers.json" "$D/mil-paths.json" "$D/mil-careers.sql" "$D/mil-paths.sql" > "$D/build2.log" 2>&1
expect "the builder turns a careers file and a paths file into migrations" 0 "$?"

cat > "$D/read2.sql" <<'SQL'
SELECT :'at' || ' state', md5(string_agg(x, '~' ORDER BY x)) FROM (
  SELECT 'o' || o::text AS x FROM occupations o WHERE o.title ILIKE '%E2E Mil %'
  UNION ALL SELECT 's' || s.occupation_id || s.skill_id || COALESCE(s.stage::text, '') FROM occupation_skills s INNER JOIN occupations o ON o.id = s.occupation_id WHERE o.title ILIKE '%E2E Mil %'
  UNION ALL SELECT 'a' || a.alias_text || a.canonical_occupation_id FROM occupation_aliases a INNER JOIN occupations o ON o.id = a.canonical_occupation_id WHERE o.title ILIKE '%E2E Mil %') q;
SELECT :'at' || ' careers', string_agg(o.title || ' [' || COALESCE(c.service, 'civilian') || ' ' || COALESCE(o.code_system || ' ' || o.code, 'no code') || ', ' || COALESCE(o.official_title, 'no title') || ', ' || COALESCE(o.home_domain, 'no home') || ', '
    || COALESCE(o.path_status, 'no path') || ' ' || (SELECT COUNT(*) FROM occupation_skills os WHERE os.occupation_id = o.id) || ']', '; ' ORDER BY o.title COLLATE "C")
  FROM occupations o LEFT JOIN companies c ON c.id = o.service_company_id WHERE o.title ILIKE '%E2E Mil %';
SELECT :'at' || ' names', string_agg(a.alias_text || ' > ' || o.title, '; ' ORDER BY a.alias_text COLLATE "C") FROM occupation_aliases a INNER JOIN occupations o ON o.id = a.canonical_occupation_id WHERE a.alias_text ILIKE '%E2E%';
SELECT :'at' || ' look', string_agg(load || ' ' || action || ': ' || detail, ' / ' ORDER BY id) FROM load_log WHERE load IN ('military-careers', 'military-paths') AND id > :mark AND look AND detail LIKE '%E2E%';
SELECT :'at' || ' quiet', string_agg(load || ' ' || action || ': ' || detail, ' / ' ORDER BY id) FROM load_log WHERE load IN ('military-careers', 'military-paths') AND id > :mark AND NOT look AND (detail LIKE '%E2E%' OR action = 'summary');
SELECT :'at' || ' others said', COUNT(*) FROM load_log WHERE load IN ('military-careers', 'military-paths') AND id > :mark AND action = 'not in the file' AND detail NOT LIKE '%E2E%';
SQL
cat > "$D/run2.sql" <<SQL
BEGIN;
-- The real military careers and their paths stand aside: the fixture's file names none of them.
DELETE FROM occupations WHERE service_company_id IS NOT NULL;
-- The Air Force is not stored as a service.
UPDATE companies SET service = NULL WHERE service = 'air-force';
-- Beta carries its code under an earlier title. Epsilon is stored, with a path a person approved.
INSERT INTO occupations (title, service_company_id, code, code_system, official_title)
  SELECT 'Navy E2E Mil Beta Earlier', id, 'e2eb', 'navy-rating', 'E2E Mil Beta Earlier' FROM companies WHERE service = 'navy';
INSERT INTO occupations (title, service_company_id, code, code_system, official_title, path_status)
  SELECT 'Army E2E Mil Epsilon', id, 'E2EE', 'army-mos', 'E2E Mil Epsilon', 'approved' FROM companies WHERE service = 'army';
INSERT INTO occupation_skills (occupation_id, skill_id) SELECT o.id, s.id FROM occupations o, skills s WHERE o.title = 'Army E2E Mil Epsilon' AND s.name IN ('Stick Welding', 'Torque Wrench Use');
-- A civilian career has Gamma's title, in other letters, and another is called what Alpha would also be called.
INSERT INTO occupations (title) VALUES ('army e2e mil gamma'), ('E2E Mil Civilian'), ('E2E Mil Other');
INSERT INTO occupation_aliases (alias_text, canonical_occupation_id) SELECT 'e2e mil taken name', id FROM occupations WHERE title = 'E2E Mil Other';
-- A military career the file does not name.
INSERT INTO occupations (title, service_company_id, code, code_system) SELECT 'Navy E2E Mil By Hand', id, 'E2EH', 'navy-rating' FROM companies WHERE service = 'navy';
SELECT 'civilian before', md5(string_agg(o::text, '~' ORDER BY o.id)) FROM occupations o WHERE o.service_company_id IS NULL AND o.title NOT ILIKE '%E2E Mil%';
SELECT 'approved before', string_agg(skill_id::text || stage, ',' ORDER BY skill_id) FROM occupation_skills os INNER JOIN occupations o ON o.id = os.occupation_id WHERE o.title = 'Army E2E Mil Epsilon';
SELECT COALESCE(MAX(id), 0) AS mark FROM load_log \\gset

\\i $D/mil-careers.sql
\\i $D/mil-paths.sql
\\set at first
\\i $D/read2.sql
SELECT 'civilian after', md5(string_agg(o::text, '~' ORDER BY o.id)) FROM occupations o WHERE o.service_company_id IS NULL AND o.title NOT ILIKE '%E2E Mil%';
SELECT 'approved after', string_agg(skill_id::text || stage, ',' ORDER BY skill_id) FROM occupation_skills os INNER JOIN occupations o ON o.id = os.occupation_id WHERE o.title = 'Army E2E Mil Epsilon';
SELECT 'industries', COUNT(*) FROM industry_occupations io INNER JOIN occupations o ON o.id = io.occupation_id WHERE o.title LIKE '%E2E Mil %';
SELECT 'links', COUNT(*) FROM occupation_links l INNER JOIN occupations o ON o.id IN (l.from_occupation_id, l.to_occupation_id) WHERE o.title LIKE '%E2E Mil %';

SELECT COALESCE(MAX(id), 0) AS mark FROM load_log \\gset
\\i $D/mil-careers.sql
\\i $D/mil-paths.sql
\\set at second
\\i $D/read2.sql
ROLLBACK;
SQL
psql "$DB" -qtA -v ON_ERROR_STOP=1 -f "$D/run2.sql" > "$D/run.out" 2> "$D/run2.err"
expect "the two migrations apply, twice over"      0 "$?"
expect "the careers after the first run" \
  "Army E2E Mil Epsilon [army army-mos E2EE, E2E Mil Epsilon, fabrication, approved 2]; E2E Mil Civilian [civilian no code, no title, no home, no path 0]; E2E Mil Other [civilian no code, no title, no home, no path 0]; Navy E2E Mil Alpha [navy navy-rating E2EA, E2E Mil Alpha, fabrication, draft 5]; Navy E2E Mil Beta [navy navy-rating E2EB, E2E Mil Beta, fabrication, draft 5]; Navy E2E Mil By Hand [navy navy-rating E2EH, no title, no home, no path 0]; army e2e mil gamma [civilian no code, no title, no home, no path 0]" \
  "$(got 'first careers')"
expect "the one new name, and the two that were another career's" "Navy E2EA > Navy E2E Mil Alpha; e2e mil taken name > E2E Mil Other" "$(got 'first names')"
expect "what a person is asked to read" \
  "military-careers name not added: \"E2E Mil Civilian\" was not added to Navy E2E Mil Alpha: it is a career's own title / military-careers name not added: \"E2E Mil Taken Name\" was not added to Navy E2E Mil Alpha: it is another name of E2E Mil Other / military-careers found: Navy E2E Mil Beta (navy-rating E2EB) was stored already as \"Navy E2E Mil Beta Earlier\". Its title, description, home, service and code are now the file's / military-careers title taken: \"army e2e mil gamma\" is stored as a civilian career. It was left as it is, and army-mos E2EG was not written / military-careers no service: Air Force E2E Mil Delta: no company is stored as the service \"air-force\". The career was not written / military-careers found: Army E2E Mil Epsilon (army-mos E2EE) was stored already. Its title, description, home, service and code are now the file's / military-careers not in the file: \"Navy E2E Mil By Hand\" (navy-rating E2EH) is a military career the file does not name. Left as it is / military-paths no career: \"Army E2E Mil Gamma\" is not stored under that title. Its path was not written / military-paths no career: \"Air Force E2E Mil Delta\" is not stored under that title. Its path was not written / military-paths approved, left: Army E2E Mil Epsilon: a person approved this path, so it is left exactly as it is (2 skills). The file has 5; it would add MIG Welding, Shop Math, TIG Welding, Weld Joint Fit-Up; it would take off Torque Wrench Use / military-paths not in the file: \"Navy E2E Mil By Hand\" is not in the file. Its path (0 skills) is left as it is" \
  "$(got 'first look')"
expect "the summaries" \
  "military-careers created: Navy E2E Mil Alpha (navy-rating E2EA) / military-careers summary: 5 careers of the file: 1 created, 2 found and brought to the file's, 0 already as the file has them, 2 not written; other names added: 1; military careers stored: 4, of them not in the file: 1; civilian careers: $((CIVILIAN + 3)) / military-paths written: Navy E2E Mil Alpha: 5 skills, its first path / military-paths written: Navy E2E Mil Beta: 5 skills, its first path / military-paths summary: 5 careers of the file: 2 written, 0 already as the file has them, 1 approved and left, 2 not stored; skill names not found: 0; path lines now stored for the file's careers: 12; careers not in the file: 1" \
  "$(got 'first quiet')"
expect "an approved path is exactly as it was"     "$(got 'approved before')" "$(got 'approved after')"
expect "no civilian career was touched"            "$(got 'civilian before')" "$(got 'civilian after')"
expect "nor named one by one in the log"           0 "$(got 'first others said')"
expect "no industry and no ladder link was written" "0 0" "$(got industries) $(got links)"
expect "a second run changes nothing"              "$(got 'first state')" "$(got 'second state')"
expect "and creates nothing"                       "0 created, 0 found and brought to the file's, 3 already as the file has them, 2 not written; other names added: 0" "$(got 'second quiet' | sed 's/ \/ military-paths.*//; s/.*5 careers of the file: //; s/; military careers stored.*//')"
expect "nothing of the fixture is left"            0 "$(sql "SELECT COUNT(*) FROM occupations WHERE title ILIKE '%E2E Mil%'")"
expect "and the real careers are all still there"  "$(mil 'careers.length')" "$(sql "SELECT COUNT(*) FROM occupations WHERE service_company_id IS NOT NULL")"

cleanup
expect "nothing of this run is left behind"        "0 0" "$(sql "SELECT (SELECT COUNT(*) FROM users WHERE email LIKE '%@military.test') || ' ' || (SELECT COUNT(*) FROM jobs j INNER JOIN occupations o ON o.id = j.occupation_id WHERE o.service_company_id IS NOT NULL)")"
finish
