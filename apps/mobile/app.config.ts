import type { ExpoConfig } from 'expo/config';
import brand from './src/brand/brand.json';

// "Release to staging" builds (docs/staging-release.md) install beside the future Play
// Store app: their own package and name, and a version code that rises with every release.
const staging = process.env.APP_VARIANT === 'staging';
const versionCode = Number(process.env.APP_VERSION_CODE ?? '1');

/**
 * App identity comes from src/brand/brand.json so a white-label build swaps one file.
 * Only EXPO_PUBLIC_* values (Supabase URL and anon key) are bundled into the app.
 */
const config: ExpoConfig = {
  name: staging ? `${brand.appName} Staging` : brand.appName,
  slug: brand.slug,
  scheme: brand.scheme,
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  android: {
    package: staging ? `${brand.androidPackage}.staging` : brand.androidPackage,
    versionCode,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: brand.colors.primary,
    },
    allowBackup: false,
  },
  ios: { bundleIdentifier: brand.iosBundleId, supportsTablet: false },
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-splash-screen',
      { image: './assets/splash-icon.png', imageWidth: 96, backgroundColor: brand.colors.primary },
    ],
    // CI end-to-end builds only: lets the app reach the local Supabase over plain HTTP.
    ...(process.env.E2E_ALLOW_CLEARTEXT === '1' ? ['./plugins/with-e2e-cleartext.js'] : []),
    // "Release to staging" only: sign with our staging key so each APK updates the last.
    ...(process.env.RELEASE_SIGNING === '1' ? ['./plugins/with-release-signing.js'] : []),
  ],
  experiments: { typedRoutes: true },
};

export default config;
