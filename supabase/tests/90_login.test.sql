-- ST-54 Log in with number and password (Screen 1).
-- The login Edge Function calls login_guard() before checking a password and login_result()
-- after. After 5 wrong tries the number is locked for 15 minutes. Only the service role
-- (inside Edge Functions) may call these.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- Who may call ----------------------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.login_guard(text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.login_guard(text, text)', 'execute')
  and not has_function_privilege('anon', 'public.login_result(text, boolean)', 'execute')
  and not has_function_privilege('authenticated', 'public.login_result(text, boolean)', 'execute'),
  'the app cannot call the lockout functions (it could reset its own counter)'
);
select ok(
  not has_function_privilege('authenticated', 'public.edge_rate_limit(uuid, text, integer, integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.edge_is_premium(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.edge_account_completed(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.edge_is_premium(uuid)', 'execute'),
  'the app cannot call the Edge Function helpers'
);
select ok(
  has_function_privilege('service_role', 'public.login_guard(text, text)', 'execute')
  and has_function_privilege('service_role', 'public.login_result(text, boolean)', 'execute')
  and has_function_privilege('service_role', 'public.edge_rate_limit(uuid, text, integer, integer)', 'execute'),
  'Edge Functions (service role) can call them'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'private.login_failures'::regclass)
  and (select relrowsecurity from pg_class where oid = 'private.login_ip_hits'::regclass),
  'the lockout tables have row level security on'
);

set local role service_role;

-- Input is checked --------------------------------------------------------------------------------
select throws_ok($$ select public.login_guard('94770000011', repeat('b', 64)) $$,
  '22023', 'invalid_input', 'a raw phone number is refused as a key (only HMAC keys are stored)');
select throws_ok($$ select public.login_result(repeat('a', 64), null) $$,
  '22023', 'invalid_input', 'the result must say success or failure');

-- Five wrong tries lock the number -----------------------------------------------------------------
select is(public.login_guard(repeat('a', 64), repeat('b', 64)), 'ok', 'a fresh number may try');
select is(public.login_result(repeat('a', 64), false), 'failed', 'wrong try 1');
select is(public.login_result(repeat('a', 64), false), 'failed', 'wrong try 2');
select is(public.login_result(repeat('a', 64), false), 'failed', 'wrong try 3');
select is(public.login_result(repeat('a', 64), false), 'failed', 'wrong try 4');
select is(public.login_guard(repeat('a', 64), repeat('b', 64)), 'ok', 'after 4 wrong tries the number may still try');
select is(public.login_result(repeat('a', 64), false), 'locked', 'the 5th wrong try locks the number');
select is(public.login_guard(repeat('a', 64), repeat('b', 64)), 'locked', 'a locked number cannot try');
select is(public.login_guard(repeat('c', 64), repeat('b', 64)), 'ok', 'another number is not affected');

-- The lock ends after 15 minutes ---------------------------------------------------------------------
reset role;
select ok(
  (select locked_until between now() + interval '14 minutes' and now() + interval '16 minutes'
   from private.login_failures where number_key = repeat('a', 64)),
  'the lock lasts 15 minutes'
);
update private.login_failures set locked_until = now() - interval '1 second' where number_key = repeat('a', 64);
set local role service_role;
select is(public.login_guard(repeat('a', 64), repeat('b', 64)), 'ok', 'after the lock ends the number may try again');
select is(public.login_result(repeat('a', 64), false), 'failed', 'and counting starts again from one');

-- A success clears the counter -----------------------------------------------------------------------
select is(public.login_result(repeat('a', 64), true), 'ok', 'a correct password is recorded');
reset role;
select is((select count(*)::int from private.login_failures where number_key = repeat('a', 64)), 0,
  'a correct password clears the wrong-try counter');

-- Too many attempts from one IP ---------------------------------------------------------------------
update public.app_config set value = '3' where key = 'login_ip_per_15min';
set local role service_role;
select is(
  (select array_agg(public.login_guard(repeat('d', 64), repeat('e', 64))) from generate_series(1, 3)),
  array['ok', 'ok', 'ok'], 'an IP may make attempts up to its limit'
);
select is(public.login_guard(repeat('f', 64), repeat('e', 64)), 'ip_limited',
  'past the limit the IP is refused, whichever number it tries');

select * from finish();
rollback;
