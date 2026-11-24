# ADR-0001: React Native + Expo for the app, Next.js for web, Supabase for the backend

- Status: Accepted
- Date: 2026-11-24

## Context

One developer with a QA background (TypeScript via Playwright/Cypress), building with AI
assistance, targeting Android first and iOS later, with a web admin panel and public web pages.

## Decision

TypeScript end to end: React Native with Expo for the mobile app, Next.js for web, Supabase
(Postgres, Auth, Storage, Edge Functions) for the backend. Flutter was considered and rejected.

## Consequences

- One language: contracts (zod), types and translations are shared across app, web and server.
- Expo removes native toolchain setup and gives over-the-air updates (EAS Update).
- Supabase keeps auth, data and server code in one service; Row Level Security is the core of
  the security model, so every table needs policies and tests.
- Lock-in risk is moderate: the database is plain Postgres and can be moved.
