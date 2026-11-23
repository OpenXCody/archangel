#!/usr/bin/env bash
# Checks the industry level: /api/industries and /api/industries/:slug for the
# country, a state and a focus area, the refusals, how a headcount that covers
# only some of a company's plants is said, that search and the Explore
# overview find industries, that a company's industry is the one most of its
# plants are in (the lists, their filter, search), and the order of the
# careers list, and the keys that join a plant to public statistics (numeric
# coordinates, clean NAICS code, county) with the county's official figures.
# Prints one line per check and exits non-zero if any fail.
#
# LOCAL ONLY: it adds five companies and thirteen plants (names starting "E2E
# Industry") in one state, straight into the database, and
# removes them on exit however the script ends. Never point it at production.
#   API=http://localhost:3000/api DB=postgresql://... bash tests/api/industries.sh
# Needs a running dev API with migrations 0035, 0036 and 0044 applied, and psql,
# curl and node on the PATH.
set -u
. "$(dirname "$0")/lib.sh"
# Every request here is a signed-out read, so there is no cookie jar: get in place of req.
get() { curl -s -w '\n%{http_code}' "$API$1"; } # path -> prints the body, then the status on a line of its own
# This suite's j takes a whole expression over the response body, as `o` (`j 'o.industries.length'`).
j() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s.split('\n').slice(0,-1).join('\n'));console.log(eval(process.argv[1]))})" "$1"; }

# The test rows: leather plants in Alaska, where the sample data has none of its own.
ST=AK; IND='Leather and Allied Product Manufacturing'; SLUG=leather
cleanup() { sql "DELETE FROM factories WHERE name LIKE 'E2E Industry %'; DELETE FROM companies WHERE name LIKE 'E2E Industry %'" >/dev/null; }
trap cleanup EXIT
cleanup
BASE=$(sql "SELECT COUNT(*) FROM factories WHERE state='$ST' AND primary_naics_description='$IND'")
ONE=$(sql "INSERT INTO companies (name, domain) VALUES ('E2E Industry One', 'e2e-one.test') RETURNING id")
TWO=$(sql "INSERT INTO companies (name) VALUES ('E2E Industry Two') RETURNING id")
plant() { # name company workforce city
  sql "INSERT INTO factories (name, company_id, latitude, longitude, state, city, primary_naics, primary_naics_description, workforce_size)
       VALUES ('E2E Industry $1', '$2', '61.2', '-149.9', '$ST', $4, '316', '$IND', $3)" >/dev/null
}
# One: three plants, a headcount recorded at one, unknown at one, zero (unknown) at one.
plant 'Plant A' "$ONE" 500 "'ANCHORAGE'"
plant 'Plant B' "$ONE" NULL "'ANCHORAGE'"
plant 'Plant C' "$ONE" 0 "'Juneau'"
# Two: two plants, no headcount at either.
plant 'Plant D' "$TWO" NULL "' anchorage '"
plant 'Plant E' "$TWO" NULL NULL

