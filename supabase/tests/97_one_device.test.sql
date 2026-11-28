-- ST-06 One active device per account.
-- The newest sign-in becomes the active session. Another session cannot refresh its token,
-- cannot use the student RPCs, and session_status() tells the app it was signed out.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, phone, encrypted_password) values
  ('11111111-1111-1111-1111-111111111111', '94771111111', 'x');

create function pg_temp.token_event(p_method text, p_session text) returns jsonb
language sql as $$
  select jsonb_build_object(
    'user_id', '11111111-1111-1111-1111-111111111111',
    'authentication_method', p_method,
    'claims', jsonb_build_object(
      'sub', '11111111-1111-1111-1111-111111111111',
      'session_id', p_session,
      'role', 'authenticated'
    )
  )
$$;

create function pg_temp.as_session(p_session text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', '11111111-1111-1111-1111-111111111111', 'session_id', p_session)::text, true);
$$;

-- Who may call ------------------------------------------------------------------------------------
select ok(
  has_function_privilege('supabase_auth_admin', 'private.custom_access_token_hook(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'private.custom_access_token_hook(jsonb)', 'execute')
  and not has_function_privilege('anon', 'private.custom_access_token_hook(jsonb)', 'execute'),
  'only Supabase Auth runs the token hook'
);
select ok(
  has_function_privilege('service_role', 'public.edge_session_active(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.edge_session_active(uuid, uuid)', 'execute'),
  'only Edge Functions use the session check helper'
);
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'active_session_id', 'update'),
  'a student cannot choose the active session'
);

-- Phone A signs in ---------------------------------------------------------------------------------
select is(
  private.custom_access_token_hook(pg_temp.token_event('password', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')) -> 'claims' ->> 'session_id',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a sign-in gets its token with the claims unchanged'
);
select is(
  (select active_session_id::text from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'the sign-in becomes the active session'
);
select ok(
  private.custom_access_token_hook(pg_temp.token_event('token_refresh', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')) ? 'claims',
  'the active session can refresh its token'
);

set local role authenticated;
select pg_temp.as_session('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select is(public.session_status(), true, 'phone A is told it is the active session');
reset role;

-- Phone B signs in (OTP or password) ------------------------------------------------------------------
select ok(
  private.custom_access_token_hook(pg_temp.token_event('otp', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')) ? 'claims',
  'phone B signs in'
);
select is(
  (select active_session_id::text from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'phone B is now the active session'
);

-- Phone A on its next request -----------------------------------------------------------------------
select is(
  private.custom_access_token_hook(pg_temp.token_event('token_refresh', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')) -> 'error' ->> 'message',
  'signed_in_elsewhere', 'phone A cannot refresh its token any more'
);
select is(
  (private.custom_access_token_hook(pg_temp.token_event('token_refresh', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')) -> 'error' ->> 'http_code')::int,
  401, 'and Auth answers 401'
);

set local role authenticated;
select pg_temp.as_session('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select is(public.session_status(), false, 'phone A is told it was signed out');
select throws_ok(
  $$ select public.record_consent('2026-11', '16_plus') $$,
  '28000', 'signed_in_elsewhere', 'phone A can no longer use the student functions'
);

select pg_temp.as_session('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select is(public.session_status(), true, 'phone B works normally');
reset role;

set local role service_role;
select ok(
  public.edge_session_active('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
  and not public.edge_session_active('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'Edge Functions see the same answer'
);
reset role;

-- A token without a user or session is passed through untouched ----------------------------------------
select is(
  private.custom_access_token_hook('{"claims": {"role": "anon"}}'::jsonb),
  '{"claims": {"role": "anon"}}'::jsonb, 'tokens without a session are not changed'
);

select * from finish();
rollback;
