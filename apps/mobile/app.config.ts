import type { ExpoConfig } from 'expo/config';

// Working name. Change APP_NAME / slug / bundle ids in one place when the product is named.
// One codebase, three apps. APP_VARIANT picks which one a build makes (eas.json profiles set it).
type Variant = 'driver' | 'officer' | 'admin';
const VARIANT: Variant = process.env.APP_VARIANT === 'officer' ? 'officer' : process.env.APP_VARIANT === 'admin' ? 'admin' : 'driver';
const V = {
  driver: { name: 'ParkPay', id: 'com.parkpay.app', scheme: 'parkpay', icons: './assets', colour: '#0B8F5A' }, // green
  officer: { name: 'ParkPay Enforce', id: 'com.parkpay.enforce', scheme: 'parkpay-enforce', icons: './assets/enforce', colour: '#1E3A8A' }, // navy + shield
  admin: { name: 'ParkPay Admin', id: 'com.parkpay.admin', scheme: 'parkpay-admin', icons: './assets/admin', colour: '#5B21B6' }, // violet + outline
}[VARIANT];
const APP_NAME = V.name;
const ICONS = V.icons;
const ID = V.id; // placeholder: pick the final reverse-domain id BEFORE the first store upload (cannot change later)

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
  scheme: V.scheme,
  version: '0.3.0',
  orientation: 'portrait',
  // Over-the-air updates: JavaScript-only fixes reach installed apps without a new store build (and without using EAS build credits).
  // A new native build is needed only when native code or permissions change; bump `version` then (runtime = app version).
  runtimeVersion: { policy: 'appVersion' },
  updates: { url: 'https://u.expo.dev/ddf560e5-7102-44bf-9804-e384220499b1', checkAutomatically: 'ON_LOAD', fallbackToCacheTimeout: 3000 },
  icon: `${ICONS}/icon.png`,
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
      backgroundColor: V.colour,
      foregroundImage: `${ICONS}/android-icon-foreground.png`,
      backgroundImage: `${ICONS}/android-icon-background.png`,
      monochromeImage: `${ICONS}/android-icon-monochrome.png`,
    },
    predictiveBackGestureEnabled: false,
    // Needed for Google Maps in standalone/dev builds (Expo Go has its own key). Set GOOGLE_MAPS_API_KEY in EAS secrets.
    config: MAPS_KEY ? { googleMaps: { apiKey: MAPS_KEY } } : undefined,
  },
  web: { favicon: `${ICONS}/favicon.png`, bundler: 'metro' },
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
    ['expo-notifications', { color: V.colour }],
    ['expo-splash-screen', { image: `${ICONS}/splash-icon.png`, imageWidth: 160, resizeMode: 'contain', backgroundColor: '#F2F4F2', dark: { backgroundColor: '#0E1311' } }],
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
  extra: { eas: { projectId: 'ddf560e5-7102-44bf-9804-e384220499b1' }, hasMapsKey: !!MAPS_KEY, variant: VARIANT },
};

export default config;
