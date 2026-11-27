-- ST-04 Create my account (Screen 1b).
--
-- Order in the app: save_account_details() → supabase.auth.updateUser({ password }) →
-- complete_account(). The account is complete only when both the details and a password
-- exist, so a student is never "registered" without a way to log in (ADR-0007).

alter table public.profiles add column account_completed_at timestamptz;
-- No grant: students cannot set or clear this column themselves (column-level update grants
-- in 20261124000002_profiles.sql do not include it).

-- Exam years offered on the sign-up screen. Admin-editable; the app reads it before sign-in.
insert into public.app_config (key, value, is_public) values
  ('exam_years', '[2026, 2027, 2028]', true)
on conflict (key) do nothing;

-- Username check for instant feedback while typing. Usernames are public nicknames (shown in
-- challenges and leagues), so revealing that one is taken leaks nothing private.
create or replace function public.username_available(p_username text)
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
  if p_username is null or p_username !~ '^[A-Za-z0-9_]{3,20}$' then
    return false;
  end if;
  return not exists (
    select 1 from public.profiles p
    -- lower() on both sides: with an empty search_path the citext '=' operator is not found
    -- and the comparison would silently become case-sensitive.
    where lower(p.username::text) = lower(p_username) and p.id <> v_user
  );
end;
$$;

create or replace function public.save_account_details(
  p_display_name text,
  p_username text,
  p_exam_year smallint,
  p_stream public.stream,
  p_school text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_display_name, ''));
  v_school text := nullif(btrim(coalesce(p_school, '')), '');
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  perform private.check_rate_limit('account_save', 30, 3600);

  if exists (select 1 from public.profiles p where p.id = v_user and p.account_completed_at is not null) then
    raise exception 'account_already_completed' using errcode = 'P0001';
  end if;

  if length(v_name) < 1 or length(v_name) > 60 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if p_username is null or p_username !~ '^[A-Za-z0-9_]{3,20}$' then
    raise exception 'invalid_username' using errcode = '22023';
  end if;
  if p_exam_year is null or not exists (
    select 1 from public.app_config c
    where c.key = 'exam_years' and c.value @> to_jsonb(p_exam_year::int)
  ) then
    raise exception 'invalid_exam_year' using errcode = '22023';
  end if;
  if p_stream is null then
    raise exception 'invalid_stream' using errcode = '22023';
  end if;
  if v_school is not null and length(v_school) > 120 then
    raise exception 'invalid_school' using errcode = '22023';
  end if;

  begin
    update public.profiles
    set display_name = v_name,
        username = p_username::extensions.citext,
        exam_year = p_exam_year,
        stream = p_stream,
        school = v_school
    where id = v_user;
  exception when unique_violation then
    raise exception 'username_taken' using errcode = '23505';
  end;
end;
$$;

create or replace function public.complete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_profile public.profiles;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_profile from public.profiles p where p.id = v_user;
  if v_profile.account_completed_at is not null then
    return; -- already complete
  end if;
  if v_profile.username is null or v_profile.display_name is null
     or v_profile.exam_year is null or v_profile.stream is null then
    raise exception 'details_missing' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from auth.users u
    where u.id = v_user and coalesce(u.encrypted_password, '') <> ''
  ) then
    raise exception 'password_not_set' using errcode = 'P0001';
  end if;

  update public.profiles set account_completed_at = now() where id = v_user;
end;
$$;

revoke all on function public.username_available(text) from public, anon;
revoke all on function public.save_account_details(text, text, smallint, public.stream, text) from public, anon;
revoke all on function public.complete_account() from public, anon;
grant execute on function public.username_available(text) to authenticated;
grant execute on function public.save_account_details(text, text, smallint, public.stream, text) to authenticated;
grant execute on function public.complete_account() to authenticated;

-- "Registered" now means a completed account (details + password), not just a username.
create or replace function private.is_registered_phone(p_phone text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    join public.profiles p on p.id = u.id
    where regexp_replace(u.phone, '^\+', '') = p_phone
      and p.account_completed_at is not null
  );
$$;
revoke all on function private.is_registered_phone(text) from public;

-- Same hook as 20261125000001_sms_hook.sql, with the registered check above.
create or replace function private.send_sms_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := regexp_replace(coalesce(event -> 'user' ->> 'phone', ''), '^\+', '');
  v_otp text := event -> 'sms' ->> 'otp';
  v_hash text;
  v_recent integer;
  v_limit integer := private.config_int('otp_per_number_per_hour', 3);
begin
  if v_otp is null or v_otp !~ '^[0-9]{6}$' or v_phone = '' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 400, 'message', 'invalid_input'));
  end if;

  -- Sri Lankan mobile: 94 + 7X + 7 digits.
  if v_phone !~ '^947[0-9]{8}$' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 400, 'message', 'phone_not_supported'));
  end if;

  if private.is_registered_phone(v_phone) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 409, 'message', 'already_registered'));
  end if;

  v_hash := encode(sha256(convert_to('fizzix-otp:' || v_phone, 'UTF8')), 'hex');

  select count(*) into v_recent
  from private.sms_requests r
  where r.phone_hash = v_hash and r.requested_at > now() - interval '1 hour';

  if v_recent >= v_limit then
    return jsonb_build_object('error', jsonb_build_object('http_code', 429, 'message', 'otp_rate_limited'));
  end if;

  insert into private.sms_requests (phone_hash) values (v_hash);

  -- Local/CI test numbers (seed.sql only): Supabase uses the fixed OTP from config.toml,
  -- so nothing is sent. Production has no otp_test_numbers row.
  if exists (
    select 1 from public.app_config c
    where c.key = 'otp_test_numbers' and c.value ? v_phone
  ) then
    return '{}'::jsonb;
  end if;

  if not private.deliver_sms(v_phone, v_otp) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 503, 'message', 'sms_unavailable'));
  end if;

  return '{}'::jsonb;
end;
$$;
