-- ST-15 / ST-17 and ADR-0002: students never read questions or answer keys directly;
-- answers are revealed only after submit_answer records an attempt.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- Fixture (as postgres) -------------------------------------------------------
insert into auth.users (id, phone) values
  ('11111111-1111-1111-1111-111111111111', '+94770000001'),
  ('22222222-2222-2222-2222-222222222222', '+94770000002');

insert into public.units (id, subject_id, position, names)
select 'a0000000-0000-0000-0000-000000000001', s.id, 1, '{"ta":"பொறிமுறை","si":"යාන්ත්‍ර විද්‍යාව"}'
from public.subjects s where s.slug = 'physics';

insert into public.questions (id, subject_id, unit_id, locale_code, difficulty, source)
select 'b0000000-0000-0000-0000-000000000001', s.id, 'a0000000-0000-0000-0000-000000000001', 'ta', 1, 'ai_variant'
from public.subjects s where s.slug = 'physics';

insert into public.question_versions (id, question_id, version, stem, options)
values ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 1,
        'ஒரு பந்து 20 m/s வேகத்துடன் மேல்நோக்கி எறியப்படுகிறது. உயர் உயரம்?',
        '["10 m","20 m","40 m","2 m","200 m"]');

insert into public.question_keys (version_id, correct_option, explanation)
values ('c0000000-0000-0000-0000-000000000001', 2, '{"theory":"v^2 = u^2 - 2gs"}');

update public.questions
set status = 'live', live_version_id = 'c0000000-0000-0000-0000-000000000001'
where id = 'b0000000-0000-0000-0000-000000000001';

-- Student A --------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);

select is((select count(*)::int from public.question_keys), 0, 'student cannot read answer keys');
select is((select count(*)::int from public.question_versions), 0, 'student cannot read question versions directly');
select is((select count(*)::int from public.questions), 0, 'student cannot list the question bank');

select lives_ok(
  $$ select set_config('test.set', public.get_practice_set('a0000000-0000-0000-0000-000000000001', 5)::text, true) $$,
  'student can fetch a practice set'
);

select is(jsonb_array_length(current_setting('test.set')::jsonb -> 'items'), 1, 'set contains the live question');
select ok(not (current_setting('test.set')::jsonb -> 'items' -> 0 ? 'correct_option'), 'served item carries no correct answer');
select ok(not (current_setting('test.set')::jsonb -> 'items' -> 0 ? 'explanation'), 'served item carries no explanation');

select set_config('test.item', current_setting('test.set')::jsonb -> 'items' -> 0 ->> 'item_id', true);

-- Student B cannot answer A's item -------------------------------------------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select throws_ok(
  format($$ select public.submit_answer(%L::uuid, 2::smallint) $$, current_setting('test.item')),
  '22023', 'unknown_item',
  'another student cannot answer someone else''s item'
);
select is((select count(*)::int from public.practice_set_items), 0, 'another student cannot see A''s set items');

-- Back to A: answer, then the key is revealed --------------------------------
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
select set_config('test.result',
  public.submit_answer(current_setting('test.item')::uuid, 1::smallint)::text, true);

select is((current_setting('test.result')::jsonb ->> 'is_correct')::boolean, false, 'wrong option is marked wrong');
select is((current_setting('test.result')::jsonb ->> 'correct_option')::int, 2, 'correct option revealed after answering');
select is((select count(*)::int from public.attempts), 1, 'attempt recorded for the student');

select throws_ok(
  format($$ select public.submit_answer(%L::uuid, 2::smallint) $$, current_setting('test.item')),
  '23505', 'already_answered',
  'an item can be answered only once'
);

select throws_ok(
  $$ select public.submit_answer('00000000-0000-0000-0000-000000000000'::uuid, 9::smallint) $$,
  '22023', 'invalid_option',
  'options outside 1-5 are rejected'
);

reset role;
select * from finish();
rollback;
