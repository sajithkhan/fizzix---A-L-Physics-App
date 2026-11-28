// Signs the release build with our own key instead of the debug key, so every staging APK
// installs as an update over the last one. Applied ONLY when RELEASE_SIGNING=1 (the
// "Release to staging" workflow). The keystore and its password come from environment
// variables set from GitHub Actions secrets; nothing secret is written into the project.
//   RELEASE_KEYSTORE_PATH, RELEASE_KEYSTORE_PASSWORD, RELEASE_KEY_ALIAS
const { withAppBuildGradle } = require('expo/config-plugins');

const RELEASE_CONFIG = `
        release {
            storeFile file(System.getenv('RELEASE_KEYSTORE_PATH'))
            storePassword System.getenv('RELEASE_KEYSTORE_PASSWORD')
            keyAlias System.getenv('RELEASE_KEY_ALIAS')
            keyPassword System.getenv('RELEASE_KEYSTORE_PASSWORD')
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (!gradle.includes("System.getenv('RELEASE_KEYSTORE_PATH')")) {
      const signingConfigs = /signingConfigs\s*\{/;
      const releaseBuildType = /(release\s*\{[^}]*?)signingConfig signingConfigs\.debug/;
      if (!signingConfigs.test(gradle) || !releaseBuildType.test(gradle)) {
        throw new Error('with-release-signing: unexpected android/app/build.gradle layout');
      }
      gradle = gradle.replace(signingConfigs, (m) => `${m}${RELEASE_CONFIG}`);
      gradle = gradle.replace(releaseBuildType, '$1signingConfig signingConfigs.release');
    }
    cfg.modResults.contents = gradle;
    return cfg;
  });
};
