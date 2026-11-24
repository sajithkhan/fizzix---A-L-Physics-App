-- Profiles, roles and consents. Phone numbers stay in auth.users and are never copied here,
-- so no policy on this table can expose them to other users.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or length(display_name) between 1 and 60),
  username extensions.citext unique check (username is null or username ~ '^[A-Za-z0-9_]{3,20}$'),
  exam_year smallint check (exam_year is null or exam_year between 2025 and 2035),
  stream public.stream,
  school text check (school is null or length(school) <= 120),
  locale_code text not null default 'ta' references public.locales (code),
  theme public.theme not null default 'system',
  role public.app_role not null default 'student',
  age_band public.age_band,
  active_session_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;

create policy "own profile readable" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "own profile updatable" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Column-level privileges: students can never change role, session or audit columns themselves.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, username, exam_year, stream, school, locale_code, theme, age_band)
  on public.profiles to authenticated;

-- Create a profile row automatically for every new auth user.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Role helpers (security definer so they work inside RLS without recursion).
create or replace function private.current_role_is(p_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = p_role
  );
$$;

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role in ('reviewer', 'admin')
  );
$$;

revoke all on function private.current_role_is(public.app_role) from public;
revoke all on function private.is_staff() from public;
grant execute on function private.current_role_is(public.app_role) to authenticated;
grant execute on function private.is_staff() to authenticated;

-- Consents (privacy notice version, age band, parent confirmation for under-16).
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  notice_version text not null check (length(notice_version) between 1 and 20),
  age_band public.age_band not null,
  parent_confirmed_at timestamptz,
  accepted_at timestamptz not null default now(),
  unique (user_id, notice_version)
);
alter table public.consents enable row level security;

create policy "own consents readable" on public.consents
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own consents insertable" on public.consents
  for insert to authenticated with check (user_id = (select auth.uid()) and parent_confirmed_at is null);

revoke all on public.consents from anon, authenticated;
grant select, insert (user_id, notice_version, age_band) on public.consents to authenticated;
