# ADR-0014: Delete the account at once, keep only anonymous payment records

- Status: Accepted
- Date: 2026-11-28

## Context

ST-57: a student deletes the account from Settings with the password. Personal data must be
gone within 30 days; payment records the law requires are kept separately, without study
data. A Google Play subscription is not cancelled by deleting the account. Google Play also
requires every app with accounts to offer deletion in the app.

## Decision

- `delete-account` Edge Function (signed in, active session, 5 tries per 15 minutes): checks
  the password without signing in (`edge_password_matches`, ADR-0013), then:
  1. `prepare_account_deletion()` copies the student's subscription rows into
     `private.retained_payments` (source, plan, status, period end, order reference, dates;
     **no user id, no phone, no study data**), removes rate-limit rows and writes an audit
     row without the user's id. Safe to run twice.
  2. Deletes the Supabase Auth user. Every student table references `profiles` with
     `ON DELETE CASCADE`, so the profile, consents, practice, attempts, targets and reports go
     with it.
- Live data is removed immediately. "Within 30 days" is the promise because database backups
  keep it until they expire; production backup retention must stay at 30 days or less.
- The app forgets the session, keeps only the chosen language, and opens login with a note.
  The number can sign up again as a new student.
- The screen always states that a Google Play subscription continues until cancelled in
  Google Play and links to `play.google.com/store/account/subscriptions?package=…` (package
  from brand.json).

## Consequences

- Google Play's Data safety form also asks for a **web link** where users can request deletion
  without the app. That page is needed before release (production checklist).
- Finance exports read `private.retained_payments`; it cannot be tied back to a person.
