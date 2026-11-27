-- Local development and CI only. `supabase start` / `supabase db reset` load this file after
-- the migrations. It is never applied to the production project.

-- Test phone numbers for the OTP flow (ST-02). They must match [auth.sms.test_otp] in
-- config.toml, which gives them the fixed code 123456. The SMS hook lets them through
-- without calling the SMS provider.
insert into public.app_config (key, value, is_public) values
  ('otp_test_numbers', '["94770000001", "94770000002", "94770000003", "94770000004", "94770000005", "94770000006", "94770000007"]', false)
on conflict (key) do update set value = excluded.value, is_public = false;
