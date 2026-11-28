-- ST-55 Reset a forgotten password (Screen 1c). ADR-0011.
--
-- 1. The `reset-request` Edge Function calls reset_request(): only a registered number gets
--    a short-lived reset intent. The function then asks Supabase Auth to send an OTP.
-- 2. The SMS hook sends an OTP to a registered number only while it has a reset intent;
--    without one it still answers already_registered (sign-up path, ST-02).
-- 3. After the OTP is verified, the `reset-password` Edge Function checks reset_allowed(),
--    stores the new (derived) password, ends every session and calls reset_finished().

insert into public.app_config (key, value, is_public) values
  ('reset_intent_minutes', '10', false),
  ('reset_per_ip_15min', '20', false)
on conflict (key) do nothing;

-- Reset intents per number (hashed like private.sms_requests, never the number itself).
create table private.reset_intents (
  phone_hash text primary key check (phone_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table private.reset_intents enable row level security;
-- No policies: only the security-definer functions below touch it.

create or replace function private.otp_phone_hash(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to('fizzix-otp:' || p_phone, 'UTF8')), 'hex');
$$;
revoke all on function private.otp_phone_hash(text) from public;

/**
 * Before sending a reset OTP. `p_phone` is 947XXXXXXXX. Returns 'ok' (intent opened),
 * 'not_registered', 'ip_limited' or 'phone_not_supported'.
 */
create or replace function public.reset_request(p_phone text, p_ip_key text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / 900) * 900);
  v_hits integer;
begin
  if p_ip_key is null or p_ip_key !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if p_phone is null or p_phone !~ '^947[0-9]{8}$' then
    return 'phone_not_supported';
  end if;

  insert into private.login_ip_hits as h (ip_key, window_start, hits)
  values (p_ip_key, v_window, 1)
  on conflict (ip_key, window_start) do update set hits = h.hits + 1
  returning hits into v_hits;
  if v_hits > private.config_int('reset_per_ip_15min', 20) then
    return 'ip_limited';
  end if;

  if not private.is_registered_phone(p_phone) then
    return 'not_registered';
  end if;

  insert into private.reset_intents as r (phone_hash, expires_at)
  values (
    private.otp_phone_hash(p_phone),
    now() + make_interval(mins => private.config_int('reset_intent_minutes', 10))
  )
  on conflict (phone_hash) do update
    set created_at = now(), expires_at = excluded.expires_at;
  return 'ok';
end;
$$;

create or replace function private.has_reset_intent(p_phone text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.reset_intents r
    where r.phone_hash = private.otp_phone_hash(p_phone) and r.expires_at > now()
  );
$$;
revoke all on function private.has_reset_intent(text) from public;

/** May this user set a new password through the reset flow right now? */
create or replace function public.reset_allowed(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
    where u.id = p_user
      and private.is_registered_phone(regexp_replace(coalesce(u.phone, ''), '^\+', ''))
      and private.has_reset_intent(regexp_replace(coalesce(u.phone, ''), '^\+', ''))
  );
$$;

/** The reset is done: close the intent so the same OTP window cannot be reused. */
create or replace function public.reset_finished(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.reset_intents r
  using auth.users u
  where u.id = p_user
    and r.phone_hash = private.otp_phone_hash(regexp_replace(coalesce(u.phone, ''), '^\+', ''));
$$;

revoke all on function public.reset_request(text, text) from public, anon, authenticated;
revoke all on function public.reset_allowed(uuid) from public, anon, authenticated;
revoke all on function public.reset_finished(uuid) from public, anon, authenticated;
grant execute on function public.reset_request(text, text) to service_role;
grant execute on function public.reset_allowed(uuid) to service_role;
grant execute on function public.reset_finished(uuid) to service_role;

-- Same hook as 20261127000001_create_account.sql, except: a registered number with an open
-- reset intent gets its OTP (ST-55). The per-number hourly limit applies to both paths.
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

  if private.is_registered_phone(v_phone) and not private.has_reset_intent(v_phone) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 409, 'message', 'already_registered'));
  end if;

  v_hash := private.otp_phone_hash(v_phone);

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
