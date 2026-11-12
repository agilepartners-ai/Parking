import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { currentRateCents, formatMoney, haversineMeters, type AreaGeometry, type ParkingArea, type Position } from '@parkpay/shared';
import { backgroundSupported } from './background';
import { notifyNow } from './notify';

/**
 * Arrival reminders. The phone's own geofencing wakes the app when the driver comes near a published area
 * ("City Hall Lot, $4.00/h now. Start parking?"). OS geofences are circles and iOS allows about 20, so we
 * register only the nearest areas and re-pick as the driver moves. The exact polygon match stays on the server.
 * Needs "Allow all the time" location; without it this module quietly does nothing.
 */

export const GEOFENCE_TASK = 'parkpay-arrival';
/** 25 km/h: above this with a session open, the driver has almost certainly left. */
export const FAST_MPS = 25 / 3.6;

const MAX_REGIONS = 15;
const INFO_KEY = 'parkpay.geo.areas';
const LAST_KEY = 'parkpay.geo.last.';
const SESSION_KEY = 'parkpay.bg.session'; // set by background.ts while a session is running
const QUIET_MS = 2 * 60 * 60_000;

type Info = Record<string, { name: string; rate: string }>;

if (backgroundSupported) {
  try {
    TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
      if (error || !data) return;
      const { eventType, region } = data as { eventType: Location.GeofencingEventType; region: Location.LocationRegion };
      if (eventType !== Location.GeofencingEventType.Enter || !region.identifier) return;
      if (await AsyncStorage.getItem(SESSION_KEY)) return; // already parked: no "start parking?" nudge
      const info = JSON.parse((await AsyncStorage.getItem(INFO_KEY)) ?? '{}') as Info;
      const a = info[region.identifier];
      if (!a) return;
      const lastAt = Number((await AsyncStorage.getItem(LAST_KEY + region.identifier)) ?? 0);
      if (Date.now() - lastAt < QUIET_MS) return; // one nudge per area every two hours at most
      await AsyncStorage.setItem(LAST_KEY + region.identifier, String(Date.now()));
      await notifyNow(`You are at ${a.name}`, `${a.rate}. Open ParkPay to start parking.`);
    });
  } catch {
    /* already defined (hot reload) */
  }
}

function ring(g: AreaGeometry): Position[] {
  return g.type === 'Polygon' ? (g.coordinates[0] ?? []) : (g.coordinates[0]?.[0] ?? []);
}

/** A circle that covers the polygon: centre of its corners, radius to the farthest corner. */
export function circleFor(g: AreaGeometry): { lat: number; lng: number; radius: number } | null {
  const pts = ring(g);
  if (!pts.length) return null;
  const lng = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const far = Math.max(...pts.map((p) => haversineMeters(lat, lng, p[1], p[0])));
  return { lat, lng, radius: Math.min(Math.max(far, 100), 1500) }; // below 100 m phones are unreliable
}

export async function syncArrivalGeofences(areas: ParkingArea[], lat: number, lng: number): Promise<number> {
  if (!backgroundSupported) return 0;
  try {
    if (!(await Location.getBackgroundPermissionsAsync()).granted) return 0;
    const picked = areas
      .filter((a) => a.level === 3) // real lots and streets; city-wide zones would fire all the time
      .map((a) => ({ a, c: circleFor(a.geometry) }))
      .filter((x): x is { a: ParkingArea; c: NonNullable<ReturnType<typeof circleFor>> } => !!x.c)
      .sort((x, y) => haversineMeters(lat, lng, x.c.lat, x.c.lng) - haversineMeters(lat, lng, y.c.lat, y.c.lng))
      .slice(0, MAX_REGIONS);
    if (!picked.length) {
      await stopArrivalGeofences();
      return 0;
    }
    const info: Info = {};
    for (const { a } of picked) {
      const rate = currentRateCents(a.plan, a.timezone, Date.now());
      info[a.id] = { name: a.name, rate: rate === 0 ? 'Free right now' : `${formatMoney(rate, a.plan.currency)} per hour now` };
    }
    await AsyncStorage.setItem(INFO_KEY, JSON.stringify(info));
    await Location.startGeofencingAsync(
      GEOFENCE_TASK,
      picked.map(({ a, c }) => ({ identifier: a.id, latitude: c.lat, longitude: c.lng, radius: c.radius, notifyOnEnter: true, notifyOnExit: false })),
    );
    return picked.length;
  } catch {
    return 0;
  }
}

export async function stopArrivalGeofences() {
  if (!backgroundSupported) return;
  try {
    if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK)) await Location.stopGeofencingAsync(GEOFENCE_TASK);
  } catch {
    /* ignore */
  }
}
