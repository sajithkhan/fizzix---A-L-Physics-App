-- ST-43 / ST-44: free daily limit is enforced on the server; Premium removes it.
-- Students cannot grant themselves Premium.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, phone) values
  ('11111111-1111-1111-1111-111111111111', '+94770000001'),
  ('33333333-3333-3333-3333-333333333333', '+94770000003');

insert into public.units (id, subject_id, position, names)
select 'a0000000-0000-0000-0000-000000000001', s.id, 1, '{"ta":"அளவீடு","si":"මිනුම්"}'
from public.subjects s where s.slug = 'physics';

-- Six live questions in the unit.
insert into public.questions (id, subject_id, unit_id, locale_code, difficulty, source)
select ('b0000000-0000-0000-0000-00000000000' || g)::uuid, s.id, 'a0000000-0000-0000-0000-000000000001', 'ta', 1, 'ai_variant'
from public.subjects s, generate_series(1, 6) g where s.slug = 'physics';

insert into public.question_versions (id, question_id, version, stem, options)
select ('c0000000-0000-0000-0000-00000000000' || g)::uuid, ('b0000000-0000-0000-0000-00000000000' || g)::uuid, 1,
       'Question number ' || g, '["a","b","c","d","e"]'
from generate_series(1, 6) g;

insert into public.question_keys (version_id, correct_option, explanation)
select ('c0000000-0000-0000-0000-00000000000' || g)::uuid, 1, '{}'::jsonb from generate_series(1, 6) g;

update public.questions q set status = 'live', live_version_id = v.id
from public.question_versions v where v.question_id = q.id;

update public.app_config set value = '3' where key = 'free_daily_mcq';

-- Premium user 3
insert into public.subscriptions (user_id, source, plan, status, current_period_end, external_ref)
values ('33333333-3333-3333-3333-333333333333', 'play', 'monthly', 'active', now() + interval '30 days', 'test-ref-1');

-- Free user 1 --------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);

select is(
  jsonb_array_length(public.get_practice_set('a0000000-0000-0000-0000-000000000001', 5) -> 'items'),
  3, 'free student gets only what is left of the daily limit'
);

select throws_ok(
  $$ select public.get_practice_set('a0000000-0000-0000-0000-000000000001', 5) $$,
  'P0402', 'daily_limit_reached',
  'free student is stopped once the daily limit is used'
);

select throws_ok(
  $$ insert into public.subscriptions (user_id, source, plan, status, current_period_end, external_ref)
     values ('11111111-1111-1111-1111-111111111111', 'manual', 'yearly', 'active', now() + interval '1 year', 'self') $$,
  '42501', null,
  'student cannot grant themselves Premium'
);

select is((select count(*)::int from public.subscriptions), 0, 'free student sees no subscriptions of others');

-- Premium user 3 -----------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);

select is(
  jsonb_array_length(public.get_practice_set('a0000000-0000-0000-0000-000000000001', 5) -> 'items'),
  5, 'premium student gets the full set size'
);

select is((select count(*)::int from public.subscriptions), 1, 'premium student sees their own subscription');

reset role;
select * from finish();
rollback;
