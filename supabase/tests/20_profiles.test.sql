-- Profiles: students see and edit only their own profile, and can never change their role.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, phone) values
  ('11111111-1111-1111-1111-111111111111', '+94770000001'),
  ('22222222-2222-2222-2222-222222222222', '+94770000002');

select is((select count(*)::int from public.profiles
           where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')),
          2, 'a profile is created for every new user');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);

select is((select count(*)::int from public.profiles), 1, 'student sees only their own profile');

select lives_ok(
  $$ update public.profiles set display_name = 'Arjun', username = 'arjun_27', exam_year = 2027, stream = 'bio'
     where id = '11111111-1111-1111-1111-111111111111' $$,
  'student can update their own details'
);

select throws_ok(
  $$ update public.profiles set role = 'admin' where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501', null,
  'student cannot change their own role'
);

update public.profiles set display_name = 'Hacked' where id = '22222222-2222-2222-2222-222222222222';
reset role;
select is((select display_name from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
          null, 'student cannot change another student''s profile');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);

select lives_ok(
  $$ insert into public.consents (user_id, notice_version, age_band)
     values ('11111111-1111-1111-1111-111111111111', '2026-12', '16_plus') $$,
  'student can record their own consent'
);

select throws_ok(
  $$ insert into public.consents (user_id, notice_version, age_band)
     values ('22222222-2222-2222-2222-222222222222', '2026-12', '16_plus') $$,
  '42501', null,
  'student cannot record consent for someone else'
);

reset role;
select * from finish();
rollback;
