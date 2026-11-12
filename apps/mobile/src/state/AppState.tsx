import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState as RNAppState, Platform } from 'react-native';
import {
  DEMO_OUTSIDE_SPOT,
  DEMO_SPOTS,
  findArea,
  haversineMeters,
  pointInGeometry,
  type ParkingArea,
  type ParkingSession,
  type Role,
  type Vehicle,
} from '@parkpay/shared';
import { demoApi } from '../api/demo';
import { errorMessage } from '../api/errors';
import { liveConfigured, pingBackend, supabaseApi } from '../api/supabase';
import type { Api, Profile } from '../api/types';
import { startLeaveWatch, stopLeaveWatch } from '../lib/background';
import { FAST_MPS, stopArrivalGeofences, syncArrivalGeofences } from '../lib/reminders';
import { withTimeout } from '../lib/boot';
import { cancelSessionReminders, notifyNow, scheduleSessionReminders } from '../lib/notify';

export type Mode = 'live' | 'demo';

export interface Fix {
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  source: 'gps' | 'test';
  label?: string;
}
export type StepState = 'pending' | 'active' | 'ok' | 'fail' | 'skip';
export interface BootStep {
  id: 'storage' | 'server' | 'session';
  label: string;
  state: StepState;
  detail?: string;
}
const INITIAL_STEPS: BootStep[] = [
  { id: 'storage', label: 'Opening saved settings', state: 'pending' },
  { id: 'server', label: 'Reaching the ParkPay server', state: 'pending' },
  { id: 'session', label: 'Checking your sign-in', state: 'pending' },
];

export interface TestSpot {
  name: string;
  lat: number;
  lng: number;
  speed?: number;
}

interface Ctx {
  ready: boolean;
  bootSteps: BootStep[];
  serverReachable: boolean | null;
  skipBoot(): void;
  vehiclesLoaded: boolean;
  sessionLoaded: boolean;
  areasLoaded: boolean;
  areasError: string | null;
  mode: Mode;
  liveAvailable: boolean;
  api: Api;
  user: Profile | null;
  isStaff: boolean;
  vehicles: Vehicle[];
  activeSession: ParkingSession | null;
  areas: ParkingArea[];
  fix: Fix | null;
  locationDenied: boolean;
  currentArea: ParkingArea | null;
  sessionArea: ParkingArea | null;
  leftArea: boolean;
  /** Driving fast while a session is still open (patent claim 1: location change + speed). */
  movingFast: boolean;
  /** True while the one-time sign-up steps (vehicle, permissions) are showing. */
  onboarding: boolean;
  finishOnboarding(): Promise<void>;
  testSpot: TestSpot | null;
  busy: boolean;

  switchMode(m: Mode): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, name: string): Promise<'ok' | 'confirm'>;
  signOut(): Promise<void>;
  setRole(role: Role): Promise<void>;
  refreshUser(): Promise<void>;
  refreshVehicles(): Promise<void>;
  refreshSession(): Promise<void>;
  refreshAll(): Promise<void>;
  refreshLocation(): Promise<Fix | null>;
  setTestSpot(s: TestSpot | null): Promise<void>;
  simulateLeaving(): Promise<void>;
  startParking(vehicleId: string, plannedMinutes?: number | null): Promise<ParkingSession>;
  endParking(): Promise<ParkingSession>;
  deleteAccount(): Promise<void>;
}

const C = createContext<Ctx | null>(null);
export const useApp = () => {
  const v = useContext(C);
  if (!v) throw new Error('useApp outside provider');
  return v;
};

