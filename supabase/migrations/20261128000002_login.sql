-- ST-54 Log in with number and password (Screen 1).
--
-- Login goes through the `login` Edge Function (ADR-0009). These functions hold the lockout
-- and IP limits it calls. They are callable only with the service role key, which exists
-- only inside Edge Functions. Keys are HMACs made in the function (never phone numbers or IPs).

insert into public.app_config (key, value, is_public) values
  ('login_max_failures', '5', false),
  ('login_lock_minutes', '15', false),
  ('login_ip_per_15min', '30', false)
on conflict (key) do nothing;

-- Wrong-password counter per number. A success deletes the row.
create table private.login_failures (
  number_key text primary key check (number_key ~ '^[a-f0-9]{64}$'),
  failures smallint not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz
);
alter table private.login_failures enable row level security;

-- Login attempts per client IP, in 15-minute windows.
create table private.login_ip_hits (
  ip_key text not null check (ip_key ~ '^[a-f0-9]{64}$'),
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (ip_key, window_start)
);
alter table private.login_ip_hits enable row level security;
-- No policies: nobody but the security-definer functions below reads or writes these.

/**
 * Before checking a password: 'locked' if this number is locked, 'ip_limited' if this IP made
 * too many attempts, otherwise 'ok'. Counts the attempt against the IP.
 */
create or replace function public.login_guard(p_number_key text, p_ip_key text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / 900) * 900);
  v_hits integer;
begin
  if p_number_key is null or p_number_key !~ '^[a-f0-9]{64}$'
     or p_ip_key is null or p_ip_key !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  if exists (
    select 1 from private.login_failures f
    where f.number_key = p_number_key and f.locked_until > now()
  ) then
    return 'locked';
  end if;

  insert into private.login_ip_hits as h (ip_key, window_start, hits)
  values (p_ip_key, v_window, 1)
  on conflict (ip_key, window_start) do update set hits = h.hits + 1
  returning hits into v_hits;
  if v_hits > private.config_int('login_ip_per_15min', 30) then
    return 'ip_limited';
  end if;

  return 'ok';
end;
$$;

/**
 * After checking a password. Success clears the counter and returns 'ok'. A failure returns
 * 'locked' when it is the one that reaches the limit, otherwise 'failed'.
 */
create or replace function public.login_result(p_number_key text, p_success boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max integer := private.config_int('login_max_failures', 5);
  v_lock interval := make_interval(mins => private.config_int('login_lock_minutes', 15));
  v_failures smallint;
begin
  if p_number_key is null or p_number_key !~ '^[a-f0-9]{64}$' or p_success is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  if p_success then
    delete from private.login_failures where number_key = p_number_key;
    return 'ok';
  end if;

  insert into private.login_failures as f (number_key, failures, window_started_at)
  values (p_number_key, 1, now())
  on conflict (number_key) do update
    set failures = case
          -- An old window or an expired lock starts counting again from one.
          when f.window_started_at < now() - v_lock or f.locked_until <= now() then 1
          else f.failures + 1
        end,
        window_started_at = case
          when f.window_started_at < now() - v_lock or f.locked_until <= now() then now()
          else f.window_started_at
        end,
        locked_until = case when f.locked_until <= now() then null else f.locked_until end
  returning failures into v_failures;

  if v_failures >= v_max then
    update private.login_failures
    set locked_until = now() + v_lock, failures = 0, window_started_at = now()
    where number_key = p_number_key;
    return 'locked';
  end if;
  return 'failed';
end;
$$;

-- For signed-in Edge Functions (_shared/handler.ts): per-user rate limit, entitlement and
-- account state, checked with the user id the function verified from the token.
create or replace function public.edge_rate_limit(p_user uuid, p_action text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  if p_user is null or p_action !~ '^[a-z0-9_-]{2,40}$' or p_max < 1 or p_window_seconds < 1 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into private.rate_limits as r (user_id, action, window_start, hits)
  values (p_user, p_action, v_window, 1)
  on conflict (user_id, action, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;
  return v_hits <= p_max;
end;
$$;

create or replace function public.edge_is_premium(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.is_premium(p_user), false);
$$;

create or replace function public.edge_account_completed(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.account_completed_at is not null from public.profiles p where p.id = p_user),
    false
  );
$$;

revoke all on function public.login_guard(text, text) from public, anon, authenticated;
revoke all on function public.login_result(text, boolean) from public, anon, authenticated;
revoke all on function public.edge_rate_limit(uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.edge_is_premium(uuid) from public, anon, authenticated;
revoke all on function public.edge_account_completed(uuid) from public, anon, authenticated;
grant execute on function public.login_guard(text, text) to service_role;
grant execute on function public.login_result(text, boolean) to service_role;
grant execute on function public.edge_rate_limit(uuid, text, integer, integer) to service_role;
grant execute on function public.edge_is_premium(uuid) to service_role;
grant execute on function public.edge_account_completed(uuid) to service_role;
