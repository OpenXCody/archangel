#!/usr/bin/env bash
# Checks the industry level: /api/industries and /api/industries/:slug for the
# country, a state and a focus area, the refusals, how a headcount that covers
# only some of a company's plants is said, and that search and the Explore
# overview find industries. Prints one line per check and exits non-zero if
# any fail.
#
# LOCAL ONLY: it adds two companies and five plants (names starting "E2E
# Industry") in one industry of one state, straight into the database, and
# removes them on exit however the script ends. Never point it at production.
#   API=http://localhost:3000/api DB=postgresql://... bash tests/api/industries.sh
# Needs a running dev API with migrations 0035 and 0036 applied, and psql,
# curl and node on the PATH.
set -u
API=${API:-http://localhost:3000/api}
DB=${DB:-postgresql://postgres:postgres@127.0.0.1:5432/archangel}
case "$API" in http://localhost:*|http://127.0.0.1:*) ;; *) echo "Refusing to run against $API: local only."; exit 2;; esac
fail=0
get() { curl -s -w '\n%{http_code}' "$API$1"; } # path -> prints "body status"
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
# Evaluates a JavaScript expression over the response body, as `o`.
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
expect "asked for other kinds, none are sent" 0 "$(get '/search?q=chem&types=companies' | j 'o.results.industries.count')"
expect "the Explore overview lists the largest" true "$(get /explore/overview | j 'o.industries.length>=5 && o.industries.every(x=>x.slug&&x.name) && (o.industriesYear===null||o.industriesYear>=2024)')"

cleanup
expect "test companies and plants removed"    0 "$(sql "SELECT (SELECT COUNT(*) FROM companies WHERE name LIKE 'E2E Industry %') + (SELECT COUNT(*) FROM factories WHERE name LIKE 'E2E Industry %')")"
[ $fail -eq 0 ] && echo "ALL PASSED" || echo "SOME FAILED"
exit $fail
