-- ST-02 Register with phone number and OTP: the server-side checks before any SMS is sent.
-- Supabase Auth calls private.send_sms_hook(event) for every OTP. It must:
--   * accept Sri Lankan mobile numbers only (+94 7X XXX XXXX)
--   * refuse numbers that already have an account (they log in with a password, ST-54)
--   * allow at most 3 OTPs per number per hour
--   * never store the phone number in clear in its own log
--   * fail closed when no SMS provider is configured
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

create function pg_temp.event(p_phone text, p_otp text default '123456') returns jsonb
language sql as $$
  select jsonb_build_object(
    'user', jsonb_build_object('id', gen_random_uuid(), 'phone', p_phone),
    'sms', jsonb_build_object('otp', p_otp)
  )
$$;

create function pg_temp.err(p_result jsonb) returns text
language sql as $$ select p_result -> 'error' ->> 'message' $$;

create function pg_temp.status(p_result jsonb) returns int
language sql as $$ select (p_result -> 'error' ->> 'http_code')::int $$;

-- Who may call it ------------------------------------------------------------------------------
select ok(
  has_function_privilege('supabase_auth_admin', 'private.send_sms_hook(jsonb)', 'execute'),
  'Supabase Auth can call the hook'
);
select ok(
  not has_function_privilege('anon', 'private.send_sms_hook(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'private.send_sms_hook(jsonb)', 'execute'),
  'app users cannot call the hook directly'
);

-- No provider yet: fail closed ------------------------------------------------------------------
select is(
  pg_temp.err(private.send_sms_hook(pg_temp.event('94771111111'))), 'sms_unavailable',
  'without an SMS provider the hook refuses instead of pretending to send'
);

-- From here on, pretend a provider is configured and record what it would send.
create table pg_temp.sent (phone text, otp text);
create or replace function private.deliver_sms(p_phone text, p_otp text) returns boolean
language sql as $$ insert into pg_temp.sent values (p_phone, p_otp); select true $$;

-- Valid numbers ---------------------------------------------------------------------------------
select is(
  private.send_sms_hook(pg_temp.event('94772222222', '482913')), '{}'::jsonb,
  'a Sri Lankan mobile number gets an OTP'
);
select results_eq(
  $$ select phone, otp from pg_temp.sent $$,
  $$ values ('94772222222'::text, '482913'::text) $$,
  'the OTP is handed to the provider for that number'
);
select is(
  private.send_sms_hook(pg_temp.event('+94703333333')), '{}'::jsonb,
  'a leading + is accepted'
);

-- Invalid numbers --------------------------------------------------------------------------------
select is(pg_temp.err(private.send_sms_hook(pg_temp.event('14155550123'))), 'phone_not_supported',
  'a foreign number is refused');
select is(pg_temp.status(private.send_sms_hook(pg_temp.event('14155550123'))), 400,
  'a refused number is a 400');
select is(pg_temp.err(private.send_sms_hook(pg_temp.event('94112345678'))), 'phone_not_supported',
  'a Sri Lankan landline is refused');
select is(pg_temp.err(private.send_sms_hook(pg_temp.event('9477123456'))), 'phone_not_supported',
  'a number with a digit missing is refused');

-- Malformed events -------------------------------------------------------------------------------
select is(pg_temp.err(private.send_sms_hook('{"user": {"phone": "94774444444"}}'::jsonb)), 'invalid_input',
  'an event without an OTP is refused');
select is(pg_temp.err(private.send_sms_hook(pg_temp.event('94774444444', '12ab56'))), 'invalid_input',
  'an OTP that is not 6 digits is refused');

-- Already registered ------------------------------------------------------------------------------
insert into auth.users (id, phone) values ('11111111-1111-1111-1111-111111111111', '94775555555');
update public.profiles set username = 'arjun_27' where id = '11111111-1111-1111-1111-111111111111';

select is(pg_temp.err(private.send_sms_hook(pg_temp.event('94775555555'))), 'already_registered',
  'a number that already has an account is sent to login instead');

-- Rate limit: 3 per number per hour ----------------------------------------------------------------
select private.send_sms_hook(pg_temp.event('94776666666'));
select private.send_sms_hook(pg_temp.event('94776666666'));
select is(private.send_sms_hook(pg_temp.event('94776666666')), '{}'::jsonb,
  'the third OTP in an hour is still sent');
select is(pg_temp.err(private.send_sms_hook(pg_temp.event('94776666666'))), 'otp_rate_limited',
  'the fourth OTP in an hour is refused');

update private.sms_requests set requested_at = now() - interval '61 minutes';
select is(private.send_sms_hook(pg_temp.event('94776666666')), '{}'::jsonb,
  'an hour later the number can get an OTP again');

-- Local/CI test numbers --------------------------------------------------------------------------
-- Numbers listed in app_config.otp_test_numbers (seeded only by supabase/seed.sql, never in
-- production) pass the checks but are not handed to the SMS provider: Supabase uses the fixed
-- test OTP from config.toml for them.
insert into public.app_config (key, value) values ('otp_test_numbers', '["94770000001"]')
on conflict (key) do update set value = excluded.value;
truncate pg_temp.sent;

select is(private.send_sms_hook(pg_temp.event('94770000001')), '{}'::jsonb,
  'a configured test number succeeds');
select is((select count(*)::int from pg_temp.sent), 0,
  'a configured test number is never sent to the SMS provider');

-- Privacy -----------------------------------------------------------------------------------------
select ok(
  not exists (select 1 from private.sms_requests where phone_hash like '%9477%'),
  'the request log stores a hash, never the phone number'
);

select * from finish();
rollback;
