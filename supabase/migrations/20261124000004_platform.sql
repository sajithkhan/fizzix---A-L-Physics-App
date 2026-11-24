-- Platform: app config, feature flags, subscriptions/entitlement, audit log, rate limiting.

-- ---------------------------------------------------------------------------
-- App config (limits and prices changeable without a release) and feature flags
-- ---------------------------------------------------------------------------
create table public.app_config (
  key text primary key check (key ~ '^[a-z0-9_]{2,60}$'),
  value jsonb not null,
  is_public boolean not null default false,
  updated_at timestamptz not null default now()
);
create trigger app_config_updated_at before update on public.app_config
  for each row execute function private.set_updated_at();

create table public.feature_flags (
  key text primary key check (key ~ '^[a-z0-9_]{2,60}$'),
  enabled boolean not null default false,
  rollout_percent smallint not null default 100 check (rollout_percent between 0 and 100),
  updated_at timestamptz not null default now()
);
create trigger feature_flags_updated_at before update on public.feature_flags
  for each row execute function private.set_updated_at();

alter table public.app_config enable row level security;
alter table public.feature_flags enable row level security;

create policy "public config readable" on public.app_config for select to anon, authenticated using (is_public);
create policy "flags readable" on public.feature_flags for select to authenticated using (true);
create policy "admin manages config" on public.app_config for all to authenticated
  using (private.current_role_is('admin')) with check (private.current_role_is('admin'));
create policy "admin manages flags" on public.feature_flags for all to authenticated
  using (private.current_role_is('admin')) with check (private.current_role_is('admin'));

revoke insert, update, delete on public.app_config, public.feature_flags from anon;

create or replace function private.config_int(p_key text, p_default integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (c.value #>> '{}')::integer from public.app_config c where c.key = p_key), p_default);
$$;
revoke all on function private.config_int(text, integer) from public;

-- ---------------------------------------------------------------------------
-- Subscriptions: one table for every payment source (ADR-0003)
-- ---------------------------------------------------------------------------
create type public.subscription_source as enum ('play', 'payhere', 'agent', 'manual');
create type public.subscription_plan as enum ('monthly', 'yearly');
create type public.subscription_status as enum ('active', 'grace', 'on_hold', 'cancelled', 'expired');

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source public.subscription_source not null,
  plan public.subscription_plan not null,
  status public.subscription_status not null,
  current_period_end timestamptz not null,
  external_ref text not null, -- purchase token hash / order id; never a raw card or token
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_ref)
);
create index subscriptions_user_idx on public.subscriptions (user_id, current_period_end desc);
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function private.set_updated_at();

alter table public.subscriptions enable row level security;
create policy "own subscriptions readable" on public.subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
-- Writes only from server functions (service role), after verifying with the payment provider.
revoke all on public.subscriptions from anon;
revoke insert, update, delete on public.subscriptions from authenticated;

create or replace function private.is_premium(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = p_user
      and s.status in ('active', 'grace', 'cancelled')
      and s.current_period_end > now()
  );
$$;
revoke all on function private.is_premium(uuid) from public;

-- Business day in Sri Lanka, used for daily limits and targets.
create or replace function private.colombo_day_start()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (date_trunc('day', now() at time zone 'Asia/Colombo')) at time zone 'Asia/Colombo';
$$;

-- ---------------------------------------------------------------------------
-- Audit log: append-only
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null check (length(action) between 3 and 80),
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);

alter table public.audit_log enable row level security;
create policy "admin reads audit" on public.audit_log
  for select to authenticated using (private.current_role_is('admin'));
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

create or replace function private.prevent_audit_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only' using errcode = 'P0001';
end;
$$;
create trigger audit_log_append_only before update or delete on public.audit_log
  for each row execute function private.prevent_audit_change();

create or replace function private.audit(p_action text, p_entity text, p_entity_id text, p_details jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values ((select auth.uid()), p_action, p_entity, p_entity_id, coalesce(p_details, '{}'::jsonb));
$$;
revoke all on function private.audit(text, text, text, jsonb) from public;

-- ---------------------------------------------------------------------------
-- Rate limiting: fixed windows per user and action
-- ---------------------------------------------------------------------------
create table private.rate_limits (
  user_id uuid not null,
  action text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (user_id, action, window_start)
);
revoke all on private.rate_limits from public, anon, authenticated;

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

-- ---------------------------------------------------------------------------
-- Seed defaults
-- ---------------------------------------------------------------------------
insert into public.app_config (key, value, is_public) values
  ('free_daily_mcq', '10', true),
  ('free_daily_photo', '1', true),
  ('premium_daily_photo', '5', true),
  ('max_set_size', '50', false),
  ('practice_sets_per_hour', '60', false),
  ('answers_per_hour', '300', false)
on conflict (key) do nothing;
