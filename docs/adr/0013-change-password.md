# ADR-0013: Change the password with the current one, keeping this phone signed in

- Status: Accepted
- Date: 2026-11-28

## Context

ST-56: in Settings the student changes the password by giving the current one and the new
one twice. No OTP is needed.

Two things make the obvious way wrong. Checking the current password by signing in would
create a new session, which (ST-06) becomes the active one and signs this very phone out.
And Supabase Auth ends every session when a password changes, so this phone would be
signed out anyway.

## Decision

- `change-password` Edge Function (signed in, active session only, 5 tries per 15 minutes):
  1. the new password follows the sign-up rules and differs from the current one;
  2. the current password is checked with `edge_password_matches()`: a bcrypt comparison
     (pgcrypto) against the derived password, with no sign-in and no session. Service role
     only, so it cannot be used to guess passwords through the API;
  3. the new derived password is stored, any login lock is lifted;
  4. the function signs in with the new password and returns that session. The app hands it
     to the Supabase client, so this phone stays signed in and becomes the active one; other
     phones are signed out.
- The Auth password sign-in code is shared by `login` and `change-password`
  (`_shared/auth-grant.ts`).

## Consequences

- A wrong current password does not count towards the login lock (ST-54), but it has its own
  limit (5 per 15 minutes per account).
- CI smoke test: change-password returns an active session, the old password is refused and
  the new one works.
