#!/usr/bin/env bash
# Runs every Maestro flow in this folder.
#
# 1. All flows in ONE `maestro test` session. Starting Maestro takes ~55 seconds on the CI
#    emulator (driver install and connect), so one session per flow made the next flow's
#    first wait time out. One session pays that cost once.
# 2. Any flow that failed gets one more try on its own, after resetting the test accounts and
#    reinstalling the app (the emulator can still hiccup). A flow that fails twice fails the
#    job, and its screen and app log are printed.
#
# Usage: bash apps/mobile/e2e/run.sh   (emulator running, app installed)
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="${MAESTRO_OUT:-maestro-results}"
APK="${APK:-$DIR/../android/app/build/outputs/apk/release/app-release.apk}"
APP_ID=lk.fizzix.app
DB_CONTAINER="${DB_CONTAINER:-supabase_db_fizzix}"
mkdir -p "$OUT"

# Flows sign up the test numbers from supabase/config.toml. Before a run (and before a
# retry) remove those accounts and the lockout / rate-limit counters, so a flow that failed
# halfway can start again from nothing. Local Supabase only: test numbers never exist in
# production.
reset_test_data() {
  if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$DB_CONTAINER"; then
    echo "::warning::$DB_CONTAINER not running; test data not reset"
    return 0
  fi
  docker exec -i "$DB_CONTAINER" psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL' >/dev/null
delete from auth.users where phone like '947700000__';
delete from private.login_failures;
delete from private.login_ip_hits;
delete from private.rate_limits;
delete from private.sms_requests;
SQL
}

# A clean app without `pm clear`, which sometimes stalls for over a minute on the emulator.
fresh_install() {
  adb shell am force-stop "$APP_ID" || true
  adb uninstall "$APP_ID" >/dev/null 2>&1 || true
  adb install "$APK" >/dev/null
}

# ST-06 flows log in from "another phone" with Maestro's http client on this machine.
ENV_ARGS=(-e "SUPABASE_URL=${SUPABASE_URL:-http://127.0.0.1:54321}" -e "SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY:-${EXPO_PUBLIC_SUPABASE_ANON_KEY:-}}")

adb shell cmd connectivity airplane-mode disable >/dev/null 2>&1 || true
reset_test_data
adb logcat -c || true
if maestro test "${ENV_ARGS[@]}" "$DIR" --format junit --output "$OUT/all.xml" --debug-output "$OUT/all"; then
  echo "PASSED all flows in one session"
  exit 0
fi

# Which flows failed? Match junit test cases back to flow files by file name or flow name.
failed=$(python3 - "$OUT/all.xml" "$DIR" <<'PY'
import pathlib, re, sys, xml.etree.ElementTree as ET
report, folder = sys.argv[1], pathlib.Path(sys.argv[2])
flows = {}
for f in sorted(folder.glob('*.yaml')):
    m = re.search(r'^name:\s*(.+)$', f.read_text(encoding='utf-8'), re.M)
    flows[f.stem] = f
    if m:
        flows[m.group(1).strip()] = f
try:
    cases = list(ET.parse(report).getroot().iter('testcase'))
except Exception:
    cases = []
if not cases:
    # No readable report: retry every flow rather than guess.
    for f in sorted(folder.glob('*.yaml')):
        print(f)
    sys.exit(0)
seen = set()
for case in cases:
    if case.find('failure') is None and case.find('error') is None:
        continue
    for key in (case.get('id'), case.get('name')):
        f = flows.get((key or '').strip())
        if f and f not in seen:
            seen.add(f)
            print(f)
            break
PY
)

if [ -z "$failed" ]; then
  echo "::error::Maestro failed but no failed flow was found in the report"
  exit 1
fi

FAILED=0
for flow in $failed; do
  name="$(basename "$flow" .yaml)"
  echo "::warning::$name failed in the combined run; retrying it once on its own"
  # ST-59 turns airplane mode on; never retry (or carry on) without a network.
  adb shell cmd connectivity airplane-mode disable >/dev/null 2>&1 || true
  reset_test_data
  fresh_install
  adb logcat -c || true
  if maestro test "${ENV_ARGS[@]}" "$flow" --format junit --output "$OUT/$name-retry.xml" --debug-output "$OUT/$name-retry"; then
    echo "PASSED $name (on retry)"
    continue
  fi
  FAILED=1
  echo "FAILED $name"
  echo "::group::$name: screen at failure"
  maestro hierarchy 2>/dev/null | grep -oE '"(text|resource-id)" *: *"[^"]+"' | grep -v "com.android.systemui" | head -60
  echo "::endgroup::"
  echo "::group::$name: app log"
  adb logcat -d | grep -E "ReactNativeJS|AndroidRuntime|FATAL" | tail -80
  echo "::endgroup::"
  # Server side: Edge Function logs carry only ids, status and error codes (never secrets).
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx supabase_edge_runtime_fizzix; then
    echo "::group::$name: edge function log"
    docker logs supabase_edge_runtime_fizzix --tail 60 2>&1
    echo "::endgroup::"
  fi
done

exit "$FAILED"
