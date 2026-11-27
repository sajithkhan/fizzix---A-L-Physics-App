#!/usr/bin/env bash
# Runs every Maestro flow in this folder.
#
# 1. All flows in ONE `maestro test` session. Starting Maestro takes ~55 seconds on the CI
#    emulator (driver install and connect), so one session per flow made the next flow's
#    first wait time out. One session pays that cost once.
# 2. Any flow that failed gets one more try on its own (the emulator can still hiccup). A
#    flow that fails twice fails the job, and its screen and app log are printed.
#
# Usage: bash apps/mobile/e2e/run.sh   (emulator running, app installed)
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="${MAESTRO_OUT:-maestro-results}"
mkdir -p "$OUT"

adb logcat -c || true
if maestro test "$DIR" --format junit --output "$OUT/all.xml" --debug-output "$OUT/all"; then
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
  adb shell am force-stop lk.fizzix.app || true
  adb logcat -c || true
  if maestro test "$flow" --format junit --output "$OUT/$name-retry.xml" --debug-output "$OUT/$name-retry"; then
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
done

exit "$FAILED"
