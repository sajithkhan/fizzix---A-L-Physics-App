#!/usr/bin/env bash
# Waits until a freshly booted emulator has settled before Maestro starts: boot finished,
# package manager ready and the CPU mostly idle. Also closes any "isn't responding" dialog.
set -u
adb wait-for-device
for i in $(seq 1 60); do
  [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ] && break
  sleep 2
done
adb shell pm list packages >/dev/null 2>&1 || sleep 5

# Wait (up to ~2 minutes) for the 1-minute load average to drop below 3.
for i in $(seq 1 24); do
  load=$(adb shell cat /proc/loadavg | awk '{print int($1)}')
  echo "emulator load: $load"
  [ "${load:-9}" -lt 3 ] && break
  sleep 5
done

# Dismiss a system "isn't responding" dialog if one is showing.
adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null 2>&1 || true
adb shell input keyevent KEYCODE_HOME >/dev/null 2>&1 || true
exit 0
