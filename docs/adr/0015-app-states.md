# ADR-0015 · Loading, offline, empty, error and limit states (ST-59)

Status: accepted · 2026-11-28

## Context

ST-59 asks every screen to handle loading, offline, empty, error and limit states the same
way, in plain Tamil and Sinhala. Most screens that need empty and limit states (units, sets,
MCQs, Premium) arrive in later stories, so this story ships the shared building blocks and
wires them into the screens that exist today.

## Decision

- **Skeletons, not spinners.** `ScreenSkeleton` replaces the old spinner on start-up and on
  the entry screen; Settings shows skeleton lines while the profile loads. Skeletons are
  static (no shimmer): kinder for reduced-motion users and they let UI automation see the
  screen settle.
- **Slow means retry.** `useSlow` turns true after 10 s of loading (`SLOW_AFTER_MS`). The
  entry screen then shows a plain message and "Try again", which re-runs the check.
- **Offline banner.** `@react-native-community/netinfo` (approved dependency, Expo-supported)
  feeds `useOnline()`. "Connected but no internet" counts as offline; "unknown" counts as
  online so the banner never flashes on start-up. The banner sits in the root layout, above
  every screen.
- **Empty, error and limit states** are shared components (`EmptyState`, `ErrorMessage` with
  an optional next step, `LimitState`). Limit text says the allowance and the hours until it
  resets, from `hoursUntilReset()` in `@fizzix/shared`: midnight Asia/Colombo, the same
  business-day rule the server uses. The client only explains a limit; the server decides it.
- **Plain words are tested.** A translation test fails if any string contains snake_case
  codes, HTTP statuses or words like "error", "token" or "SQL".

## Later stories

- The offline answer queue (answers sync later) ships with ST-15 (answer MCQ); downloaded
  sets and audio with ST-24. They reuse `useOnline()`.
- Units, sets and history screens use `EmptyState`; MCQ and Premium screens use `LimitState`
  with the allowance from the server's error response.

## Testing

Component tests cover every state in both languages (`app-states-test.tsx`). The Maestro
flow `st-59-app-states.yaml` turns airplane mode on and off on the emulator and checks the
banner; it always turns airplane mode off when it ends, and `run.sh` does too before retries.