# ── The list ────────────────────────────────────────────────────────────────
R=$(get /industries)
check "every industry, for the country"      200 "$R" '"kind":"country"'
expect "all 21 are there"                     21 "$(printf '%s' "$R" | j 'o.industries.length')"
expect "largest first, by people employed"    true "$(printf '%s' "$R" | j 'o.industries.every((x,i,a)=>i===0||(a[i-1].employment??-1)>=(x.employment??-1))')"
expect "each has its page address"            true "$(printf '%s' "$R" | j 'o.industries.every(x=>/^[a-z-]+$/.test(x.slug))')"
expect "manufacturing as a whole is official" true "$(printf '%s' "$R" | j 'o.manufacturing.employment>1e6 && o.manufacturing.year>=2024 && /Labor Statistics/.test(o.manufacturing.source)')"
expect "plants are the product's own count"   "$(sql "SELECT COUNT(*) FROM factories")" "$(printf '%s' "$R" | j 'o.plants')"
check "public and cacheable"                  200 "$(curl -s -o /dev/null -D - -w '\n%{http_code}' "$API/industries" | tr -d '\r')" 's-maxage='
R=$(get "/industries?state=tx")
check "for a state, in any letter case"       200 "$R" '"code":"TX","name":"Texas"'
expect "a state's own figures"                true "$(printf '%s' "$R" | j 'o.manufacturing.employment>100000 && o.manufacturing.employment<5e6')"
R=$(get "/industries?area=austin")
check "for a focus area"                      200 "$R" '"kind":"area"'
expect "an area has no official figures"      "null true" "$(printf '%s' "$R" | j 'o.manufacturing+" "+o.industries.every(x=>x.employment===null&&x.plants>0)')"
check "an unknown state"                      404 "$(get '/industries?state=ZZ')"
check "a state that is not a code"            400 "$(get '/industries?state=texas')"
check "an unknown area"                       404 "$(get '/industries?area=nowhere')"
check "a state and an area together"          400 "$(get '/industries?state=TX&area=austin')"
# A withheld figure is null, never zero: find one in the table and ask for it.
WITHHELD=$(sql "SELECT state || ' ' || industry_code FROM industry_stats WHERE employment IS NULL AND establishments > 0 AND state <> 'US' AND industry_code <> '31-33' ORDER BY 1 LIMIT 1")
if [ -n "$WITHHELD" ]; then
  set -- $WITHHELD
  expect "a withheld figure is null, not zero" "null true" "$(get "/industries?state=$1" | j "(x=>x.employment+' '+(x.establishments>0))(o.industries.find(x=>x.code==='$2'))")"
else echo "skip  withheld figure (none in this database)"; fi

# ── One industry ────────────────────────────────────────────────────────────
R=$(get "/industries/$SLUG?state=$ST")
check "one industry in a state"               200 "$R" '"slug":"leather"'
expect "its name and sentence"                true "$(printf '%s' "$R" | j "o.industry.name==='$IND' && o.industry.code==='316' && o.industry.summary.length>30")"
expect "plants and companies listed"          "$((BASE + 5)) true" "$(printf '%s' "$R" | j 'o.plants+" "+(o.companies>=2)')"
expect "the leading employer is ranked by people" "E2E Industry One" "$(printf '%s' "$R" | j 'o.employers[0].name')"
expect "its people are those recorded, at the plants that have them" "500 1 3" "$(printf '%s' "$R" | j '(e=>e.people+" "+e.counted+" "+e.plants)(o.employers[0])')"
expect "an unknown headcount is null, not zero" "null 0 2" "$(printf '%s' "$R" | j '(e=>e.people+" "+e.counted+" "+e.plants)(o.employers.find(e=>e.name==="E2E Industry Two"))')"
expect "the logo's domain comes with it"      "e2e-one.test" "$(printf '%s' "$R" | j 'o.employers[0].domain')"
expect "largest plants: only those with a headcount" "E2E Industry Plant A:500" "$(printf '%s' "$R" | j 'o.largestPlants.filter(p=>p.name.startsWith("E2E")).map(p=>p.name+":"+p.people).join()')"
expect "no plant is listed with zero people"  true "$(printf '%s' "$R" | j 'o.largestPlants.every(p=>p.people>0)')"
expect "a state lists its cities, however they are written" "3" "$(printf '%s' "$R" | j '(o.cities.find(c=>c.name.trim().toUpperCase()==="ANCHORAGE")||{}).plants - '"$(sql "SELECT COUNT(*) FROM factories WHERE state='$ST' AND primary_naics_description='$IND' AND upper(btrim(city))='ANCHORAGE' AND name NOT LIKE 'E2E Industry %'")")"
expect "a city carries a box for the map"     true "$(printf '%s' "$R" | j '(b=>b[0][0]<-149.9&&b[1][0]>-149.9&&b[0][1]<61.2&&b[1][1]>61.2)(o.cities.find(c=>c.name.trim().toUpperCase()==="ANCHORAGE").box)')"
expect "a state has cities, not states"       "undefined" "$(printf '%s' "$R" | j 'typeof o.states')"
expect "careers are the industry's own"       "$(sql "SELECT COUNT(*) FROM industry_occupations WHERE industry='$IND' AND NOT common")" "$(printf '%s' "$R" | j 'o.careers.length')"
expect "open jobs are counted"                "0 0" "$(printf '%s' "$R" | j 'o.openJobs+" "+o.jobs.length')"
expect "official figures, or none, never zero" true "$(printf '%s' "$R" | j 'o.stats===null || [o.stats.employment,o.stats.establishments,o.stats.avgAnnualPay].every(v=>v===null||v>0)')"
# Production reaches the function through a rewrite that adds `path` to the query.
check "as Vercel sends it"                    200 "$(get "/industries/$SLUG?state=$ST&path=industries/$SLUG")" '"E2E Industry One"'
check "the list, as Vercel sends it"          200 "$(get "/industries?path=industries")" '"kind":"country"'

