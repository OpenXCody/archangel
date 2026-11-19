# What the suites in this folder share. Sourced by each one, never run:
#   set -u
#   . "$(dirname "$0")/lib.sh"
#
# It gives a suite:
#   API, DB   where the API and the database are; the defaults are this machine's
#   fail      0 until a check fails, then 1
#   req       one request, with a cookie jar kept in $D (the suite makes $D)
#   check     the status of what req printed and, if asked, a pattern in its body
#   expect    two values that must be the same
#   sql       one statement against DB, printing bare values
#   j         a JavaScript expression over the body req printed
#   finish    the last line of a suite: says how it went and exits with `fail`
# A check prints one line, "ok    <name>" or "FAIL  <name>: ...". scripts/ci-local.sh
# counts those lines, so their first word is not to change.
#
# LOCAL ONLY. The suites create and delete accounts and records, so an API
# that is not on this machine is refused here, before a suite does anything.
# loader.sh calls no API: it sets LIB_NO_API=1 and checks DB itself.

DB=${DB:-postgresql://postgres:postgres@127.0.0.1:5432/archangel}
if [ -z "${LIB_NO_API:-}" ]; then
  API=${API:-http://localhost:3000/api}
  case "$API" in http://localhost:*|http://127.0.0.1:*) ;; *) echo "Refusing to run against $API: local only."; exit 2;; esac
fi
fail=0

req() { # jar method path [json]  -> prints the body, then the status on a line of its own
  local jar=$1 m=$2 p=$3 d=${4:-}
  if [ -n "$d" ]; then curl -s -b "$D/$jar" -c "$D/$jar" -X "$m" -H 'Content-Type: application/json' -d "$d" -w '\n%{http_code}' "$API$p"
  else curl -s -b "$D/$jar" -c "$D/$jar" -X "$m" -w '\n%{http_code}' "$API$p"; fi
}
# How much of a body a failed check prints. A suite may set it after sourcing.
CHECK_SHOWS=200
check() { # name expected-status actual-output [grep-pattern]
  local name=$1 want=$2 out=$3 pat=${4:-}
  local code; code=$(printf '%s' "$out" | tail -n1)
  local body; body=$(printf '%s' "$out" | sed '$d')
  if [ "$code" != "$want" ] || { [ -n "$pat" ] && ! printf '%s' "$body" | grep -q "$pat"; }; then
    echo "FAIL  $name: wanted $want ${pat:+matching /$pat/ }got $code $(printf '%s' "$body" | head -c "$CHECK_SHOWS")"; fail=1
  else echo "ok    $name"; fi
}
expect() { # name wanted got
  if [ "$2" = "$3" ]; then echo "ok    $1"; else echo "FAIL  $1: wanted $2 got $3"; fail=1; fi
}
sql() { psql "$DB" -qtAc "$1"; }
# The body is `o`, and the expression starts at one of its properties: `j user.email`.
j() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s.split('\n').slice(0,-1).join('\n'));console.log(eval('o.'+process.argv[1]))})" "$1"; }
finish() {
  [ $fail -eq 0 ] && echo "ALL PASSED" || echo "SOME FAILED"
  exit $fail
}
