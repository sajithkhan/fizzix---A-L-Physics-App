# ADR-0011: Password reset with an OTP, through Edge Functions

- Status: Accepted
- Date: 2026-11-28

## Context

ST-55: a student who forgot the password resets it with an OTP to their number. The OTP may
go only to a number that has an account, resend after 45 seconds and at most 3 times an
hour, and after saving every other session must end.

The SMS hook already refuses registered numbers (`already_registered`), so sign-up never
sends an OTP to an existing account (ST-02). Supabase Auth keeps other sessions alive after
a password change, and the password Auth stores is derived on the server (ADR-0009).

## Decision

- `reset-request` Edge Function (public): validate → `reset_request()` (IP limit, registered
  account?, open a 10-minute reset intent stored as a hash) → Supabase Auth sends the OTP
  (`create_user: false`).
- The SMS hook sends to a registered number only while it has an open reset intent. The
  per-number limit (3 an hour) and Auth's 45-second resend wait apply to both paths.
- The app verifies the OTP with Supabase Auth, which gives a short OTP session.
- `reset-password` Edge Function (signed in): requires an OTP sign-in in the last 10 minutes
  (JWT `amr`), an open intent (`reset_allowed()`) and the sign-up password rules. It stores
  the derived password, closes the intent, lifts any login lock for the number and signs out
  every session (`admin.signOut(token, 'global')`). The app drops its local session and opens
  login with a note; the student logs in with the new password.
- A number without an account gets `not_registered`. Sign-up already reveals this, so it
  adds no new information, and it tells the student to register.
- If the student leaves after the OTP but before saving, the app drops the OTP session.

## Consequences

- Supabase skips the SMS hook for local test numbers, so "registered numbers only" is proven
  by pgTAP (`95_password_reset`) and the Edge Function tests; Maestro shows the
  `not_registered` path, which is decided before Auth is called.
- Changing a phone number later must keep the reset intent hashing (`otp_phone_hash`) in step
  with the SMS hook.