R=$(get "/industries/$SLUG")
check "the same industry, for the country"    200 "$R" '"kind":"country"'
expect "the country lists states, largest first" true "$(printf '%s' "$R" | j 'o.states.length>10 && o.states.every((x,i,a)=>i===0||(a[i-1].employment??-1)>=(x.employment??-1)) && typeof o.cities==="undefined"')"
expect "the state's plants are among them"    "$((BASE + 5))" "$(printf '%s' "$R" | j "o.states.find(s=>s.code==='$ST').plants")"
expect "national figures are official"        true "$(printf '%s' "$R" | j 'o.stats.employment>1000 && o.stats.establishments>100 && o.stats.avgAnnualPay>20000')"
R=$(get "/industries/chemicals?area=austin")
check "an industry in a focus area"           200 "$R" '"kind":"area","id":"austin"'
expect "no official figures for an area"      null "$(printf '%s' "$R" | j 'o.stats')"
check "an industry that does not exist"       404 "$(get /industries/steelmaking)"
check "an industry, an unknown state"         404 "$(get "/industries/$SLUG?state=ZZ")"
check "an industry, a state and an area"      400 "$(get "/industries/$SLUG?state=TX&area=austin")"

# ── Found from elsewhere ────────────────────────────────────────────────────
R=$(get "/search?q=chem")
check "search finds an industry by name"      200 "$R" '"type":"industries"'
expect "its id is its page address"           "chemicals Chemicals" "$(printf '%s' "$R" | j '(i=>i.id+" "+i.name)(o.results.industries.items[0])')"
expect "and by what it makes"                 "glass-cement" "$(get '/search?q=cement&types=industries' | j 'o.results.industries.items.map(i=>i.id).join()')"
expect "not by a word every industry has"     0 "$(get '/search?q=plants&types=industries' | j 'o.results.industries.count')"
expect "nor by the word the screen uses for it" 0 "$(get '/search?q=factories&types=industries' | j 'o.results.industries.count')"
expect "asked for other kinds, none are sent" 0 "$(get '/search?q=chem&types=companies' | j 'o.results.industries.count')"
expect "the Explore overview lists the largest" true "$(get /explore/overview | j 'o.industries.length>=5 && o.industries.every(x=>x.slug&&x.name) && (o.industriesYear===null||o.industriesYear>=2024)')"

