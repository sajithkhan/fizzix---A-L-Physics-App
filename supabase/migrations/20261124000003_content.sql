-- Content: questions, immutable versions, and answer keys.
-- Students never read these tables directly. They receive question text only through
-- get_practice_set(), and answers only through submit_answer() after an attempt is recorded.

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects (id) on delete restrict,
  unit_id uuid not null references public.units (id) on delete restrict,
  topic_id uuid references public.topics (id) on delete restrict,
  locale_code text not null references public.locales (code),
  difficulty smallint not null check (difficulty between 1 and 3),
  source public.question_source not null,
  parent_question_id uuid references public.questions (id) on delete set null,
  past_paper_year smallint check (past_paper_year is null or past_paper_year between 1990 and 2100),
  status public.question_status not null default 'draft',
  live_version_id uuid, -- set when a version is approved; FK added below
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint past_paper_has_year check (source <> 'past_paper' or past_paper_year is not null)
);
create index questions_pick_idx on public.questions (unit_id, locale_code, difficulty) where status = 'live';
create index questions_parent_idx on public.questions (parent_question_id);
create trigger questions_updated_at before update on public.questions
  for each row execute function private.set_updated_at();

-- A version is immutable once written: edits create a new version (ADR-0004).
create table public.question_versions (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  version integer not null check (version > 0),
  stem text not null check (length(stem) between 5 and 4000),
  options jsonb not null,
  diagram_path text,
  prompt_version text,
  model text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (question_id, version),
  constraint five_options check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 5)
);
create index question_versions_question_idx on public.question_versions (question_id);

alter table public.questions
  add constraint questions_live_version_fk
  foreign key (live_version_id) references public.question_versions (id) on delete restrict;

create table public.question_keys (
  version_id uuid primary key references public.question_versions (id) on delete cascade,
  correct_option smallint not null check (correct_option between 1 and 5),
  explanation jsonb not null, -- {theory, steps[], wrong_reasons{}, what_if{}}
  spoken_script text,
  audio_path text,
  created_at timestamptz not null default now()
);

create or replace function private.prevent_version_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'question versions are immutable; create a new version instead'
    using errcode = 'P0001';
end;
$$;

create trigger question_versions_immutable before update on public.question_versions
  for each row execute function private.prevent_version_update();

alter table public.questions enable row level security;
alter table public.question_versions enable row level security;
alter table public.question_keys enable row level security;

-- Staff (reviewer/admin) manage content. Students have no policies at all: default deny.
create policy "staff read questions" on public.questions for select to authenticated using (private.is_staff());
create policy "staff write questions" on public.questions for all to authenticated
  using (private.is_staff()) with check (private.is_staff());
create policy "staff read versions" on public.question_versions for select to authenticated using (private.is_staff());
create policy "staff add versions" on public.question_versions for insert to authenticated with check (private.is_staff());
create policy "staff read keys" on public.question_keys for select to authenticated using (private.is_staff());
create policy "staff add keys" on public.question_keys for insert to authenticated with check (private.is_staff());

revoke all on public.questions, public.question_versions, public.question_keys from anon;
revoke delete on public.question_versions, public.question_keys from authenticated;
revoke update on public.question_versions, public.question_keys from authenticated;
