-- Practice: sets served by the server, attempts, daily targets, error reports, and the two RPCs
-- that are the only way students see questions (get_practice_set) and answers (submit_answer).

create type public.set_kind as enum ('practice', 'model_paper', 'challenge', 'photo');

create table public.practice_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.set_kind not null default 'practice',
  unit_id uuid references public.units (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index practice_sets_user_idx on public.practice_sets (user_id, created_at desc);

create table public.practice_set_items (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.practice_sets (id) on delete cascade,
  position smallint not null check (position between 1 and 50),
  question_id uuid not null references public.questions (id) on delete restrict,
  version_id uuid not null references public.question_versions (id) on delete restrict,
  served_at timestamptz not null default now(),
  unique (set_id, position)
);
create index practice_set_items_set_idx on public.practice_set_items (set_id);

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  set_item_id uuid not null unique references public.practice_set_items (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete restrict,
  version_id uuid not null references public.question_versions (id) on delete restrict,
  unit_id uuid not null references public.units (id) on delete restrict,
  selected_option smallint not null check (selected_option between 1 and 5),
  is_correct boolean not null,
  time_ms integer not null check (time_ms >= 0),
  answered_at timestamptz not null default now()
);
create index attempts_user_day_idx on public.attempts (user_id, answered_at desc);
create index attempts_user_question_idx on public.attempts (user_id, question_id);

create table public.daily_targets (
  user_id uuid not null references public.profiles (id) on delete cascade,
  unit_id uuid not null references public.units (id) on delete cascade,
  daily_target smallint not null check (daily_target between 5 and 200 and daily_target % 5 = 0),
  created_at timestamptz not null default now(),
  primary key (user_id, unit_id)
);

create type public.error_reason as enum ('wrong_answer', 'unclear_explanation', 'other');
create type public.report_status as enum ('open', 'fixed', 'dismissed');

create table public.error_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  version_id uuid not null references public.question_versions (id) on delete cascade,
  reason public.error_reason not null,
  note text check (note is null or length(note) <= 500),
  status public.report_status not null default 'open',
  created_at timestamptz not null default now()
);
create index error_reports_question_idx on public.error_reports (question_id) where status = 'open';

alter table public.practice_sets enable row level security;
alter table public.practice_set_items enable row level security;
alter table public.attempts enable row level security;
alter table public.daily_targets enable row level security;
alter table public.error_reports enable row level security;

create policy "own sets readable" on public.practice_sets for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own set items readable" on public.practice_set_items for select to authenticated
  using (exists (select 1 from public.practice_sets s where s.id = set_id and s.user_id = (select auth.uid())));
create policy "own attempts readable" on public.attempts for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own targets readable" on public.daily_targets for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own targets insertable" on public.daily_targets for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "own targets updatable" on public.daily_targets for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own targets deletable" on public.daily_targets for delete to authenticated
  using (user_id = (select auth.uid()));
create policy "own reports readable" on public.error_reports for select to authenticated
  using (user_id = (select auth.uid()));
create policy "staff read reports" on public.error_reports for select to authenticated
  using (private.is_staff());
create policy "staff update reports" on public.error_reports for update to authenticated
  using (private.is_staff()) with check (private.is_staff());

-- Sets, items and attempts are written only through the RPCs below.
revoke all on public.practice_sets, public.practice_set_items, public.attempts from anon;
revoke insert, update, delete on public.practice_sets, public.practice_set_items, public.attempts from authenticated;
revoke all on public.daily_targets, public.error_reports from anon;
revoke insert, delete on public.error_reports from authenticated;

