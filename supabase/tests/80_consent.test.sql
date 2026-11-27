-- ST-58 Agree to privacy and confirm age at sign-up (Screen 1b).
-- The student accepts the current privacy notice and picks an age range. Consent is recorded
-- only through record_consent(), so the version always matches the notice the app showed.
-- Under 16 needs a parent's confirmation before Premium or parent reports (checked on the
-- server by private.parent_confirmation_pending()).
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (id, phone, encrypted_password) values
  ('11111111-1111-1111-1111-111111111111', '94770000011', '$2a$10$fakehash'),
  ('22222222-2222-2222-2222-222222222222', '94770000022', '$2a$10$fakehash');

-- Configuration -------------------------------------------------------------------------------
select ok(
  (select is_public and value ? 'version' and value ? 'url'
   from public.app_config where key = 'privacy_notice'),
  'the current privacy notice (version and link) is public config'
);

-- Who may call --------------------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.record_consent(text, public.age_band)', 'execute')
  and not has_function_privilege('anon', 'public.consent_status()', 'execute'),
  'signed-out callers cannot use the consent functions'
);
select ok(
  not has_function_privilege('authenticated', 'private.parent_confirmation_pending(uuid)', 'execute'),
  'students cannot call the parent-confirmation check directly'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);

-- Direct writes are closed ----------------------------------------------------------------------
select throws_ok(
  $$ insert into public.consents (user_id, notice_version, age_band)
     values ('11111111-1111-1111-1111-111111111111', '2026-11', '16_plus') $$,
  '42501', null, 'consent cannot be inserted directly, only through record_consent'
);
select throws_ok(
  $$ update public.profiles set age_band = 'under_16' where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501', null, 'the age range cannot be changed directly on the profile'
);

-- Status before consent --------------------------------------------------------------------------
select is(
  (select accepted from public.consent_status()), false,
  'before consenting, the status says the current notice is not accepted'
);
select is(
  (select current_version from public.consent_status()),
  (select value ->> 'version' from public.app_config where key = 'privacy_notice'),
  'the status names the current notice version'
);

-- Validation ------------------------------------------------------------------------------------
select throws_ok($$ select public.record_consent('1999-01', '16_plus') $$,
  '22023', 'notice_outdated', 'accepting a version other than the current one is refused');
select throws_ok(
  $$ select public.record_consent((select value ->> 'version' from public.app_config where key = 'privacy_notice'), null) $$,
  '22023', 'invalid_age_band', 'an age range is required'
);

-- The account cannot be completed without consent ------------------------------------------------
select lives_ok($$ select public.save_account_details('Arjun', 'arjun_27', 2027::smallint, 'bio', null) $$,
  'details are saved');
select throws_ok($$ select public.complete_account() $$,
  'P0001', 'consent_missing', 'an account cannot be completed before the privacy notice is accepted');

-- Record consent --------------------------------------------------------------------------------
select lives_ok(
  $$ select public.record_consent((select value ->> 'version' from public.app_config where key = 'privacy_notice'), '16_plus') $$,
  'the current notice is accepted with an age range'
);
select results_eq(
  $$ select c.notice_version, c.age_band::text, c.accepted_at is not null
     from public.consents c where c.user_id = '11111111-1111-1111-1111-111111111111' $$,
  $$ select (select value ->> 'version' from public.app_config where key = 'privacy_notice'), '16_plus'::text, true $$,
  'the accepted version, age range and time are saved'
);
select is(
  (select age_band::text from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  '16_plus', 'the profile carries the age range'
);
select lives_ok(
  $$ select public.record_consent((select value ->> 'version' from public.app_config where key = 'privacy_notice'), '16_plus') $$,
  'accepting again is harmless (the button can be pressed twice)'
);
select is((select count(*)::int from public.consents), 1, 'pressing twice keeps one consent row');
select is((select accepted from public.consent_status()), true, 'the status now says accepted');
select lives_ok($$ select public.complete_account() $$, 'with consent the account is completed');

-- A new notice version asks again ----------------------------------------------------------------
reset role;
update public.app_config set value = jsonb_set(value, '{version}', '"2099-01"') where key = 'privacy_notice';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
select is((select accepted from public.consent_status()), false,
  'after a new notice version the status asks again');
select lives_ok($$ select public.record_consent('2099-01', '16_plus') $$,
  'a completed account can accept the new version');
select is((select count(*)::int from public.consents), 2, 'each accepted version is kept as its own row');

-- Under 16 -------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select lives_ok($$ select public.record_consent('2099-01', 'under_16') $$, 'a student under 16 can consent');
select is((select parent_confirmation_pending from public.consent_status()), true,
  'under 16 shows that a parent still needs to confirm');

reset role;
select ok(
  private.parent_confirmation_pending('22222222-2222-2222-2222-222222222222')
  and not private.parent_confirmation_pending('11111111-1111-1111-1111-111111111111'),
  'the server check flags only the under-16 student'
);

select * from finish();
rollback;
