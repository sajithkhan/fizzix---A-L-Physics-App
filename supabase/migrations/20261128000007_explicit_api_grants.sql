-- Explicit table privileges for the API roles (ADR-0017).
--
-- Local Supabase (and older hosted projects) grant every new public table to anon and
-- authenticated by default. New hosted projects do not: the first staging release returned
-- "permission denied for table app_config" (42501) because our migrations relied on that
-- default. Here every grant is written out, on every environment, and the default is
-- removed locally too, so a future table without explicit grants fails the tests instead of
-- failing in production.
--
-- RLS still decides which rows each role sees; these grants only decide which statements a
-- role may run at all. No TRUNCATE, TRIGGER or REFERENCES for API roles: TRUNCATE ignores RLS.

-- 1. Start from nothing for the API roles.
revoke all on all tables in schema public from anon, authenticated;

-- 2. Public reference data: readable before sign-in (language screen, brand, syllabus).
grant select on public.brand_config, public.locales, public.subjects, public.units,
  public.topics, public.app_config, public.feature_flags to anon, authenticated;

-- 3. Admin-managed settings: written by admins only (RLS checks the role).
grant insert, update, delete on public.app_config, public.feature_flags to authenticated;

-- 4. A student's own rows (RLS: own rows only). Writes go through SQL functions unless
--    listed here.
grant select on public.profiles, public.consents, public.subscriptions, public.audit_log,
  public.practice_sets, public.practice_set_items, public.attempts to authenticated;
grant update (display_name, exam_year, locale_code, school, stream, theme, username)
  on public.profiles to authenticated;
grant select, insert, update, delete on public.daily_targets to authenticated;
grant select, update on public.error_reports to authenticated;

-- 5. Content: reviewers and admins write through RLS; students read only live content.
--    question_keys stays unreadable to students (RLS, tested in 10_content_protection).
grant select, insert, update, delete on public.questions to authenticated;
grant select, insert on public.question_versions, public.question_keys to authenticated;

-- 6. Edge Functions use service_role (bypasses RLS, never in app code).
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- 7. Same rule for tables added later: explicit grants in the same migration.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