# ── A company's industry: the one most of its plants are in ────────────────
# Three: two chemical plants, one leather, one with no industry, one whose industry is not of the 21;
# its own free text says something else. Four: one of each (a tie). Five: free text only.
CHEM='Chemical Manufacturing'
THREE=$(sql "INSERT INTO companies (name, industry) VALUES ('E2E Industry Three', 'Robots & Lasers') RETURNING id")
FOUR=$(sql "INSERT INTO companies (name) VALUES ('E2E Industry Four') RETURNING id")
FIVE=$(sql "INSERT INTO companies (name, industry) VALUES ('E2E Industry Five', 'Robots & Lasers') RETURNING id")
mixed() { # name company industry-or-NULL
  sql "INSERT INTO factories (name, company_id, latitude, longitude, state, city, primary_naics_description) VALUES ('E2E Industry $1', '$2', '61.2', '-149.9', '$ST', 'ANCHORAGE', $3)" >/dev/null
}
mixed 'Plant F' "$THREE" "'$CHEM'"; mixed 'Plant G' "$THREE" "'$CHEM'"; mixed 'Plant H' "$THREE" "'$IND'"
mixed 'Plant I' "$THREE" NULL;      mixed 'Plant J' "$THREE" "'Robots & Lasers'"
mixed 'Plant K' "$FOUR" "'$IND'";   mixed 'Plant L' "$FOUR" "'$CHEM'"
mixed 'Five Works' "$FIVE" NULL
R=$(get '/companies?search=E2E%20Industry&limit=20&sort=name')
check "the companies list"                    200 "$R" '"name":"E2E Industry Three"'
by() { printf '%s' "$R" | j "String((o.data.find(c=>c.name==='E2E Industry $1')||{}).industry)"; }
expect "most of its plants decide it"         "$CHEM" "$(by Three)"
expect "every plant in one industry"          "$IND" "$(by One)"
expect "a tie goes to the name that sorts first" "$CHEM" "$(by Four)"
expect "the free text is not an industry"     null "$(by Five)"
R=$(get '/companies?industry=leather&search=E2E%20Industry&limit=20')
expect "filtered by an industry's slug"       "E2E Industry One,E2E Industry Two" "$(printf '%s' "$R" | j 'o.data.map(c=>c.name).sort().join()')"
expect "and by the name a plant carries"      2 "$(get "/companies?industry=$(printf '%s' "$IND" | sed 's/ /%20/g')&search=E2E%20Industry" | j 'o.total')"
expect "the free text is not a filter"        0 "$(get '/companies?industry=Robots%20%26%20Lasers' | j 'o.total')"
R=$(get /explore/facets)
check "the lists' filters"                    200 "$R" '"industries":{"plants":\['
expect "companies are offered the 21 only"    true "$(printf '%s' "$R" | j "o.industries.companies.includes('$IND') && !o.industries.companies.includes('Robots & Lasers') && o.industries.companies.length<=21 && o.industries.plants.length<=21")"
expect "plants too, under the older name"     true "$(printf '%s' "$R" | j 'o.factoryIndustries.join()===o.industries.plants.join()')"
# The skills list filters by domain, then group: the domains with a skill some career uses, each with such groups, in the taxonomy's order.
# (A civilian career: the lists, the filters and the counts are of those.)
IN_USE="FROM skill_groups g WHERE EXISTS (SELECT 1 FROM skills s JOIN occupation_skills os ON os.skill_id=s.id JOIN occupations o ON o.id=os.occupation_id WHERE s.group_slug=g.slug AND o.service_company_id IS NULL)"
expect "the skill domains in use"             "$(sql "SELECT COUNT(DISTINCT g.domain_slug) $IN_USE")" "$(printf '%s' "$R" | j 'o.skillDomains.length')"
expect "each with its groups in use"          "$(sql "SELECT COUNT(*) $IN_USE")" "$(printf '%s' "$R" | j 'o.skillDomains.reduce((n,d)=>n+d.groups.length,0)')"
expect "in the taxonomy's order"              "$(sql "SELECT string_agg(slug, ',' ORDER BY position) FROM skill_domains d WHERE EXISTS (SELECT 1 $IN_USE AND g.domain_slug=d.slug)")" "$(printf '%s' "$R" | j 'o.skillDomains.map(d=>d.slug).join()')"
expect "a domain and a group are a slug and a name" true "$(printf '%s' "$R" | j 'o.skillDomains.length>0 && o.skillDomains.every(d=>d.slug&&d.name&&d.groups.length>0&&d.groups.every(g=>g.slug&&g.name&&Object.keys(g).sort().join()==="name,slug"))')"
expect "categories are no longer given"       undefined "$(printf '%s' "$R" | j 'String(o.skillCategories)')"
R=$(get '/search?q=E2E%20Industry&types=companies,factories&limit=20')
expect "search shows it by its short name"    Chemicals "$(printf '%s' "$R" | j "o.results.companies.items.find(c=>c.name==='E2E Industry Three').subtitle")"
expect "and nothing for free text"            undefined "$(printf '%s' "$R" | j "String(o.results.companies.items.find(c=>c.name==='E2E Industry Five').subtitle)")"
expect "a plant's line is its company and place" "E2E Industry One · Anchorage, AK" "$(printf '%s' "$R" | j "o.results.factories.items.find(f=>f.name==='E2E Industry Plant A').subtitle")"
expect "without the company its name starts with" "Anchorage, AK" "$(printf '%s' "$R" | j "o.results.factories.items.find(f=>f.name==='E2E Industry Five Works').subtitle")"
expect "the overview's companies carry one of the 21, or none" true "$(get /explore/overview | j "o.employers.every(e=>e.industry===null||/ Manufacturing$| Mills$| Activities$/.test(e.industry))")"

