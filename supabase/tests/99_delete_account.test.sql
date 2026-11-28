-- ST-57 Delete my account: personal and study data go; payment records the law requires stay,
-- without the student.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, phone, encrypted_password) values
  ('11111111-1111-1111-1111-111111111111', '94771111111', 'x'),
  ('22222222-2222-2222-2222-222222222222', '94772222222', 'x');
update public.profiles set display_name = 'Arjun', account_completed_at = now()
where id = '11111111-1111-1111-1111-111111111111';
insert into public.consents (user_id, notice_version, age_band)
values ('11111111-1111-1111-1111-111111111111', '2026-11', '16_plus');
insert into public.subscriptions (user_id, source, plan, status, current_period_end, external_ref) values
  ('11111111-1111-1111-1111-111111111111', 'play', 'monthly', 'active', now() + interval '20 days', 'GPA.1111'),
  ('22222222-2222-2222-2222-222222222222', 'play', 'monthly', 'active', now() + interval '20 days', 'GPA.2222');
insert into private.rate_limits (user_id, action, window_start, hits)
values ('11111111-1111-1111-1111-111111111111', 'consent', now(), 1);

select ok(
  has_function_privilege('service_role', 'public.prepare_account_deletion(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.prepare_account_deletion(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.prepare_account_deletion(uuid)', 'execute'),
  'only Edge Functions can start a deletion'
);
select ok((select relrowsecurity from pg_class where oid = 'private.retained_payments'::regclass),
  'kept payment records have row level security on');
select hasnt_column('private', 'retained_payments', 'user_id', 'kept payments have no link to the student');

set local role service_role;
select is(public.prepare_account_deletion('11111111-1111-1111-1111-111111111111'), 1,
  'the student''s payment record is kept');
select is(public.prepare_account_deletion('11111111-1111-1111-1111-111111111111'), 0,
  'running it again keeps no duplicate');
reset role;

select is((select external_ref from private.retained_payments), 'GPA.1111',
  'only this student''s payment is kept');
select is((select count(*)::int from private.rate_limits where user_id = '11111111-1111-1111-1111-111111111111'), 0,
  'data outside the profile (rate limits) is removed');
select ok(
  exists (select 1 from public.audit_log where action = 'account_deleted' and entity_id is null and actor_id is null),
  'the deletion is in the audit log, without who it was'
);

-- Step 2: the Edge Function deletes the Auth user; everything personal cascades.
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select is((select count(*)::int from public.profiles where id = '11111111-1111-1111-1111-111111111111'), 0,
  'the profile is gone');
select is((select count(*)::int from public.consents where user_id = '11111111-1111-1111-1111-111111111111'), 0,
  'consents are gone');
select is((select count(*)::int from public.subscriptions where user_id = '11111111-1111-1111-1111-111111111111'), 0,
  'the live subscription row is gone (the kept copy stays)');
select is((select count(*)::int from private.retained_payments), 1,
  'the kept payment record survives the deletion');

select * from finish();
rollback;
