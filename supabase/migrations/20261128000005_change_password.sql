-- ST-56 Change my password (Settings). ADR-0013.
--
-- The `change-password` Edge Function checks the current password with
-- edge_password_matches() (no sign-in, so no new session replaces this phone's), stores the
-- new derived password, then signs this phone in again with it.

create extension if not exists pgcrypto with schema extensions;

/**
 * Does `p_password` (already derived by the Edge Function, ADR-0009) match the password
 * Supabase Auth stores for this user? bcrypt check with pgcrypto; never returns the hash.
 */
create or replace function public.edge_password_matches(p_user uuid, p_password text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select u.encrypted_password is not null
       and u.encrypted_password <> ''
       and p_password is not null
       and extensions.crypt(p_password, u.encrypted_password) = u.encrypted_password
    from auth.users u
    where u.id = p_user
  ), false);
$$;
revoke all on function public.edge_password_matches(uuid, text) from public, anon, authenticated;
grant execute on function public.edge_password_matches(uuid, text) to service_role;
