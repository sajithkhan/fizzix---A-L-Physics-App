# ADR-0016 · Manual end-of-day staging release

Status: accepted · 2026-11-28

## Context

The owner wants the app on his own phone, updating by itself, without a release after every
merged story. CI's Supabase is local to the runner, so a phone build needs a hosted backend.

## Decision

- A hosted **staging** Supabase project (Free plan, Singapore), separate from production.
- One **manual** workflow, "Release to staging", run from `main` at the end of the day. It
  deploys migrations, auth settings (`config push`), Edge Function secrets and functions,
  smoke-tests staging, then builds a signed APK and publishes it as a GitHub Release. Any
  failure stops the run before the APK, so the phone never runs ahead of the server.
- The staging app is a separate package (`lk.fizzix.app.staging`, "Fizzix Staging") signed
  with a staging-only key from GitHub secrets (`plugins/with-release-signing.js`), so it
  updates in place and can later sit beside the Play Store app.
- The phone updates through **Obtainium**, which watches GitHub Releases. No app code or
  dependency change. The repo is public, so the APK is too; staging has no SMS provider, so
  only the fixed test numbers can sign up.

## Alternatives

- Deploy on every merge: slower days, and half-finished work reaches the phone.
- EAS Update (OTA): needs an Expo account and `expo-updates`, and native changes still need a
  new APK. Not worth it yet.
- Play Console internal testing: the right path for launch; added with the production
  workflow (Play account, upload key, no test numbers).