# ── The careers list: something to follow first ─────────────────────────────
R=$(get '/occupations?limit=100')
expect "careers with a path, then the most skills" ok "$(printf '%s' "$R" | j "o.data.every((c,i,a)=>i===0||(!a[i-1].pathStatus)<(!c.pathStatus)||((!a[i-1].pathStatus)===(!c.pathStatus)&&a[i-1].skillCount>=c.skillCount))?'ok':'out of order'")"
expect "a career with a path counts its skills at each level" true "$(printf '%s' "$R" | j "o.data.some(c=>c.pathStatus) && o.data.filter(c=>c.pathStatus).every(c=>Array.isArray(c.levelCounts)&&c.levelCounts.length===3&&c.levelCounts.reduce((a,b)=>a+b,0)===c.skillCount)")"
expect "the last page is the career with the fewest skills" "$(sql "SELECT n FROM (SELECT o.path_status, (SELECT COUNT(*) FROM occupation_skills os WHERE os.occupation_id=o.id) AS n FROM occupations o WHERE o.service_company_id IS NULL) x ORDER BY (path_status IS NULL) DESC, n LIMIT 1")" "$(get "/occupations?limit=1&offset=$(( $(sql 'SELECT COUNT(*) FROM occupations WHERE service_company_id IS NULL') - 1 ))" | j 'o.data[0].skillCount')"
expect "sort=name is the plain name order"    "$(sql "SELECT title FROM occupations WHERE service_company_id IS NULL ORDER BY lower(title), id LIMIT 1")" "$(get '/occupations?sort=name&limit=1' | j 'o.data[0].title')"
expect "and backwards"                        "$(sql "SELECT title FROM occupations WHERE service_company_id IS NULL ORDER BY lower(title) DESC, id LIMIT 1")" "$(get '/occupations?sort=name&order=desc&limit=1' | j 'o.data[0].title')"

# ── A focus area on the map ─────────────────────────────────────────────────
# GET /api/map/areas/:id/overview is the panel a focus area opens: what a
# state's overview carries, for the plants inside the area's drawn boundary.
# Two plants of our own: one in the middle of Austin, one inside the box
# around the area but south-west of its boundary.
AREA=$(get /map/areas/austin/overview)
check "a focus area's panel"                  200 "$AREA" '"id":"austin"'
expect "it says what the area is"             "Austin, TX|true|4" "$(printf '%s' "$AREA" | j '[o.name, o.description.length>0, o.bounds.flat().length].join("|")')"
expect "it carries what a state's panel does" true "$(printf '%s' "$AREA" | j "$(get /map/states/TX/overview | j 'JSON.stringify(Object.keys(o).filter(k=>k!=="code"))').every(k=>k in o)")"
INSIDE=$(printf '%s' "$AREA" | j 'o.totalFactories')
BOXED=$(get '/map/bounds/overview?west=-98.2985&south=29.6306&east=-97.0243&north=30.9063' | j 'o.totalFactories')
sql "INSERT INTO factories (name, company_id, latitude, longitude, state, city, primary_naics_description) VALUES
  ('E2E Industry Austin In', '$ONE', '30.2672', '-97.7431', 'TX', 'AUSTIN', '$IND'),
  ('E2E Industry Austin Out', '$ONE', '29.70', '-98.25', 'TX', 'BOERNE', '$IND')" >/dev/null
