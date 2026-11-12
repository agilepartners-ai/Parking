import type { ExpoConfig } from 'expo/config';

// Working name. Change APP_NAME / slug / bundle ids in one place when the product is named.
const APP_NAME = 'ParkPay';
const ID = 'com.parkpay.app'; // placeholder: pick the final reverse-domain id BEFORE the first store upload (cannot change later)

// Google Maps key: from the build environment (EAS secret GOOGLE_MAPS_API_KEY), or for local builds from the
// repo-root .env (gitignored; accepts GOOGLE_MAPS_API_KEY or Maps_key). It is never written into the repository.
declare const require: (m: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
declare const __dirname: string;
function mapsKey(): string | undefined {
  if (process.env.GOOGLE_MAPS_API_KEY) return process.env.GOOGLE_MAPS_API_KEY;
  try {
    const fs = require('fs');
    const path = require('path');
    const text: string = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8');
    const m = text.match(/^\s*(?:GOOGLE_MAPS_API_KEY|Maps_key)\s*=\s*["']?([^"'\r\n]+)/m);
    return m ? m[1].trim() : undefined;
  } catch {
    return undefined;
  }
}
const MAPS_KEY = mapsKey();

const config: ExpoConfig = {
  name: APP_NAME,
  slug: 'parkpay',
  owner: 'chopra.yatharth',
  scheme: 'parkpay',
  version: '0.2.0',
  orientation: 'portrait',
  // Over-the-air updates: JavaScript-only fixes reach installed apps without a new store build (and without using EAS build credits).
  // A new native build is needed only when native code or permissions change; bump `version` then (runtime = app version).
  runtimeVersion: { policy: 'appVersion' },
  updates: { url: 'https://u.expo.dev/ddf560e5-7102-44bf-9804-e384220499b1', checkAutomatically: 'ON_LOAD', fallbackToCacheTimeout: 3000 },
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: true,
    bundleIdentifier: ID,
    config: MAPS_KEY ? { googleMapsApiKey: MAPS_KEY } : undefined,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSLocationWhenInUseUsageDescription:
        'ParkPay uses your location to find the parking area you are in and to start and end your parking session.',
      NSLocationAlwaysAndWhenInUseUsageDescription:
        'ParkPay can remind you to end your parking session when you drive away from the parking area.',
      UIBackgroundModes: ['location'],
    },
  },
  android: {
    package: ID,
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // Needed for Google Maps in standalone/dev builds (Expo Go has its own key). Set GOOGLE_MAPS_API_KEY in EAS secrets.
    config: MAPS_KEY ? { googleMaps: { apiKey: MAPS_KEY } } : undefined,
  },
  web: { favicon: './assets/favicon.png', bundler: 'metro' },
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'ParkPay can remind you to end your parking session when you drive away from the parking area.',
        locationWhenInUsePermission: 'ParkPay uses your location to find the parking area you are in.',
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
        isIosBackgroundLocationEnabled: true,
      },
    ],
    ['expo-notifications', { color: '#0B8F5A' }],
    [
      'expo-build-properties',
      {
        // R8 minification removed a class WorkManager needs at start-up, so the first APK crashed on launch (found on the emulator).
        // Keep it off until a release is tested with minification on.
        android: { enableMinifyInReleaseBuilds: false, enableShrinkResourcesInReleaseBuilds: false },
      },
    ],
  ],
  experiments: { typedRoutes: false },
  extra: { eas: { projectId: 'ddf560e5-7102-44bf-9804-e384220499b1' }, hasMapsKey: !!MAPS_KEY },
};

export default config;
