# Mobile end-to-end tests (Maestro)

One flow file per story, named `st-xx-<slug>.yaml`, tagged with the story ID. Shared steps
(sign up a test number, log out) live in `subflows/` and are called with `runFlow`; Maestro
runs only the top-level files as tests.

Run locally against an Android emulator or device with the app installed:

```bash
cd apps/mobile
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease && cd ..
adb install -r android/app/build/outputs/apk/release/app-release.apk
bash e2e/run.sh        # all flows in one Maestro session; retries a failed flow once and
                       # prints its screen and app log if it fails again
```

The app must point at a local Supabase (`supabase start`, with the edge runtime for the
`login` and `set-password` functions and `PASSWORD_PEPPER` set to any 32+ character value)
for flows that sign in. `run.sh` passes `SUPABASE_URL` and `SUPABASE_ANON_KEY` to Maestro
for the ST-06 flow, which logs in "another phone" from the test machine (`scripts/`). Build with
`EXPO_PUBLIC_SUPABASE_URL=http://10.0.2.2:54321`, the local anon key and
`E2E_ALLOW_CLEARTEXT=1`, as the CI job does. Test numbers and their OTP (123456) come from
`supabase/config.toml` and `supabase/seed.sql`.

CI runs the same flows on an Android emulator (`.github/workflows/e2e-mobile.yml`).
Use `testID` props for selectors (`id:` in Maestro); assert on visible text only where the
story is about the text itself.
