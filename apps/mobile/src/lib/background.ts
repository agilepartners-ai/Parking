import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { pointInGeometry, type AreaGeometry } from '@parkpay/shared';
import { notifyNow } from './notify';

/**
 * Patent claim 1 idea: tell the driver to end the session when the phone starts moving away from the parking area.
 * Background location does NOT run in Expo Go - it needs a development build (see docs/SETUP-AND-TESTING.md).
 * In Expo Go the app still checks while it is open (see AppState.tsx).
 */

export const BG_TASK = 'parkpay-leave-watch';
const INFO_KEY = 'parkpay.bg.session';
const LAST_KEY = 'parkpay.bg.lastNotified';

export const backgroundSupported = Platform.OS !== 'web' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

if (backgroundSupported) {
  try {
    TaskManager.defineTask(BG_TASK, async ({ data, error }) => {
      if (error || !data) return;
      const { locations } = data as { locations: Location.LocationObject[] };
      const last = locations[locations.length - 1];
      if (!last) return;
      const raw = await AsyncStorage.getItem(INFO_KEY);
      if (!raw) return;
      const info = JSON.parse(raw) as { areaName: string; geometry: AreaGeometry };
      const inside = pointInGeometry(last.coords.latitude, last.coords.longitude, info.geometry);
      if (inside || (last.coords.speed ?? 0) < 2) return; // still there, or not moving
      const lastAt = Number((await AsyncStorage.getItem(LAST_KEY)) ?? 0);
      if (Date.now() - lastAt < 10 * 60_000) return; // at most one nudge per 10 minutes
      await AsyncStorage.setItem(LAST_KEY, String(Date.now()));
      await notifyNow('Did you leave?', `You are moving away from ${info.areaName}. Open ParkPay to end your parking session.`);
    });
  } catch {
    /* defineTask can only run once; ignore hot-reload duplicates */
  }
}

export async function startLeaveWatch(info: { areaName: string; geometry: AreaGeometry }): Promise<boolean> {
  if (!backgroundSupported) return false;
  try {
    const fg = await Location.getForegroundPermissionsAsync();
    if (!fg.granted) return false;
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (!bg.granted) return false;
    await AsyncStorage.setItem(INFO_KEY, JSON.stringify(info));
    await AsyncStorage.removeItem(LAST_KEY);
    if (await Location.hasStartedLocationUpdatesAsync(BG_TASK)) return true;
    await Location.startLocationUpdatesAsync(BG_TASK, {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 50,
      pausesUpdatesAutomatically: true,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'ParkPay is watching your parking session',
        notificationBody: 'We will remind you to end it if you drive away.',
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function stopLeaveWatch() {
  if (!backgroundSupported) return;
  try {
    await AsyncStorage.removeItem(INFO_KEY);
    if (await Location.hasStartedLocationUpdatesAsync(BG_TASK)) await Location.stopLocationUpdatesAsync(BG_TASK);
  } catch {
    /* ignore */
  }
}
