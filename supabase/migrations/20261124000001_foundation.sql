-- Foundation: extensions, private schema, enums, reference data (brand, subjects, locales, syllabus).
-- Security model: RLS on every table, default deny. See docs/adr/0002-server-side-trust-boundary.md.

create extension if not exists citext with schema extensions;

-- Internal helpers live in a schema that is not exposed through the API.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('student', 'reviewer', 'admin');
create type public.question_status as enum ('draft', 'auto_checked', 'in_review', 'live', 'rejected', 'retired');
create type public.question_source as enum ('past_paper', 'ai_variant', 'photo_ai');
create type public.stream as enum ('bio', 'maths');
create type public.age_band as enum ('16_plus', 'under_16');
create type public.theme as enum ('light', 'dark', 'system');

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reference data (white-label ready: nothing brand/subject-specific in code)
-- ---------------------------------------------------------------------------
create table public.brand_config (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  app_name text not null check (length(app_name) between 1 and 60),
  primary_color text not null check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  support_contact text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index brand_config_single_default on public.brand_config (is_default) where is_default;
create trigger brand_config_updated_at before update on public.brand_config
  for each row execute function private.set_updated_at();

create table public.locales (
  code text primary key check (code ~ '^[a-z]{2}$'),
  name text not null,
  is_active boolean not null default true
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  names jsonb not null, -- {"ta": "...", "si": "..."}
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects (id) on delete restrict,
  position smallint not null check (position > 0),
  names jsonb not null,
  in_syllabus boolean not null default true,
  created_at timestamptz not null default now(),
  unique (subject_id, position)
);

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units (id) on delete restrict,
  position smallint not null check (position > 0),
  names jsonb not null,
  in_syllabus boolean not null default true,
  created_at timestamptz not null default now(),
  unique (unit_id, position)
);
create index topics_unit_idx on public.topics (unit_id);

alter table public.brand_config enable row level security;
alter table public.locales enable row level security;
alter table public.subjects enable row level security;
alter table public.units enable row level security;
alter table public.topics enable row level security;

-- Reference data is public metadata: anyone may read, only service role writes.
create policy "brand_config readable" on public.brand_config for select to anon, authenticated using (true);
create policy "locales readable" on public.locales for select to anon, authenticated using (is_active);
create policy "subjects readable" on public.subjects for select to anon, authenticated using (is_active);
create policy "units readable" on public.units for select to anon, authenticated using (true);
create policy "topics readable" on public.topics for select to anon, authenticated using (true);

revoke insert, update, delete on public.brand_config, public.locales, public.subjects, public.units, public.topics
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seed core reference data
-- ---------------------------------------------------------------------------
insert into public.locales (code, name) values ('ta', 'தமிழ்'), ('si', 'සිංහල')
on conflict (code) do nothing;

insert into public.brand_config (slug, app_name, primary_color, is_default)
values ('fizzix', 'Fizzix', '#1E3A8A', true)
on conflict (slug) do nothing;

insert into public.subjects (slug, names)
values ('physics', '{"ta": "இயற்பியல்", "si": "භෞතික විද්‍යාව"}')
on conflict (slug) do nothing;
