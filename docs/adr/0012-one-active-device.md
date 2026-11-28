# ADR-0012: One active device per account

- Status: Accepted
- Date: 2026-11-28

## Context

ST-06: an account is active on one phone at a time, so one subscription is not shared.
When the student signs in on a new phone, the old phone is signed out on its next request
and shows why.

## Decision

- `profiles.active_session_id` holds the account's active Supabase session. The **custom
  access token hook** (Free/Pro plan) sets it on every new sign-in (`password`, `otp`): login,
  sign-up and the reset OTP. The newest sign-in wins.
- The same hook **refuses to refresh** any other session (401 `signed_in_elsewhere`), so an
  old phone cannot get a new token.
- Access tokens stay valid until they expire (up to an hour), so the server also checks on
  each request: `private.check_rate_limit()`, which every student RPC calls first, raises
  `signed_in_elsewhere`; Edge Functions check `edge_session_active()` after verifying the
  token.
- The app asks `session_status()` when it opens and when it returns to the foreground. If
  this phone is no longer active it drops the local session and opens login with a short
  note. A normal logout shows no note.
- Students cannot write `active_session_id` (no column grant).

## Consequences

- Reading tables directly (for example a student's own profile) is not blocked for the old
  phone until its token expires. Everything that uses or changes study data goes through
  the checked RPCs. Practice stories must keep using `check_rate_limit()`.
- Supabase Auth runs the hook for every token. An error in it would block all sign-ins, so
  it is kept small and covered by pgTAP and the CI login smoke tests.
- Maestro shows the two-phone case by logging in "phone B" from the test machine
  (`e2e/scripts/other-phone-login.js`).
