# Mobile end-to-end tests (Maestro)

One flow file per story, named `st-xx-<slug>.yaml`, tagged with the story ID.

Run locally against an Android emulator or device with the app installed:

```bash
cd apps/mobile
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease && cd ..
adb install -r android/app/build/outputs/apk/release/app-release.apk
bash e2e/run.sh        # every flow; prints the screen and app log for any failure
```

The app must point at a local Supabase (`supabase start`) for flows that sign in. Build with
`EXPO_PUBLIC_SUPABASE_URL=http://10.0.2.2:54321`, the local anon key and
`E2E_ALLOW_CLEARTEXT=1`, as the CI job does. Test numbers and their OTP (123456) come from
`supabase/config.toml` and `supabase/seed.sql`.

CI runs the same flows on an Android emulator (`.github/workflows/e2e-mobile.yml`).
Use `testID` props for selectors (`id:` in Maestro); assert on visible text only where the
story is about the text itself.