expect "a plant inside the boundary is counted, one outside it is not" "$((INSIDE + 1))" "$(get /map/areas/austin/overview | j 'o.totalFactories')"
expect "the box around the area holds both"   "$((BOXED + 2))" "$(get '/map/bounds/overview?west=-98.2985&south=29.6306&east=-97.0243&north=30.9063' | j 'o.totalFactories')"
expect "its industries are of the 21, the largest first" true "$(get /map/areas/austin/overview | j 'o.topIndustries.length>0 && o.topIndustries.every((x,i,a)=>/ Manufacturing$| Mills$| Activities$/.test(x.label) && x.count>0 && (i===0||a[i-1].count>=x.count))')"
check "an area that is not one"               404 "$(get /map/areas/nowhere/overview)" 'Area not found'

# ── The keys on a plant ─────────────────────────────────────────────────────
# Migration 0044: the reference tables are loaded, the coordinates are numbers,
# the clean NAICS code follows the stored one, and a county is a fact about
# the coordinates it was worked out from.
expect "the reference tables are loaded"      "3144 925 630 21" "$(sql "SELECT (SELECT COUNT(*) FROM counties) || ' ' || (SELECT COUNT(*) FROM metros) || ' ' || (SELECT COUNT(*) FROM naics) || ' ' || (SELECT COUNT(*) FROM naics WHERE level = 3)")"
expect "the 21 subsectors are the product's industries" 21 "$(sql "SELECT COUNT(*) FROM naics n INNER JOIN industry_profiles p ON p.code = n.code AND p.name = n.title WHERE n.level = 3")"
expect "a six-digit code rolls up to its industry" "$IND" "$(sql "WITH RECURSIVE up AS (SELECT code, title, level, parent FROM naics WHERE code = '316210' UNION ALL SELECT n.code, n.title, n.level, n.parent FROM naics n INNER JOIN up ON up.parent = n.code) SELECT title FROM up WHERE level = 3")"
KEYS=$(sql "INSERT INTO factories (name, company_id, latitude, longitude, state, city, primary_naics, primary_naics_description) VALUES ('E2E Industry Keys', '$ONE', '30.2672', ' -97.7431 ', 'TX', 'AUSTIN', '336111', 'Transportation Equipment Manufacturing') RETURNING id")
expect "coordinates are numbers beside the text" "30.2672 -97.7431" "$(sql "SELECT lat || ' ' || lng FROM factories WHERE id='$KEYS'")"
expect "a code of an earlier edition means its 2022 industry" "336111 336110" "$(sql "SELECT primary_naics || ' ' || naics FROM factories WHERE id='$KEYS'")"
naics_of() { sql "UPDATE factories SET primary_naics = $1 WHERE id='$KEYS' RETURNING COALESCE(naics, 'none')"; }
expect "a 2022 national industry is itself"   311611 "$(naics_of "'311611'")"
expect "a shorter code with one industry under it" 324110 "$(naics_of "'32411'")"
expect "a code from 2007, through three editions" 311224 "$(naics_of "'311222'")"
expect "a subsector alone is not one industry" none "$(naics_of "'336'")"
expect "a code that was split is not guessed"  none "$(naics_of "'339111'")"
expect "a code outside manufacturing has none" none "$(naics_of "'541110'")"
expect "no stored code, no clean code"        none "$(naics_of NULL)"
expect "text that is not a number has no numeric coordinate" "true 30.2672" "$(sql "UPDATE factories SET longitude = 'west' WHERE id='$KEYS' RETURNING (lng IS NULL) || ' ' || lat")"
expect "nor has a number that is not a latitude" t "$(sql "UPDATE factories SET latitude = '130.2', longitude = '-97.7431' WHERE id='$KEYS' RETURNING lat IS NULL AND lng = -97.7431")"
sql "UPDATE factories SET latitude = '30.2672' WHERE id='$KEYS'" >/dev/null