-- ---------------------------------------------------------------------------
-- get_practice_set: picks live questions, records what was served, returns NO answers.
-- ---------------------------------------------------------------------------
create or replace function public.get_practice_set(p_unit_id uuid, p_size integer default 10)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_locale text;
  v_premium boolean;
  v_served_today integer;
  v_free_limit integer;
  v_allowed integer;
  v_set_id uuid;
  v_items jsonb;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_size is null or p_size < 1 or p_size > private.config_int('max_set_size', 50) then
    raise exception 'invalid_size' using errcode = '22023';
  end if;
  if not exists (select 1 from public.units u where u.id = p_unit_id and u.in_syllabus) then
    raise exception 'unknown_unit' using errcode = '22023';
  end if;

  perform private.check_rate_limit('get_practice_set', private.config_int('practice_sets_per_hour', 60), 3600);

  select p.locale_code into v_locale from public.profiles p where p.id = v_user;
  v_premium := private.is_premium(v_user);

  v_allowed := p_size;
  if not v_premium then
    v_free_limit := private.config_int('free_daily_mcq', 10);
    select count(*) into v_served_today
    from public.practice_set_items i
    join public.practice_sets s on s.id = i.set_id
    where s.user_id = v_user and i.served_at >= private.colombo_day_start();
    v_allowed := least(p_size, greatest(v_free_limit - v_served_today, 0));
    if v_allowed = 0 then
      raise exception 'daily_limit_reached' using errcode = 'P0402';
    end if;
  end if;

  insert into public.practice_sets (user_id, kind, unit_id)
  values (v_user, 'practice', p_unit_id)
  returning id into v_set_id;

  -- Prefer questions the student has not answered yet; fall back to older ones.
  with picked as (
    select q.id as question_id, q.live_version_id as version_id
    from public.questions q
    where q.unit_id = p_unit_id
      and q.locale_code = v_locale
      and q.status = 'live'
      and q.live_version_id is not null
    order by (exists (select 1 from public.attempts a where a.user_id = v_user and a.question_id = q.id)), random()
    limit v_allowed
  ),
  numbered as (
    select question_id, version_id, row_number() over () as position from picked
  )
  insert into public.practice_set_items (set_id, position, question_id, version_id)
  select v_set_id, n.position, n.question_id, n.version_id from numbered n;

  select coalesce(jsonb_agg(jsonb_build_object(
           'item_id', i.id,
           'position', i.position,
           'stem', v.stem,
           'options', v.options,
           'diagram_path', v.diagram_path,
           'difficulty', q.difficulty
         ) order by i.position), '[]'::jsonb)
    into v_items
  from public.practice_set_items i
  join public.question_versions v on v.id = i.version_id
  join public.questions q on q.id = i.question_id
  where i.set_id = v_set_id;

  return jsonb_build_object('set_id', v_set_id, 'premium', v_premium, 'items', v_items);
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_answer: records the attempt first, then returns correctness and explanation.
-- ---------------------------------------------------------------------------
create or replace function public.submit_answer(p_item_id uuid, p_selected smallint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_item record;
  v_key record;
  v_correct boolean;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_selected is null or p_selected < 1 or p_selected > 5 then
    raise exception 'invalid_option' using errcode = '22023';
  end if;

  perform private.check_rate_limit('submit_answer', private.config_int('answers_per_hour', 300), 3600);

  select i.id, i.question_id, i.version_id, i.served_at, q.unit_id
    into v_item
  from public.practice_set_items i
  join public.practice_sets s on s.id = i.set_id
  join public.questions q on q.id = i.question_id
  where i.id = p_item_id and s.user_id = v_user;

  if not found then
    raise exception 'unknown_item' using errcode = '22023';
  end if;
  if exists (select 1 from public.attempts a where a.set_item_id = p_item_id) then
    raise exception 'already_answered' using errcode = '23505';
  end if;

  select k.correct_option, k.explanation into v_key
  from public.question_keys k where k.version_id = v_item.version_id;
  if not found then
    raise exception 'answer_key_missing' using errcode = 'P0001';
  end if;

  v_correct := (p_selected = v_key.correct_option);

  insert into public.attempts (user_id, set_item_id, question_id, version_id, unit_id, selected_option, is_correct, time_ms)
  values (
    v_user, p_item_id, v_item.question_id, v_item.version_id, v_item.unit_id, p_selected, v_correct,
    greatest(0, (extract(epoch from (now() - v_item.served_at)) * 1000)::integer)
  );

  return jsonb_build_object(
    'is_correct', v_correct,
    'correct_option', v_key.correct_option,
    'explanation', v_key.explanation
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- report_error: one open report per student per question version.
-- ---------------------------------------------------------------------------
create or replace function public.report_error(p_item_id uuid, p_reason public.error_reason, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_item record;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  perform private.check_rate_limit('report_error', 20, 86400);

  select i.question_id, i.version_id into v_item
  from public.practice_set_items i
  join public.practice_sets s on s.id = i.set_id
  where i.id = p_item_id and s.user_id = v_user;
  if not found then
    raise exception 'unknown_item' using errcode = '22023';
  end if;

  insert into public.error_reports (user_id, question_id, version_id, reason, note)
  values (v_user, v_item.question_id, v_item.version_id, p_reason, nullif(left(trim(p_note), 500), ''))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.get_practice_set(uuid, integer) from public, anon;
revoke all on function public.submit_answer(uuid, smallint) from public, anon;
revoke all on function public.report_error(uuid, public.error_reason, text) from public, anon;
grant execute on function public.get_practice_set(uuid, integer) to authenticated;
grant execute on function public.submit_answer(uuid, smallint) to authenticated;
grant execute on function public.report_error(uuid, public.error_reason, text) to authenticated;
