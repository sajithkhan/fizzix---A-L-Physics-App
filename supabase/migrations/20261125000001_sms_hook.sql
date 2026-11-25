-- ST-02 Register with phone number and OTP.
--
-- Supabase Auth calls this Postgres hook (Send SMS hook) instead of its own SMS sender.
-- Every rule about who may receive an OTP lives here, on the server:
--   1. Sri Lankan mobile numbers only.
--   2. Numbers that already have an account are told to log in (ST-54). Password reset
--      (ST-55) will add an explicit "reset requested" path; until then registered
--      numbers never receive an OTP.
--   3. At most 3 OTPs per number per rolling hour. Supabase's own max_frequency (45s,
--      config.toml) handles the resend wait.
--   4. Fail closed: no SMS provider configured means a clear error, never a silent "sent".
--
-- Errors are returned as {"error": {"http_code", "message"}}; Supabase Auth passes the
-- message to the app, which maps it to translated text. Messages are error codes only.

-- Request log for the per-number limit. Stores a hash, never the phone number.
create table private.sms_requests (
  id bigint generated always as identity primary key,
  phone_hash text not null,
  requested_at timestamptz not null default now()
);
create index sms_requests_phone_time on private.sms_requests (phone_hash, requested_at desc);
revoke all on private.sms_requests from public, anon, authenticated;

insert into public.app_config (key, value, is_public) values
  ('otp_per_number_per_hour', '3', false)
on conflict (key) do nothing;

-- Hands the OTP to the SMS provider. Returns false when no provider is configured.
-- The gateway integration replaces this function (see docs/adr/0006-otp-sign-up.md).
create or replace function private.deliver_sms(p_phone text, p_otp text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select false;
$$;
revoke all on function private.deliver_sms(text, text) from public;

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

  if exists (
    select 1
    from auth.users u
    join public.profiles p on p.id = u.id
    where regexp_replace(u.phone, '^\+', '') = v_phone
      and p.username is not null
  ) then
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

  if not private.deliver_sms(v_phone, v_otp) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 503, 'message', 'sms_unavailable'));
  end if;

  return '{}'::jsonb;
end;
$$;

-- Only Supabase Auth may run the hook.
revoke all on function private.send_sms_hook(jsonb) from public, anon, authenticated;
grant usage on schema private to supabase_auth_admin;
grant execute on function private.send_sms_hook(jsonb) to supabase_auth_admin;
