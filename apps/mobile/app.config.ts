import type { ExpoConfig } from 'expo/config';

// Working name. Change APP_NAME / slug / bundle ids in one place when the product is named.
const APP_NAME = 'ParkPay';
const ID = 'com.parkpay.app'; // placeholder: pick the final reverse-domain id BEFORE the first store upload (cannot change later)

const config: ExpoConfig = {
  name: APP_NAME,
  slug: 'parkpay',
  owner: 'chopra.yatharth',
  scheme: 'parkpay',
  version: '0.1.1',
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
    config: process.env.GOOGLE_MAPS_API_KEY ? { googleMaps: { apiKey: process.env.GOOGLE_MAPS_API_KEY } } : undefined,
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
  extra: { eas: { projectId: 'ddf560e5-7102-44bf-9804-e384220499b1' }, hasMapsKey: !!process.env.GOOGLE_MAPS_API_KEY },
};

export default config;
