-- Every table exposed through the API must have Row Level Security enabled.
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}')
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  '{}'::text[],
  'all public tables have RLS enabled'
);

select ok(
  not has_table_privilege('authenticated', 'private.rate_limits', 'select'),
  'students cannot read rate limit counters'
);

select ok(
  not has_function_privilege('anon', 'public.get_practice_set(uuid, integer)', 'execute')
  and not has_function_privilege('anon', 'public.submit_answer(uuid, smallint)', 'execute'),
  'anonymous callers cannot fetch questions or submit answers'
);

select * from finish();
rollback;
