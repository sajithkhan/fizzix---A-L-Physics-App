-- ST-04 Create my account (Screen 1b).
-- After OTP the student sets name, username, password, exam year, stream and school. The
-- account counts as complete only when the details are saved AND a password exists, so a
-- student can never end up registered without a way to log in.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, phone) values
  ('11111111-1111-1111-1111-111111111111', '94770000011'),
  ('22222222-2222-2222-2222-222222222222', '94770000022');

-- Who may call ---------------------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.save_account_details(text, text, smallint, public.stream, text)', 'execute')
  and not has_function_privilege('anon', 'public.complete_account()', 'execute')
  and not has_function_privilege('anon', 'public.username_available(text)', 'execute'),
  'signed-out callers cannot use the account functions'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);

-- Validation ------------------------------------------------------------------------------------
select throws_ok($$ select public.save_account_details('', 'arjun_27', 2027::smallint, 'bio', null) $$,
  '22023', 'invalid_name', 'a name is required');
select throws_ok($$ select public.save_account_details(repeat('a', 61), 'arjun_27', 2027::smallint, 'bio', null) $$,
  '22023', 'invalid_name', 'a name longer than 60 characters is refused');
select throws_ok($$ select public.save_account_details('Arjun', 'ar', 2027::smallint, 'bio', null) $$,
  '22023', 'invalid_username', 'a username shorter than 3 characters is refused');
select throws_ok($$ select public.save_account_details('Arjun', 'arjun 27', 2027::smallint, 'bio', null) $$,
  '22023', 'invalid_username', 'a username with a space is refused');
select throws_ok($$ select public.save_account_details('Arjun', 'arjun_27', 2031::smallint, 'bio', null) $$,
  '22023', 'invalid_exam_year', 'an exam year outside the offered years is refused');
select throws_ok($$ select public.save_account_details('Arjun', 'arjun_27', 2027::smallint, 'bio', repeat('s', 121)) $$,
  '22023', 'invalid_school', 'a school name longer than 120 characters is refused');

-- Save details ----------------------------------------------------------------------------------
select lives_ok($$ select public.save_account_details('  Arjun Kumar ', 'Arjun_27', 2027::smallint, 'bio', '  ') $$,
  'valid details are saved');
select results_eq(
  $$ select display_name, username::text, exam_year::int, stream::text, school from public.profiles
     where id = '11111111-1111-1111-1111-111111111111' $$,
  $$ values ('Arjun Kumar'::text, 'Arjun_27'::text, 2027, 'bio'::text, null::text) $$,
  'name is trimmed and an empty school is stored as none'
);

-- Username availability ---------------------------------------------------------------------------
select is(public.username_available('arjun_27'), true, 'my own username counts as available to me');
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select is(public.username_available('ARJUN_27'), false, 'a taken username is unavailable, ignoring case');
select is(public.username_available('kavi_s'), true, 'a free username is available');
select is(public.username_available('no spaces'), false, 'an invalid username is reported unavailable');
select throws_ok($$ select public.save_account_details('Kavi', 'arjun_27', 2028::smallint, 'maths', null) $$,
  '23505', 'username_taken', 'another student cannot take the same username');

-- Completion requires a password --------------------------------------------------------------------
select throws_ok($$ select public.complete_account() $$,
  'P0001', 'details_missing', 'an account without details cannot be completed');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
select throws_ok($$ select public.complete_account() $$,
  'P0001', 'password_not_set', 'an account without a password cannot be completed');

reset role;
update auth.users set encrypted_password = '$2a$10$fakehashfakehashfakehashfakehashfakehashfakehashfakeha'
where id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);

select lives_ok($$ select public.complete_account() $$, 'with details and a password the account is completed');
select isnt(
  (select account_completed_at from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  null, 'the completion time is recorded'
);
select lives_ok($$ select public.complete_account() $$, 'completing twice is harmless');

select throws_ok($$ select public.save_account_details('Arjun', 'arjun_x', 2027::smallint, 'bio', null) $$,
  'P0001', 'account_already_completed', 'sign-up details cannot be overwritten through this step');

select throws_ok(
  $$ update public.profiles set account_completed_at = null where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501', null, 'a student cannot change the completion flag directly'
);

-- A completed account no longer receives sign-up OTPs ----------------------------------------------
reset role;
select is(
  private.send_sms_hook('{"user": {"phone": "94770000011"}, "sms": {"otp": "123456"}}'::jsonb) -> 'error' ->> 'message',
  'already_registered', 'the SMS hook treats a completed account as registered'
);

select * from finish();
rollback;
