# Fizzix – A/L Physics MCQ

Fizzix helps Sri Lankan A/L science students, especially those who find physics hard, practise
past-paper MCQs and AI-made variants with simple step-by-step explanations in Tamil and Sinhala.

## Status

Phase 1 – backend foundation: schema, Row Level Security, core SQL functions, tests and CI.
Mobile app (Expo) and web (Next.js) arrive in Phase 2, one user story at a time.

## Getting started

Requirements: Node 22+, pnpm 9+, Docker (for the local Supabase stack), Supabase CLI.

```bash
pnpm install
pnpm test            # unit tests (shared contracts)
supabase start       # local Postgres, Auth, Storage
supabase test db     # pgTAP tests for schema, RLS and functions
pnpm db:test         # same pgTAP tests without Docker (local Postgres 16 + pgTAP)
cd supabase/functions && deno test   # Edge Function pipeline tests
```

Engineering rules, security rules and the workflow live in [CLAUDE.md](./CLAUDE.md).
Architecture decisions live in [docs/adr](./docs/adr).

## Licence

Proprietary. All rights reserved.