# ── A plant's county ────────────────────────────────────────────────────────
# GET /api/map/factories/:id/county. The county is written by
# scripts/geo/assign-keys.mjs from the coordinates; here it is set by hand.
R=$(get "/map/factories/$KEYS/county")
check "a plant not yet placed has no county"  200 "$R" '"county":null'
expect "and nothing is said about one"        "null null" "$(printf '%s' "$R" | j 'o.metro+" "+o.manufacturing')"
sql "UPDATE factories SET county_fips = '48453', cbsa_code = '12420' WHERE id='$KEYS'" >/dev/null
R=$(get "/map/factories/$KEYS/county")
check "a plant's county"                      200 "$R" '"county":{"fips":"48453","name":"Travis County","state":"TX"}'
expect "its metro area"                       "12420|Austin-Round Rock-San Marcos, TX|metropolitan" "$(printf '%s' "$R" | j '[o.metro.code,o.metro.name,o.metro.kind].join("|")')"
expect "the county's official figures, with who counted them" "$(sql "SELECT year || ' ' || establishments || ' ' || employment || ' ' || avg_annual_pay FROM industry_county_stats WHERE county_fips='48453' AND industry_code='31-33' ORDER BY year DESC LIMIT 1") true" "$(printf '%s' "$R" | j '(m=>[m.year,m.establishments,m.employment,m.avgAnnualPay].join(" ")+" "+(/Labor Statistics/.test(m.source)&&/^https:/.test(m.sourceUrl)))(o.manufacturing)')"
expect "the figures are the county's, not the state's" true "$(printf '%s' "$R" | j "o.manufacturing.employment < $(get '/industries?state=TX' | j 'o.manufacturing.employment')")"
check "public and cacheable"                  200 "$(curl -s -o /dev/null -D - -w '\n%{http_code}' "$API/map/factories/$KEYS/county" | tr -d '\r')" 's-maxage='
check "as production sends it, with the rewrite's path" 200 "$(get "/map/factories/$KEYS/county?path=map/factories/$KEYS/county")" 'Travis County'
# A county whose employment the Bureau withheld, and one with no row at all.
HIDDEN=$(sql "SELECT county_fips FROM industry_county_stats WHERE employment IS NULL AND establishments > 0 AND industry_code='31-33' ORDER BY 1 LIMIT 1")
sql "UPDATE factories SET county_fips = '$HIDDEN', cbsa_code = NULL WHERE id='$KEYS'" >/dev/null
expect "a withheld figure is null, not zero"  "null null true" "$(get "/map/factories/$KEYS/county" | j '(m=>m.employment+" "+m.avgAnnualPay+" "+(m.establishments>0))(o.manufacturing)')"
BARE=$(sql "SELECT c.fips FROM counties c WHERE NOT EXISTS (SELECT 1 FROM industry_county_stats s WHERE s.county_fips = c.fips) ORDER BY 1 LIMIT 1")
sql "UPDATE factories SET county_fips = '$BARE' WHERE id='$KEYS'" >/dev/null
expect "a county with nothing published says nothing" "$BARE null" "$(get "/map/factories/$KEYS/county" | j 'o.county.fips+" "+o.manufacturing')"
# A plant that moves loses its county until it is placed again; one moved and placed in one statement keeps it.
sql "UPDATE factories SET county_fips = '48453', cbsa_code = '12420' WHERE id='$KEYS'" >/dev/null
expect "changing something else keeps the county" 48453 "$(sql "UPDATE factories SET city = 'Austin', primary_naics = '311611' WHERE id='$KEYS' RETURNING county_fips")"
expect "moving the plant clears its county and metro" "none none" "$(sql "UPDATE factories SET latitude = '32.7767', longitude = '-96.7970' WHERE id='$KEYS' RETURNING COALESCE(county_fips, 'none') || ' ' || COALESCE(cbsa_code, 'none')")"
expect "moved and placed in one statement keeps the new county" "48113 19100" "$(sql "UPDATE factories SET latitude = '32.78', county_fips = '48113', cbsa_code = '19100' WHERE id='$KEYS' RETURNING county_fips || ' ' || cbsa_code")"
expect "a county that does not exist is refused" 1 "$(sql "UPDATE factories SET county_fips = '48999' WHERE id='$KEYS'" 2>&1 | grep -c 'foreign key')"
check "a plant that does not exist"           404 "$(get /map/factories/00000000-0000-4000-8000-000000000000/county)" 'Factory not found'
check "an id that is not one"                 400 "$(get /map/factories/giga-texas/county)"

cleanup
expect "test companies and plants removed"    0 "$(sql "SELECT (SELECT COUNT(*) FROM companies WHERE name LIKE 'E2E Industry %') + (SELECT COUNT(*) FROM factories WHERE name LIKE 'E2E Industry %')")"
finish
