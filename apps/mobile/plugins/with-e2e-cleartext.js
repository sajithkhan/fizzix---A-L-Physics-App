// Allows plain-HTTP traffic in the Android build used by Maestro in CI, where the app talks
// to a local Supabase at http://10.0.2.2:54321. Applied ONLY when E2E_ALLOW_CLEARTEXT=1, so
// store builds keep Android's default (HTTPS only).
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withE2eCleartext(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (app) app.$['android:usesCleartextTraffic'] = 'true';
    return cfg;
  });
};
