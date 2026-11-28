-- ST-56 Change my password: the current password is checked on the server without signing in.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, phone, encrypted_password) values
  ('11111111-1111-1111-1111-111111111111', '94771111111', extensions.crypt('Fz1-current', extensions.gen_salt('bf'))),
  ('22222222-2222-2222-2222-222222222222', '94772222222', null);

select ok(
  has_function_privilege('service_role', 'public.edge_password_matches(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.edge_password_matches(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.edge_password_matches(uuid, text)', 'execute'),
  'only Edge Functions can check a password (no guessing through the API)'
);

set local role service_role;
select is(public.edge_password_matches('11111111-1111-1111-1111-111111111111', 'Fz1-current'), true,
  'the right current password matches');
select is(public.edge_password_matches('11111111-1111-1111-1111-111111111111', 'Fz1-wrong'), false,
  'a wrong one does not');
select is(public.edge_password_matches('11111111-1111-1111-1111-111111111111', null), false,
  'no password never matches');
select is(public.edge_password_matches('22222222-2222-2222-2222-222222222222', ''), false,
  'an account without a password never matches');
select is(public.edge_password_matches('33333333-3333-3333-3333-333333333333', 'Fz1-current'), false,
  'an unknown user never matches');
reset role;

select * from finish();
rollback;
