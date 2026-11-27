# ADR-0008: Privacy consent and age range at sign-up

- Status: Accepted
- Date: 2026-11-28

## Context

ST-58 asks every new student to accept a privacy notice and give an age range on the
account screen (Screen 1b). Sri Lanka's Personal Data Protection Act, No. 9 of 2022 treats a
person under 16 as a child, whose data needs a parent's consent. When the notice changes,
students must accept the new version.

## Decision

- The current notice lives in `app_config.privacy_notice` as `{version, url}` (public, admin
  editable, white-label ready). The app opens only `https` links.
- Consent is written only through `record_consent(version, age_band)`. Direct inserts into
  `consents` and direct updates of `profiles.age_band` are revoked, so a stored version is
  always one the server knows and the profile age range always matches a consent row.
- One `consents` row per accepted version, with `accepted_at`. Rows are kept as history.
- `complete_account()` requires consent to the current version (`consent_missing`).
  App order: details → consent → password → complete. Each step is safe to repeat.
- On every open, a finished account calls `consent_status()`. If the current version is not
  accepted, the app shows the "notice updated" screen (age range pre-selected) before home.
  Offline, the app opens home and asks at the next open that reaches the server.
- Under 16: the app explains that a parent confirms by SMS before Premium or parent reports.
  `private.parent_confirmation_pending(user)` is the server check that Premium and parent
  features must call. The parent SMS itself ships with the parent stories (PA-xx); until
  then `parent_confirmed_at` stays null and those features stay closed to under-16 students.

## Consequences

- The full notice must be published at the configured URL (and in Play Console) before
  release; the seeded URL is a placeholder.
- The story limits parent confirmation to Premium and parent reports. Whether the PDPA needs
  a parent's consent before any processing of an under-16 student's data is a legal question
  for the owner to confirm with a lawyer; the age range and the server check make a stricter
  rule a small change.
- Changing the notice is one config update; every student is asked again on next open.
