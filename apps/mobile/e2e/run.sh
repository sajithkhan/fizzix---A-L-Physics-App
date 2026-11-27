#!/usr/bin/env bash
# Runs every Maestro flow in this folder one by one. When a flow fails, it prints what was on
# screen and the app's log at that moment, so CI failures can be diagnosed from the job log.
# Usage: bash apps/mobile/e2e/run.sh   (emulator running, app installed)
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="${MAESTRO_OUT:-maestro-results}"
mkdir -p "$OUT"
FAILED=0

for flow in "$DIR"/*.yaml; do
  name="$(basename "$flow" .yaml)"
  adb logcat -c || true
  if maestro test "$flow" --format junit --output "$OUT/$name.xml" --debug-output "$OUT/$name"; then
    echo "PASSED $name"
  else
    # The CI emulator sometimes stalls on a cold start after clearState. Print what happened,
    # then give the flow one more try. A flow that fails twice fails the job.
    echo "::warning::$name failed on the first try; retrying once"
    echo "::group::$name: first try screen and log"
    maestro hierarchy 2>/dev/null | grep -oE '"(text|resource-id)" *: *"[^"]+"' | grep -v "com.android.systemui" | head -60
    adb logcat -d | grep -E "ReactNativeJS|AndroidRuntime|FATAL" | tail -40
    echo "::endgroup::"
    adb shell am force-stop lk.fizzix.app || true
    adb logcat -c || true
    if maestro test "$flow" --format junit --output "$OUT/$name.xml" --debug-output "$OUT/$name-retry"; then
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
  fi
done

exit "$FAILED"
