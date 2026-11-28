# ADR-0017 · Explicit table grants for API roles

Status: accepted · 2026-11-28

## Context

The first staging release failed at account creation: `permission denied for table
app_config` (42501). Local Supabase and CI grant every new `public` table to `anon` and
`authenticated` by default; new hosted projects do not. Our migrations relied on the local
default, so tables without an explicit grant were unreachable on staging, and would have
been in production too. The app showed "no internet" because it could not load the privacy
notice.

## Decision

- Migration `20261128000007_explicit_api_grants.sql` revokes everything from the API roles
  and grants exactly what each table needs: reference data read-only (also before sign-in),
  admin settings and content writable through RLS, a student's own rows readable, and only
  the listed profile columns editable. Never TRUNCATE, TRIGGER or REFERENCES (TRUNCATE
  ignores RLS). `service_role` keeps full access for Edge Functions.
- Default privileges in `public` no longer grant to `anon` / `authenticated`, locally
  included, so a table added without grants fails its tests instead of failing in staging.
- `supabase/tests/05_api_grants.test.sql` pins every table's privileges per role.

## Consequences

Every new table's migration grants its API privileges and adds them to the grants test
(CLAUDE.md security rules). RLS remains the row-level guard; grants are the statement-level
guard.
