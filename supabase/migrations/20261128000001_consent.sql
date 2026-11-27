-- ST-58 Agree to privacy and confirm age at sign-up (Screen 1b).
--
-- Order in the app: save_account_details() → record_consent() → updateUser({ password }) →
-- complete_account(). complete_account() now also needs consent to the current notice.
-- When the notice changes (new app_config.privacy_notice.version), consent_status() reports
-- it as not accepted and the app asks again on next open (ADR-0008).
--
-- Under 16 is a child under the Personal Data Protection Act, No. 9 of 2022. A parent must
-- confirm before Premium or parent reports are used; private.parent_confirmation_pending()
-- is the server check those features call. Parent confirmation by SMS arrives with the
-- parent stories (PA-xx); until then parent_confirmed_at stays null.

-- Current privacy notice. Admin-editable; the app reads it before showing the account screen.
-- The URL must point to the published full notice before release.
insert into public.app_config (key, value, is_public) values
  ('privacy_notice', '{"version": "2026-11", "url": "https://fizzix.lk/privacy"}', true),
  ('consent_per_hour', '30', false)
on conflict (key) do nothing;

-- Consent and age range are written only through record_consent(), so the stored version is
-- always one the server knows and the profile age range always matches a consent row.
revoke insert on public.consents from authenticated;
drop policy if exists "own consents insertable" on public.consents;
revoke update (age_band) on public.profiles from authenticated;

create or replace function public.record_consent(p_notice_version text, p_age_band public.age_band)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_current text;
  v_limit integer;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select coalesce((c.value #>> '{}')::integer, 30) into v_limit
  from public.app_config c where c.key = 'consent_per_hour';
  perform private.check_rate_limit('consent', coalesce(v_limit, 30), 3600);

  select c.value ->> 'version' into v_current from public.app_config c where c.key = 'privacy_notice';
  if v_current is null or p_notice_version is distinct from v_current then
    raise exception 'notice_outdated' using errcode = '22023';
  end if;
  if p_age_band is null then
    raise exception 'invalid_age_band' using errcode = '22023';
  end if;

  insert into public.consents as c (user_id, notice_version, age_band)
  values (v_user, v_current, p_age_band)
  on conflict (user_id, notice_version) do update
    set age_band = excluded.age_band,
        accepted_at = now(),
        -- A parent confirmed this age range; a different range needs confirming again.
        parent_confirmed_at = case when c.age_band = excluded.age_band then c.parent_confirmed_at end;

  update public.profiles set age_band = p_age_band where id = v_user;
end;
$$;

-- What the app needs at start-up: is the current notice accepted, and is a parent still needed.
create or replace function public.consent_status()
returns table (
  current_version text,
  accepted boolean,
  age_band public.age_band,
  parent_confirmation_pending boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with cur as (
    select c.value ->> 'version' as version from public.app_config c where c.key = 'privacy_notice'
  ),
  mine as (
    select k.age_band, k.parent_confirmed_at
    from public.consents k, cur
    where k.user_id = (select auth.uid()) and k.notice_version = cur.version
  )
  select
    cur.version,
    exists (select 1 from mine),
    (select m.age_band from mine m),
    coalesce((select m.age_band = 'under_16' and m.parent_confirmed_at is null from mine m), false)
  from cur;
$$;

-- For entitlement checks (Premium, parent reports): true when the student's latest consent
-- says under 16 and no parent has confirmed it.
create or replace function private.parent_confirmation_pending(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select k.age_band = 'under_16' and k.parent_confirmed_at is null
    from public.consents k
    where k.user_id = p_user
    order by k.accepted_at desc, k.notice_version desc
    limit 1
  ), false);
$$;

-- Same as 20261127000001_create_account.sql, plus: consent to the current notice is required.
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
  if not exists (
    select 1 from public.consents k
    join public.app_config c on c.key = 'privacy_notice' and k.notice_version = c.value ->> 'version'
    where k.user_id = v_user
  ) then
    raise exception 'consent_missing' using errcode = 'P0001';
  end if;

  update public.profiles set account_completed_at = now() where id = v_user;
end;
$$;

revoke all on function public.record_consent(text, public.age_band) from public, anon;
revoke all on function public.consent_status() from public, anon;
revoke all on function private.parent_confirmation_pending(uuid) from public, anon, authenticated;
grant execute on function public.record_consent(text, public.age_band) to authenticated;
grant execute on function public.consent_status() to authenticated;
