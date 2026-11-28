-- ST-06 One active device per account. ADR-0012.
--
-- The newest sign-in (password login, or an OTP at sign-up / reset) becomes the account's
-- active session (profiles.active_session_id). Any other session is refused:
--   * Supabase Auth will not refresh its token (custom access token hook below);
--   * every rate-limited RPC (practice, answers, reports, account, consent) answers
--     `signed_in_elsewhere`, through private.check_rate_limit();
--   * Edge Functions refuse it (edge_session_active());
--   * the app asks session_status() when it opens or comes back, and shows why it signed out.

-- Session id of the caller's access token (auth.jwt() is Supabase's claims accessor).
create or replace function private.jwt_session_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(
    coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'session_id', ''),
    ''
  )::uuid;
$$;
revoke all on function private.jwt_session_id() from public;

/** True when this session is the account's active one (or none is recorded yet). */
create or replace function private.session_is_active(p_user uuid, p_session uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.active_session_id is null or p.active_session_id = p_session
     from public.profiles p where p.id = p_user),
    true
  );
$$;
revoke all on function private.session_is_active(uuid, uuid) from public;

/** Is the caller's session still the active one? The app asks on open and on resume. */
create or replace function public.session_status()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  return private.session_is_active(v_user, private.jwt_session_id());
end;
$$;
revoke all on function public.session_status() from public, anon;
grant execute on function public.session_status() to authenticated;

/** For Edge Functions (service role): is this user's session the active one? */
create or replace function public.edge_session_active(p_user uuid, p_session uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.session_is_active(p_user, p_session);
$$;
revoke all on function public.edge_session_active(uuid, uuid) from public, anon, authenticated;
grant execute on function public.edge_session_active(uuid, uuid) to service_role;

-- Same as 20261124000004_platform.sql, plus the one-device check. Every student RPC that
-- reads or writes study data calls this first.
create or replace function private.check_rate_limit(p_action text, p_max integer, p_window_seconds integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not private.session_is_active(v_user, private.jwt_session_id()) then
    raise exception 'signed_in_elsewhere' using errcode = '28000';
  end if;
  insert into private.rate_limits (user_id, action, window_start, hits)
  values (v_user, p_action, v_window, 1)
  on conflict (user_id, action, window_start) do update set hits = private.rate_limits.hits + 1
  returning hits into v_hits;
  if v_hits > p_max then
    raise exception 'rate_limited' using errcode = 'P0429', hint = p_action;
  end if;
end;
$$;
revoke all on function private.check_rate_limit(text, integer, integer) from public;

/**
 * Supabase Auth custom access token hook (config.toml [auth.hook.custom_access_token]).
 * Runs before every token is issued. A new sign-in makes its session the active one; a
 * refresh of any other session is refused, so the old phone is signed out.
 */
create or replace function private.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := nullif(event ->> 'user_id', '')::uuid;
  v_method text := event ->> 'authentication_method';
  v_session uuid := nullif(event -> 'claims' ->> 'session_id', '')::uuid;
begin
  if v_user is null or v_session is null then
    return jsonb_build_object('claims', event -> 'claims');
  end if;

  if v_method in ('password', 'otp') then
    update public.profiles set active_session_id = v_session where id = v_user;
  elsif v_method = 'token_refresh' and not private.session_is_active(v_user, v_session) then
    return jsonb_build_object(
      'error', jsonb_build_object('http_code', 401, 'message', 'signed_in_elsewhere')
    );
  end if;

  return jsonb_build_object('claims', event -> 'claims');
end;
$$;
revoke all on function private.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function private.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- Students cannot pick their own active session (no update grant on the column).
