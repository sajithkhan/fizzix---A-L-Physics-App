# Fizzix – engineering rules

Fizzix is an A/L Physics MCQ app for Sri Lankan students (Tamil and Sinhala medium).
The bar for every change is production quality: secure, tested, maintainable, ready to sell or
white-label. When unsure, choose the safer and simpler option and say why.

## Source of truth

- Design (screens 0–14, light and dark): https://claude.ai/artifact/EsywvpSUqjeWRztTFfh7LH
- User stories (ST-xx, GU-xx, PA-xx, AD-xx): https://claude.ai/artifact/A3S7YYDpPaRaaskW3daMpU
- Tech stack and development workflow: https://claude.ai/artifact/J6TqJwb6Lh6fGGVbQq9dM5
- Backend architecture and security: https://claude.ai/artifact/N4evwiRzp4yZraf3GUUnh5
- Decisions: `docs/adr/`

## Repo layout

| Path                  | Holds                                                                  |
| --------------------- | ---------------------------------------------------------------------- |
| `apps/mobile`         | Expo (React Native) app – added in Phase 2                             |
| `apps/web`            | Next.js admin panel and public pages – added in Phase 2                |
| `packages/shared`     | zod API contracts, shared types, constants                             |
| `supabase/migrations` | Schema, RLS policies, SQL functions. The only way the database changes |
| `supabase/tests`      | pgTAP tests for every table, policy and function                       |
| `supabase/functions`  | Edge Functions (Deno). `_shared` holds the request pipeline            |
| `pipeline/`           | Content generation jobs, versioned prompts, AI evals                   |

## Workflow (non-negotiable)

1. One user story per branch and pull request. Name branches `story/ST-15-answer-mcq`.
2. Write tests first, from the story's acceptance criteria: database (pgTAP), backend
   (unit/API), frontend (component), end-to-end (Maestro for the app, Playwright for web).
3. Build backend, then frontend, until all tests pass.
4. CI must be fully green before merge. A red check means the story is not done.
5. Every story also meets the Definition of Done in the tech stack doc (both languages, both
   themes, loading/empty/offline/error states, analytics, security rules).

## Security rules (never break these)

- Never disable Row Level Security. Every new table enables RLS and ships with policies and
  pgTAP tests in the same change. Default is deny.
- Never put a secret, service-role key or API key in app, web or repo code. Only the Supabase
  anon key and URL may appear in client code. Secrets live in Edge Function secrets or GitHub
  Actions secrets.
- Never send a correct answer or explanation to the client before an attempt is recorded.
  `question_keys` is never readable by students; answers come only from `submit_answer`.
- Entitlement (free vs Premium, daily limits) is decided on the server only.
- Every Edge Function follows `_shared/handler.ts`: verify token → validate input with zod →
  rate limit → entitlement → do work in one transaction → return minimal fields. Errors return
  a code, never a stack trace or SQL.
- Challenge timers and scores are computed on the server. Never trust client clocks.
- Every purchase is verified with Google on the server before Premium opens.
- Logs never contain passwords, OTPs, tokens or full phone numbers.
- Admin and reviewer actions write to `audit_log`. Audit rows are never updated or deleted.
- Ask before adding any new dependency; prefer well-known, maintained packages.

## Product rules

- Nothing brand- or subject-specific is hard-coded: app name, colours, subject and language
  come from `brand_config`, `subjects`, `locales` and translation files (white-label ready).
- All user-facing text exists in Tamil (`ta`) and Sinhala (`si`). No hard-coded strings.
- IDs are UUIDs. Timestamps are `timestamptz`; the business day is Asia/Colombo.
- Content is versioned: edits create a new `question_versions` row; attempts reference the
  version the student saw.

## Commands

- `pnpm install` – install workspace dependencies
- `pnpm test` – unit tests across packages
- `pnpm typecheck` – TypeScript checks
- `pnpm db:test` – run migrations and pgTAP tests against a local Postgres
- `supabase start` / `supabase test db` – full local Supabase stack (needs Docker)
