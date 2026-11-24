-- AD-15 and audit rules: versions are immutable, the audit log is append-only and admin-only,
-- staff-only content tables stay closed to students.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, phone) values
  ('11111111-1111-1111-1111-111111111111', '+94770000001'),
  ('44444444-4444-4444-4444-444444444444', '+94770000004');
update public.profiles set role = 'admin' where id = '44444444-4444-4444-4444-444444444444';

insert into public.units (id, subject_id, position, names)
select 'a0000000-0000-0000-0000-000000000001', s.id, 1, '{"ta":"அளவீடு","si":"මිනුම්"}'
from public.subjects s where s.slug = 'physics';
insert into public.questions (id, subject_id, unit_id, locale_code, difficulty, source)
select 'b0000000-0000-0000-0000-000000000001', s.id, 'a0000000-0000-0000-0000-000000000001', 'ta', 2, 'ai_variant'
from public.subjects s where s.slug = 'physics';
insert into public.question_versions (id, question_id, version, stem, options)
values ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 1,
        'Original stem text', '["a","b","c","d","e"]');

select throws_ok(
  $$ update public.question_versions set stem = 'Changed stem text' where id = 'c0000000-0000-0000-0000-000000000001' $$,
  'P0001', 'question versions are immutable; create a new version instead',
  'question versions cannot be edited in place'
);

insert into public.audit_log (actor_id, action, entity, entity_id) values
  ('44444444-4444-4444-4444-444444444444', 'grant_premium', 'subscription', 'x');

select throws_ok(
  $$ delete from public.audit_log $$,
  'P0001', 'audit_log is append-only',
  'audit rows cannot be deleted'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
select is((select count(*)::int from public.audit_log), 0, 'students cannot read the audit log');

select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444"}', true);
select is((select count(*)::int from public.audit_log), 1, 'admins can read the audit log');
select is((select count(*)::int from public.question_versions), 1, 'staff can read question versions');

reset role;
select * from finish();
rollback;
