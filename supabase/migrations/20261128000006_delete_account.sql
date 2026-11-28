-- ST-57 Delete my account (Settings). ADR-0014.
--
-- The `delete-account` Edge Function checks the password, calls prepare_account_deletion()
-- and then deletes the Auth user, which removes the profile and all study data (every table
-- references profiles with ON DELETE CASCADE). Payment records the law requires are kept in
-- private.retained_payments, with no link to the student and no study data.

create table private.retained_payments (
  id uuid primary key default gen_random_uuid(),
  source public.subscription_source not null,
  plan public.subscription_plan not null,
  status public.subscription_status not null,
  current_period_end timestamptz not null,
  external_ref text not null, -- order id / purchase token hash, as in subscriptions
  purchased_at timestamptz not null,
  account_deleted_at timestamptz not null default now(),
  unique (source, external_ref)
);
alter table private.retained_payments enable row level security;
-- No policies: only security-definer functions and finance exports read it.

/**
 * Step 1 of deleting an account (service role only). Keeps the payment records without the
 * student, removes data kept outside the profile cascade, and writes an audit row. Safe to
 * run twice. Step 2 is the Auth user deletion in the Edge Function.
 */
create or replace function public.prepare_account_deletion(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kept integer;
begin
  if p_user is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  insert into private.retained_payments
    (source, plan, status, current_period_end, external_ref, purchased_at)
  select s.source, s.plan, s.status, s.current_period_end, s.external_ref, s.created_at
  from public.subscriptions s
  where s.user_id = p_user
  on conflict (source, external_ref) do nothing;
  get diagnostics v_kept = row_count;

  delete from private.rate_limits where user_id = p_user;

  -- Who asked is not kept: the account is about to disappear.
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (null, 'account_deleted', 'account', null, jsonb_build_object('payments_kept', v_kept));

  return v_kept;
end;
$$;
revoke all on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;
