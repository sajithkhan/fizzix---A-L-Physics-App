# ADR-0006: OTP sign-up through a Postgres Send SMS hook

- Status: Accepted
- Date: 2026-11-25

## Context

ST-02 sends a one-time code to a new student's phone. The rules about who may receive a code
(Sri Lankan mobiles only, not already registered, 3 per number per hour) must be enforced on
the server, and the SMS provider (a local gateway such as Text.lk) is not chosen yet.

## Decision

- Supabase Auth phone OTP (`signInWithOtp` / `verifyOtp`) with a **Postgres Send SMS hook**,
  `private.send_sms_hook(event)`. It validates, rate-limits and then calls
  `private.deliver_sms(phone, otp)`.
- A Postgres hook (not an HTTP Edge Function) because it runs inside the database with no
  webhook secret to manage, is covered by pgTAP, and needs no new dependency.
- `deliver_sms` returns false until a gateway is connected, so the hook **fails closed** with
  `sms_unavailable` instead of pretending a code was sent.
- The hook's per-number log stores a SHA-256 hash (fixed prefix), never the phone number in
  clear. This keeps numbers out of casual view and logs; it is not strong against brute force
  (the number space is small), so the table stays service-only and old rows are purged.
- Resend wait (45 s) is Supabase's `auth.sms.max_frequency`.
- Hook errors are codes (`phone_not_supported`, `already_registered`, `otp_rate_limited`,
  `sms_unavailable`); the app maps them to Tamil/Sinhala text.
- Local and CI use `[auth.sms.test_otp]` numbers (code 123456). The same numbers are listed in
  `app_config.otp_test_numbers` by `supabase/seed.sql` (local/CI only), so the hook lets
  them through without calling the SMS provider. Production has no such row, so no number
  can skip the provider there. Maestro runs against a real local Supabase in the E2E job.

## Consequences

- Connecting the gateway = replacing `deliver_sms` (pg_net HTTP call with the API key in
  Supabase Vault) plus a sender ID approval (about 3 weeks; start early December).
- In production, raise Supabase's project-wide `sms_sent` hourly limit (default 30).
- Purge `private.sms_requests` rows older than a day with a scheduled job (pg_cron) when
  scheduled jobs are introduced; until then the table only grows by real sign-up attempts.
- Password reset (ST-55) must add a "reset requested" path: today registered numbers never
  get a code.
- Sessions are stored with AsyncStorage until ST-05 moves them to secure storage.
- `config.toml` test numbers must never be copied to the production project.
