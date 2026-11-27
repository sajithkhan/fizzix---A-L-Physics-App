# ADR-0007: An account is complete only with details and a password

- Status: Accepted
- Date: 2026-11-27

## Context

ST-04 finishes sign-up after the OTP step (ST-02). Setting the password goes through
Supabase Auth (`updateUser`), while the profile is saved through our own SQL function. These
are two separate calls, so a phone could lose connection between them.

If "registered" meant "has a username", a student whose password call failed would be
locked out: the SMS hook would refuse a new OTP (already registered) and there would be no
password to log in with.

## Decision

- Three idempotent steps (ST-58 adds a consent step after the details, see ADR-0008):
  `save_account_details()` → `auth.updateUser({ password })` →
  `complete_account()`.
- `complete_account()` sets `profiles.account_completed_at` only when the details exist
  **and** `auth.users` has a password. Students cannot set this column directly.
- "Registered" (SMS hook, app routing) means `account_completed_at is not null`.
- Password policy: at least 8 characters with letters and digits (Supabase Auth setting,
  mirrored in `@fizzix/shared` for instant feedback). Decided with the owner on 2026-11-27.
- Exam years offered at sign-up come from `app_config.exam_years`.

## Consequences

- A half-finished sign-up resumes at the account screen on next launch, and can still get a
  new OTP if the session is lost.
- The production project's Auth settings must match `config.toml` (minimum length 8,
  letters and digits).
