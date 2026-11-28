-- ADR-0017: API roles get exactly the table privileges written in the migrations, the same
-- on local, CI and hosted projects. Hosted projects grant nothing by default, so anything
-- missing here breaks the app in staging and production.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

-- Public reference data: read-only for everyone.
select table_privs_are('public', t, 'anon', array['SELECT'], t || ': anon may only read')
  from unnest(array['brand_config', 'locales', 'subjects', 'units', 'topics', 'app_config',
                    'feature_flags']) t;
select table_privs_are('public', t, 'authenticated', array['SELECT'], t || ': students only read')
  from unnest(array['brand_config', 'locales', 'subjects', 'units', 'topics']) t;
select table_privs_are('public', t, 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
                       t || ': admin-managed through RLS')
  from unnest(array['app_config', 'feature_flags']) t;

-- A student's own rows.
select table_privs_are('public', t, 'authenticated', array['SELECT'], t || ': read own rows')
  from unnest(array['profiles', 'consents', 'subscriptions', 'audit_log', 'practice_sets',
                    'practice_set_items', 'attempts']) t;
select table_privs_are('public', 'daily_targets', 'authenticated',
                       array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'daily_targets: own targets');
select table_privs_are('public', 'error_reports', 'authenticated', array['SELECT', 'UPDATE'],
                       'error_reports: read and update through RLS');
select column_privs_are('public', 'profiles', 'username', 'authenticated', array['SELECT', 'UPDATE'],
                        'profiles: students may edit their own username');
select column_privs_are('public', 'profiles', 'role', 'authenticated', array['SELECT'],
                        'profiles: students cannot change their role');

-- Content.
select table_privs_are('public', 'questions', 'authenticated',
                       array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'questions: through RLS');
select table_privs_are('public', t, 'authenticated', array['SELECT', 'INSERT'],
                       t || ': versions are never edited in place')
  from unnest(array['question_versions', 'question_keys']) t;

-- Nothing that ignores RLS, and nothing for anon beyond reference data.
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated')
      and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')),
  0, 'no TRUNCATE, TRIGGER or REFERENCES for API roles'
);

-- A table created later gets nothing until its migration grants it.
create table public.grants_probe (id int primary key);
select ok(
  not has_table_privilege('authenticated', 'public.grants_probe', 'select')
    and not has_table_privilege('anon', 'public.grants_probe', 'select')
    and has_table_privilege('service_role', 'public.grants_probe', 'select'),
  'new tables are closed to API roles by default, open to service_role'
);

select * from finish();
rollback;