const MODE_KEY = 'parkpay.mode';
const SPOT_KEY = 'parkpay.testSpot';
const ONBOARD_KEY = 'parkpay.onboarded.';
const uuid = () => 'k' + Math.random().toString(36).slice(2) + Date.now().toString(36);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [bootSteps, setBootSteps] = useState<BootStep[]>(INITIAL_STEPS);
  const [serverReachable, setServerReachable] = useState<boolean | null>(null);
  const [mode, setMode] = useState<Mode>(liveConfigured ? 'live' : 'demo');
  const api = mode === 'live' ? supabaseApi : demoApi;
  const [user, setUser] = useState<Profile | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [activeSession, setActiveSession] = useState<ParkingSession | null>(null);
  const [areas, setAreas] = useState<ParkingArea[]>([]);
  const [sessionAreaCache, setSessionAreaCache] = useState<ParkingArea | null>(null);
  // Real GPS is the default. A test spot is used only if the user picked one (it is remembered between launches).
  const [testSpot, setTestSpotState] = useState<TestSpot | null>(null);
  const [gps, setGps] = useState<Fix | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [leftArea, setLeftArea] = useState(false);
  const [busy, setBusy] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [movingFast, setMovingFast] = useState(false);
  const onboardChecked = useRef<string | null>(null);
  const fastCount = useRef(0);
  const notifiedFast = useRef<string | null>(null);
  const outsideCount = useRef(0);
  const notifiedLeft = useRef<string | null>(null);
  const lastPing = useRef(0);
  const lastAreaFetch = useRef<{ lat: number; lng: number } | null>(null);

  const fix: Fix | null = testSpot
    ? { lat: testSpot.lat, lng: testSpot.lng, accuracy: 5, speed: testSpot.speed ?? 0, source: 'test', label: testSpot.name }
    : gps;

  // ---- boot: restore mode, test spot, user ------------------------------------------------
  // Every step has a time limit, and a 15 s watchdog opens the app regardless: the start screen can never hang.
  const step = useCallback(
    (id: BootStep['id'], patch: Partial<BootStep>) => setBootSteps((all) => all.map((x) => (x.id === id ? { ...x, ...patch } : x))),
    [],
  );
  const bootDone = useRef(false);
  const finishBoot = useCallback(() => {
    if (bootDone.current) return;
    bootDone.current = true;
    setReady(true);
  }, []);

  useEffect(() => {
    const dog = setTimeout(() => {
      if (bootDone.current) return;
      setBootSteps((all) => all.map((x) => (x.state === 'ok' || x.state === 'skip' ? x : { ...x, state: 'fail', detail: 'Took too long' })));
      finishBoot();
    }, 15_000);
    (async () => {
      let m: Mode = liveConfigured ? 'live' : 'demo';
      step('storage', { state: 'active' });
      try {
        const stored = (await withTimeout(AsyncStorage.getItem(MODE_KEY), 4000, 'Saved settings')) as Mode | null;
        if (stored === 'demo' || (stored === 'live' && liveConfigured)) m = stored;
        const spot = await withTimeout(AsyncStorage.getItem(SPOT_KEY), 4000, 'Saved settings');
        if (spot === 'gps') setTestSpotState(null);
        else if (spot) setTestSpotState(JSON.parse(spot));
        step('storage', { state: 'ok' });
      } catch (e) {
        step('storage', { state: 'fail', detail: errorMessage(e) });
      }
      setMode(m);

      if (m === 'live') {
        step('server', { state: 'active' });
        const up = await pingBackend();
        setServerReachable(up);
        step('server', up ? { state: 'ok' } : { state: 'fail', detail: 'No connection' });
      } else {
        step('server', { state: 'skip', detail: 'Demo mode' });
      }

      step('session', { state: 'active' });
      try {
        const u = await withTimeout((m === 'live' ? supabaseApi : demoApi).restore(), 8000, 'Sign-in check');
        setUser(u);
        step('session', { state: 'ok', detail: u ? 'Signed in' : 'Not signed in' });
      } catch (e) {
        setUser(null);
        step('session', { state: 'fail', detail: errorMessage(e) });
      }
      finishBoot();
    })();
    return () => clearTimeout(dog);
  }, [step, finishBoot]);

  /** "Open the app now" on the start screen. */
  const skipBoot = useCallback(() => {
    setUser(null);
    finishBoot();
  }, [finishBoot]);

  // ---- real GPS (only when not using a test spot) ----------------------------------------
  useEffect(() => {
    if (testSpot || !user || onboarding || Platform.OS === 'web') return; // during sign-up we explain first, then ask
    let sub: Location.LocationSubscription | undefined;
    let cancelled = false;
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setLocationDenied(true);
        return;
      }
      setLocationDenied(false);
      // show something right away from the last known position, then let the watcher sharpen it
      Location.getLastKnownPositionAsync()
        .then((p) => {
          if (p && !cancelled) setGps((cur) => cur ?? { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, speed: p.coords.speed, source: 'gps' });
        })
        .catch(() => undefined);
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 8 },
        (p) => {
          if (cancelled) return;
          setGps({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, speed: p.coords.speed, source: 'gps' });
        },
      );
    })().catch(() => setLocationDenied(true));
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [testSpot, user, onboarding]);

  // ---- data refresh -----------------------------------------------------------------------
  const [vehiclesLoaded, setVehiclesLoaded] = useState(false);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [areasLoaded, setAreasLoaded] = useState(false);
  const [areasError, setAreasError] = useState<string | null>(null);
  const refreshVehicles = useCallback(async () => {
    try {
      setVehicles(await api.vehicles());
    } finally {
      setVehiclesLoaded(true);
    }
  }, [api]);
  const refreshSession = useCallback(async () => {
    try {
      setActiveSession(await api.activeSession());
    } finally {
      setSessionLoaded(true);
    }
  }, [api]);
  const refreshUser = useCallback(async () => setUser(await api.profile()), [api]);

  /** Re-reads the position now (GPS only). Returns the fix to use, or the last one if the phone cannot answer in time. */
  const refreshLocation = useCallback(async (): Promise<Fix | null> => {
    if (testSpot || Platform.OS === 'web') return fix;
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted) {
        const asked = await Location.requestForegroundPermissionsAsync();
        if (!asked.granted) {
          setLocationDenied(true);
          return gps;
        }
        setLocationDenied(false);
      }
      const p = (await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }), 9000, 'Location')) as Location.LocationObject;
      const next: Fix = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, speed: p.coords.speed, source: 'gps' };
      setGps(next);
      return next;
    } catch {
      return gps;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testSpot, gps?.lat, gps?.lng]);

  const refreshAreas = useCallback(async () => {
    if (!user || !fix) return;
    try {
      const a = await api.areas(fix.lat, fix.lng);
      lastAreaFetch.current = { lat: fix.lat, lng: fix.lng };
      setAreas(a);
      setAreasError(null);
    } catch (e) {
      setAreasError(errorMessage(e));
    } finally {
      setAreasLoaded(true);
    }
  }, [api, user, fix?.lat, fix?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Everything on the Park screen: position, vehicles, running session and nearby areas. */
  const refreshAll = useCallback(async () => {
    await Promise.allSettled([refreshVehicles(), refreshSession(), refreshAreas(), refreshLocation()]);
  }, [refreshVehicles, refreshSession, refreshAreas, refreshLocation]);

  useEffect(() => {
    if (!user) {
      setVehicles([]);
      setActiveSession(null);
      setAreas([]);
      setVehiclesLoaded(false);
      setSessionLoaded(false);
      setAreasLoaded(false);
      setAreasError(null);
      lastAreaFetch.current = null;
      setOnboarding(false);
      onboardChecked.current = null;
      void stopArrivalGeofences();
      return;
    }
    refreshVehicles().catch(() => undefined);
    refreshSession().catch(() => undefined);
  }, [user?.id, api]); // eslint-disable-line react-hooks/exhaustive-deps

  // refresh the profile when the app comes back to the foreground (role may have changed server-side)
  useEffect(() => {
    const s = RNAppState.addEventListener('change', (st) => {
      if (st === 'active' && user) {
        refreshUser().catch(() => undefined);
        refreshSession().catch(() => undefined);
      }
    });
    return () => s.remove();
  }, [user, refreshUser, refreshSession]);

  // areas around the current fix (refetch when we moved > 1 km)
  useEffect(() => {
    if (!user || !fix) return;
    const last = lastAreaFetch.current;
    if (last && haversineMeters(last.lat, last.lng, fix.lat, fix.lng) < 1000 && areas.length) return;
    lastAreaFetch.current = { lat: fix.lat, lng: fix.lng };
    api
      .areas(fix.lat, fix.lng)
      .then((a) => {
        setAreas(a);
        setAreasError(null);
      })
      .catch((e) => {
        lastAreaFetch.current = null; // allow a retry on the next position update
        setAreasError(errorMessage(e));
      })
      .finally(() => setAreasLoaded(true));
  }, [user, fix?.lat, fix?.lng, api]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentArea = useMemo(() => (fix ? findArea(areas, fix.lat, fix.lng) : null), [areas, fix?.lat, fix?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  const sessionArea = useMemo(
    () => areas.find((a) => a.id === activeSession?.area_id) ?? (sessionAreaCache?.id === activeSession?.area_id ? sessionAreaCache : null),
    [areas, activeSession?.area_id, sessionAreaCache],
  );

  // keep the parked area's shape even after the list of nearby areas changes (needed for "did you leave?")
  useEffect(() => {
    if (!activeSession) {
      setSessionAreaCache(null);
      return;
    }
    const hit = areas.find((a) => a.id === activeSession.area_id);
    if (hit) setSessionAreaCache(hit);
    else if (sessionAreaCache?.id !== activeSession.area_id) api.area(activeSession.area_id).then(setSessionAreaCache).catch(() => undefined);
  }, [activeSession?.id, areas]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- "did you leave?" (patent claim 1 reminder) while the app is open ------------------
  useEffect(() => {
    if (!activeSession || !sessionArea || !fix) {
      setLeftArea(false);
      outsideCount.current = 0;
      return;
    }
    const inside = pointInGeometry(fix.lat, fix.lng, sessionArea.geometry);
    if (inside) {
      outsideCount.current = 0;
      setLeftArea(false);
      return;
    }
    outsideCount.current += 1;
    const moving = (fix.speed ?? 0) > 2 || fix.source === 'test';
    if (outsideCount.current >= (fix.source === 'test' ? 1 : 2) && moving) {
      setLeftArea(true);
      if (notifiedLeft.current !== activeSession.id) {
        notifiedLeft.current = activeSession.id;
        notifiedFast.current = activeSession.id; // one notification for leaving, not a second one for speed
        const driving = (fix.speed ?? 0) >= FAST_MPS;
        void notifyNow(
          driving ? 'Driving with parking still running' : 'Did you leave?',
          driving
            ? `You have left ${sessionArea.name} and are moving fast. End your parking session to stop paying.`
            : `You are no longer in ${sessionArea.name}. End your parking session to stop the meter.`,
        );
      }
    }
  }, [fix?.lat, fix?.lng, fix?.speed, activeSession?.id, sessionArea?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // breadcrumbs to the server while parked (live mode, at most once a minute)
  useEffect(() => {
    if (!activeSession || !fix || fix.source !== 'gps' || Date.now() - lastPing.current < 60_000) return;
    lastPing.current = Date.now();
    api.ping(activeSession.id, fix.lat, fix.lng, fix.accuracy, fix.speed).catch(() => undefined);
  }, [fix?.lat, fix?.lng, activeSession?.id, api]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- one-time sign-up steps: an account with no vehicle sees them once ----------------
  useEffect(() => {
    // checked once per sign-in, when the vehicle list first arrives (removing your last car later does not re-trigger it)
    if (!user || !vehiclesLoaded || onboardChecked.current === user.id) return;
    onboardChecked.current = user.id;
    if (user.role !== 'driver' || vehicles.length > 0 || onboarding) return;
    let cancelled = false;
    AsyncStorage.getItem(ONBOARD_KEY + user.id)
      .then((done) => {
        if (!done && !cancelled) setOnboarding(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user?.id, vehiclesLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const finishOnboarding = useCallback(async () => {
    if (user) await AsyncStorage.setItem(ONBOARD_KEY + user.id, '1').catch(() => undefined);
    setOnboarding(false);
  }, [user]);

  // ---- "moving fast with a session open" ------------------------------------------------
  useEffect(() => {
    if (!activeSession || !fix) {
      fastCount.current = 0;
      setMovingFast(false);
      return;
    }
    if ((fix.speed ?? 0) >= FAST_MPS) fastCount.current += 1;
    else {
      fastCount.current = 0;
      setMovingFast(false);
      return;
    }
    if (fastCount.current >= (fix.source === 'test' ? 1 : 3)) {
      setMovingFast(true);
      if (notifiedFast.current !== activeSession.id) {
        notifiedFast.current = activeSession.id;
        void notifyNow('Driving with parking still running', `You are moving fast but your session in ${activeSession.area_name} is still open. End it to stop paying.`);
      }
    }
  }, [fix?.lat, fix?.lng, fix?.speed, activeSession?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- arrival reminders: keep the phone's geofences on the nearest areas ---------------
  useEffect(() => {
    if (!user || !fix || fix.source !== 'gps' || !areas.length) return;
    void syncArrivalGeofences(areas, fix.lat, fix.lng);
  }, [areas, user?.id, lastAreaFetch.current?.lat, lastAreaFetch.current?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- actions ----------------------------------------------------------------------------
  const signIn = useCallback(async (email: string, password: string) => setUser(await api.signIn(email, password)), [api]);
  const signUp = useCallback(
    async (email: string, password: string, name: string) => {
      const u = await api.signUp(email, password, name);
      if (!u) return 'confirm' as const;
      setOnboarding(true); // straight into vehicle details, in the same flow
      setUser(u);
      return 'ok' as const;
    },
    [api],
  );
  const signOut = useCallback(async () => {
    await api.signOut();
    setUser(null);
  }, [api]);

  const switchMode = useCallback(
    async (m: Mode) => {
      if (m === 'live' && !liveConfigured) return;
      await api.signOut().catch(() => undefined);
      setUser(null);
      setMode(m);
      await AsyncStorage.setItem(MODE_KEY, m).catch(() => undefined);
    },
    [api],
  );

  const setRole = useCallback(
    async (role: Role) => {
      if (!api.demoSetRole) return;
      setUser(await api.demoSetRole(role));
    },
    [api],
  );

  const setTestSpot = useCallback(async (s: TestSpot | null) => {
    setTestSpotState(s);
    await AsyncStorage.setItem(SPOT_KEY, s ? JSON.stringify(s) : 'gps').catch(() => undefined);
  }, []);

  const simulateLeaving = useCallback(async () => {
    await setTestSpot({ name: 'Driving away (simulated)', lat: DEMO_OUTSIDE_SPOT.lat, lng: DEMO_OUTSIDE_SPOT.lng, speed: 12 });
  }, [setTestSpot]);

  const startParking = useCallback(
    async (vehicleId: string, plannedMinutes: number | null = null) => {
      setBusy(true);
      try {
        // Ask the phone for a fresh position right now, so the session starts where the car actually is.
        const here = (await refreshLocation()) ?? fix;
        if (!here) throw new Error('We could not find your location. Turn on location for ParkPay, or pick a test spot.');
        const s = await api.startSession({ vehicleId, lat: here.lat, lng: here.lng, accuracy: here.accuracy, speed: here.speed, key: uuid(), plannedMinutes });
        setActiveSession(s);
        notifiedLeft.current = null;
        const area = areas.find((a) => a.id === s.area_id);
        void scheduleSessionReminders(s.id, s.area_name, s.max_stay_minutes, s.planned_minutes ?? null);
        if (area) void startLeaveWatch({ areaName: area.name, geometry: area.geometry });
        return s;
      } finally {
        setBusy(false);
      }
    },
    [api, fix, areas, refreshLocation],
  );

  const endParking = useCallback(async () => {
    if (!activeSession) throw new Error('No active session');
    setBusy(true);
    try {
      const done = await api.endSession(activeSession.id, fix?.lat, fix?.lng);
      setActiveSession(null);
      setLeftArea(false);
      void cancelSessionReminders(activeSession.id);
      void stopLeaveWatch();
      return done;
    } finally {
      setBusy(false);
    }
  }, [api, activeSession, fix]);

  const deleteAccount = useCallback(async () => {
    await api.deleteAccount();
    await AsyncStorage.multiRemove([SPOT_KEY, MODE_KEY]).catch(() => undefined);
    setUser(null);
  }, [api]);

  const value: Ctx = {
    ready,
    bootSteps,
    serverReachable,
    skipBoot,
    vehiclesLoaded,
    sessionLoaded,
    areasLoaded,
    areasError,
    mode,
    liveAvailable: liveConfigured,
    api,
    user,
    isStaff: !!user && user.role !== 'driver',
    vehicles,
    activeSession,
    areas,
    fix,
    locationDenied,
    currentArea,
    sessionArea,
    leftArea,
    movingFast,
    onboarding,
    finishOnboarding,
    testSpot,
    busy,
    switchMode,
    signIn,
    signUp,
    signOut,
    setRole,
    refreshUser,
    refreshVehicles,
    refreshSession,
    refreshAll,
    refreshLocation,
    setTestSpot,
    simulateLeaving,
    startParking,
    endParking,
    deleteAccount,
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}

export { errorMessage };
