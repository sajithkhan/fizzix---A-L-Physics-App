-- ST-01 Choose app language.
-- A language can be listed (is_active) without being selectable yet (is_enabled), so the app
-- can show "coming soon" entries straight from the database. White-label buyers add or enable
-- languages here, not in app code.

alter table public.locales rename column name to native_name;

alter table public.locales
  add column is_enabled boolean not null default false,
  add column sort_order smallint not null default 100;

update public.locales set is_enabled = true, sort_order = 1 where code = 'ta';
update public.locales set is_enabled = true, sort_order = 2 where code = 'si';

insert into public.locales (code, native_name, is_active, is_enabled, sort_order)
values ('en', 'English', true, false, 3)
on conflict (code) do nothing;

-- A profile may only use a language that is available. The FK alone allows any listed row.
create or replace function private.ensure_locale_enabled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.locales l
    where l.code = new.locale_code and l.is_active and l.is_enabled
  ) then
    raise exception 'locale_not_available' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function private.ensure_locale_enabled() from public;

create trigger profiles_locale_enabled
  before insert or update of locale_code on public.profiles
  for each row execute function private.ensure_locale_enabled();
