# ADR-0009: Password login through an Edge Function, with a derived password

- Status: Accepted
- Date: 2026-11-28

## Context

ST-54: students log in with phone number and password. After 5 wrong tries the number is
locked for 15 minutes, and wrong details must not reveal which field was wrong.

Supabase Auth can do password sign-in, but it has no per-number lockout. Its "password
verification" hook, which could count failures, is only on the Teams and Enterprise plans.
Any lockout we add in front of Auth is useless if the app's public anon key can still call
Auth's password sign-in directly.

## Decision

- **Login goes through the `login` Edge Function** (`verify_jwt = false`). It follows
  `_shared/handler.ts` (public variant): validate input → IP limit and number lock
  (`login_guard`) → Auth password grant → record the outcome (`login_result`) → return only
  the session tokens. The app hands the tokens to the Supabase client (`setSession`).
- **Supabase Auth never stores the real password.** Edge Functions store and check
  `derivePassword(pepper, phone, password)` = `"Fz1-" + base64url(HMAC-SHA256(pepper, …))`.
  The pepper is an Edge Function secret (`PASSWORD_PEPPER`). Calling Auth directly with
  guesses of the real password can never succeed, so the lockout cannot be bypassed. CI
  checks this: a direct Auth sign-in with the real password must fail.
- Setting the password at sign-up moves to the `set-password` Edge Function (ST-04 step 2),
  allowed only before the account is complete. Reset (ST-55) and change (ST-56) will use the
  same derivation.
- Lockout: `private.login_failures` per number key, `private.login_ip_hits` per IP key, in
  15-minute windows (`app_config`: `login_max_failures` 5, `login_lock_minutes` 15,
  `login_ip_per_15min` 30). Keys are HMACs with the same pepper, never phone numbers or IPs.
  Only the service role can call these functions.
- Wrong number and wrong password both return `invalid_credentials` and both count as a
  wrong try for that number. A locked number returns `login_locked`, whether or not it has an
  account, so neither answer reveals who is registered.
- Google sign-in (mentioned in ST-54) needs a Google Cloud OAuth client and a new
  dependency; it is a separate change, decided with the owner.

## Consequences

- The pepper must never change or leak. Changing it makes every stored password invalid
  (every student would need ST-55 reset). Store it in a password manager and in
  `supabase secrets` only.
- Changing a student's phone number later must re-derive the password (it is part of the
  HMAC input).
- Login adds one Edge Function hop. Refresh tokens still go directly to Supabase Auth.
- Old rows in the lockout tables should be cleaned up by a scheduled job (added with the
  first cron work).
