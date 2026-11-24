# Mobile end-to-end tests (Maestro)

One flow file per story, named `st-xx-<slug>.yaml`, tagged with the story ID.

Run locally against an Android emulator or device with the app installed:

```bash
cd apps/mobile
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease && cd ..
adb install -r android/app/build/outputs/apk/release/app-release.apk
maestro test e2e/
```

CI runs the same flows on an Android emulator (`.github/workflows/e2e-mobile.yml`).
Use `testID` props for selectors (`id:` in Maestro); assert on visible text only where the
story is about the text itself.
