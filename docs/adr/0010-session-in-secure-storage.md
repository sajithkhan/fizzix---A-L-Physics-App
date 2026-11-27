# ADR-0010: Keep the session in the phone's secure storage

- Status: Accepted
- Date: 2026-11-28

## Context

ST-05: a student stays signed in across app restarts, and after logout, a reinstall or a new
phone signs in with number and password (no OTP). The Supabase session (access and refresh
token) was kept in AsyncStorage, which is plain files on the device.

## Decision

- Add `expo-secure-store` (Expo's own package; approved by the owner on 2026-11-27). The
  session is stored in the Android Keystore / iOS Keychain, readable only by this app, with
  `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` so background token refresh keeps working.
- Values are split into chunks of 1,800 characters (`src/lib/secure-storage.ts`); the
  chunk count is written last, so an interrupted write reads as signed out, never as a
  broken session.
- A session saved by an older build in AsyncStorage is moved on first read.
- Android backup stays off (`allowBackup: false`), so a reinstall never restores a session.
- Logout uses `signOut({ scope: 'local' })`: this phone only; other phones stay signed in.
  If the server cannot be reached, the student stays signed in and is told to retry.

## Consequences

- Clearing app data or reinstalling always means logging in again.
- Logout moved to Settings (Screen 9) with a confirm step in ST-07.
