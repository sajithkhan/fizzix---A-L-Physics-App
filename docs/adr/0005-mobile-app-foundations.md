# ADR-0005: Mobile app foundations

- Status: Accepted
- Date: 2026-11-24

## Context

ST-01 is the first story with a screen, so the mobile app's base choices are made here and
every later story builds on them.

## Decision

- **Expo SDK 58 with Expo Router.** Routes live in `apps/mobile/src/app`; feature code lives
  in `src/features/<feature>`. Native folders are generated (`expo prebuild`), never edited.
- **pnpm `node-linker=hoisted`** (`.npmrc`). Expo documents this as the safe layout for
  native builds in a monorepo. There must be exactly one copy of `react-native`.
- **Text:** i18next + react-i18next. `ta.json` and `si.json` must have identical keys
  (enforced by `__tests__/i18n-test.ts`). No string literals in screens.
- **Theme:** colour tokens from the design canvas in `src/theme/tokens.ts`, light and dark.
  Brand values (name, IDs, colours) come from `src/brand/brand.json` for white-label builds.
- **Data before sign-in:** reference data (e.g. languages) is read from Supabase with the
  anon key and validated with the zod contracts in `@fizzix/shared`. A built-in copy is used
  when offline.
- **Tests:** Jest (`jest-expo`) + React Native Testing Library for components, rendered
  through Expo Router's `renderRouter`. Maestro flows in `apps/mobile/e2e`, one per story,
  run on an Android emulator in GitHub Actions (free, about 20 minutes).
- **Analytics:** screens call `analytics.track()`; the provider is plugged in later. Event
  properties never contain personal data.

## Consequences

- Adding a native module means a new APK build; Expo Go is not used.
- The E2E job is slow, so it runs only when the app or shared code changes.
- Session tokens use AsyncStorage until ST-05 moves them to `expo-secure-store`. No real
  sign-in ships before that.
