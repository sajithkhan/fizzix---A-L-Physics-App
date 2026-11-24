-- ST-01 Choose app language.
-- The language list comes from the database (white-label), English shows as "coming soon"
-- but cannot be chosen, the choice is saved to the profile and filters questions.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- Anyone (before sign-in) can read the language list -----------------------------------------
set local role anon;

select results_eq(
  $$ select code, is_enabled from public.locales order by sort_order, code $$,
  $$ values ('ta'::text, true), ('si'::text, true), ('en'::text, false) $$,
  'language list is Tamil, Sinhala, then English (not yet available)'
);

select ok(
  (select bool_and(native_name is not null and length(native_name) > 0) from public.locales),
  'every language has a native name to show'
);

select throws_ok(
  $$ update public.locales set is_enabled = true where code = 'en' $$,
  '42501', null,
  'the public cannot change the language list'
);

reset role;

-- Fixture -------------------------------------------------------------------------------------
insert into auth.users (id, phone) values ('11111111-1111-1111-1111-111111111111', '+94770000001');

insert into public.units (id, subject_id, position, names)
select 'a0000000-0000-0000-0000-000000000001', s.id, 1, '{"ta":"அளவீடு","si":"මිනුම්"}'
from public.subjects s where s.slug = 'physics';

insert into public.questions (id, subject_id, unit_id, locale_code, difficulty, source)
select ('b0000000-0000-0000-0000-00000000000' || g)::uuid, s.id, 'a0000000-0000-0000-0000-000000000001',
       case when g = 1 then 'ta' else 'si' end, 1, 'ai_variant'
from public.subjects s, generate_series(1, 2) g where s.slug = 'physics';

insert into public.question_versions (id, question_id, version, stem, options)
select ('c0000000-0000-0000-0000-00000000000' || g)::uuid, ('b0000000-0000-0000-0000-00000000000' || g)::uuid, 1,
       case when g = 1 then 'தமிழ் வினா' else 'සිංහල ප්‍රශ්නය' end, '["a","b","c","d","e"]'
from generate_series(1, 2) g;

update public.questions q set status = 'live', live_version_id = v.id
from public.question_versions v where v.question_id = q.id;

-- Student --------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);

select is(
  (select locale_code from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'ta', 'new profiles default to Tamil'
);

select lives_ok(
  $$ update public.profiles set locale_code = 'si' where id = '11111111-1111-1111-1111-111111111111' $$,
  'student can switch to Sinhala'
);

select throws_ok(
  $$ update public.profiles set locale_code = 'en' where id = '11111111-1111-1111-1111-111111111111' $$,
  '22023', 'locale_not_available',
  'student cannot pick a language that is not available yet'
);

select throws_ok(
  $$ update public.profiles set locale_code = 'fr' where id = '11111111-1111-1111-1111-111111111111' $$,
  '22023', 'locale_not_available',
  'student cannot pick an unknown language'
);

select set_config('test.set', public.get_practice_set('a0000000-0000-0000-0000-000000000001', 5)::text, true);

select is(
  jsonb_array_length(current_setting('test.set')::jsonb -> 'items'), 1,
  'a Sinhala student is served only Sinhala questions'
);

select is(
  current_setting('test.set')::jsonb -> 'items' -> 0 ->> 'stem', 'සිංහල ප්‍රශ්නය',
  'the served question is the Sinhala one'
);

reset role;
select * from finish();
rollback;
