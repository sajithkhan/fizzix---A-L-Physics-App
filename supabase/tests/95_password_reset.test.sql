-- ST-55 Reset a forgotten password (Screen 1c).
-- The OTP goes only to a number that has an account, and only after the reset-request Edge
-- Function opened a reset intent. The reset-password Edge Function may set a new password
-- only while the intent is open. Only the service role (Edge Functions) calls these.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

create function pg_temp.event(p_phone text) returns jsonb
language sql as $$
  select jsonb_build_object(
    'user', jsonb_build_object('id', gen_random_uuid(), 'phone', p_phone),
    'sms', jsonb_build_object('otp', '123456')
  )
$$;
create function pg_temp.err(p_result jsonb) returns text
language sql as $$ select p_result -> 'error' ->> 'message' $$;

-- A registered student (finished account) and a half-finished sign-up.
insert into auth.users (id, phone, encrypted_password) values
  ('11111111-1111-1111-1111-111111111111', '94771111111', 'x'),
  ('22222222-2222-2222-2222-222222222222', '94772222222', null);
update public.profiles set account_completed_at = now()
where id = '11111111-1111-1111-1111-111111111111';

-- Who may call ----------------------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.reset_request(text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.reset_request(text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.reset_allowed(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.reset_finished(uuid)', 'execute'),
  'the app cannot open or close reset intents itself'
);
select ok(
  has_function_privilege('service_role', 'public.reset_request(text, text)', 'execute')
  and has_function_privilege('service_role', 'public.reset_allowed(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.reset_finished(uuid)', 'execute'),
  'Edge Functions (service role) can'
);
select ok((select relrowsecurity from pg_class where oid = 'private.reset_intents'::regclass),
  'reset intents have row level security on');

-- Without a reset request, a registered number still gets no OTP (sign-up path) ----------------
select is(pg_temp.err(private.send_sms_hook(pg_temp.event('94771111111'))), 'already_registered',
  'no reset requested: a registered number gets no OTP');

-- Requesting a reset -----------------------------------------------------------------------------
set local role service_role;
select is(public.reset_request('94779999999', repeat('a', 64)), 'not_registered',
  'a number without an account is told so and gets no intent');
select is(public.reset_request('94772222222', repeat('a', 64)), 'not_registered',
  'a half-finished sign-up is not an account yet');
select is(public.reset_request('12345', repeat('a', 64)), 'phone_not_supported',
  'only Sri Lankan mobiles');
select throws_ok($$ select public.reset_request('94771111111', 'raw-ip') $$,
  '22023', 'invalid_input', 'the IP must be an HMAC key');
select is(public.reset_request('94771111111', repeat('a', 64)), 'ok',
  'a registered number gets a reset intent');
select is(public.reset_allowed('11111111-1111-1111-1111-111111111111'), true,
  'while the intent is open the password may be reset');
select is(public.reset_allowed('22222222-2222-2222-2222-222222222222'), false,
  'another account may not');
reset role;

select ok(
  (select count(*) = 1 and bool_and(phone_hash !~ '9477') from private.reset_intents),
  'the intent stores a hash, never the number'
);

-- The OTP is now allowed, still within 3 per hour --------------------------------------------------
-- (as a local test number, so the fail-closed SMS sender is not reached)
insert into public.app_config (key, value) values ('otp_test_numbers', '["94771111111"]')
on conflict (key) do update set value = public.app_config.value || '["94771111111"]';
select is(private.send_sms_hook(pg_temp.event('94771111111')), '{}'::jsonb,
  'with a reset intent the registered number gets its OTP');
do $$ begin
  perform private.send_sms_hook(pg_temp.event('94771111111'));
  perform private.send_sms_hook(pg_temp.event('94771111111'));
end $$;
select is(pg_temp.err(private.send_sms_hook(pg_temp.event('94771111111'))), 'otp_rate_limited',
  'the 3-per-hour limit applies to reset OTPs too');

-- The intent expires --------------------------------------------------------------------------------
update private.reset_intents set expires_at = now() - interval '1 second';
set local role service_role;
select is(public.reset_allowed('11111111-1111-1111-1111-111111111111'), false,
  'after 10 minutes the reset window closes');

-- Finishing closes the intent -------------------------------------------------------------------------
do $$ begin
  perform public.reset_request('94771111111', repeat('b', 64));
  perform public.reset_finished('11111111-1111-1111-1111-111111111111');
end $$;
select is(public.reset_allowed('11111111-1111-1111-1111-111111111111'), false,
  'after the new password is saved the same window cannot be reused');

-- Too many reset requests from one IP --------------------------------------------------------------
reset role;
update public.app_config set value = '1' where key = 'reset_per_ip_15min';
set local role service_role;
select is(public.reset_request('94771111111', repeat('c', 64)), 'ok', 'first request from an IP');
select is(public.reset_request('94771111111', repeat('c', 64)), 'ip_limited',
  'past the limit the IP is refused');
reset role;
select * from finish();
rollback;
