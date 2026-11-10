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
import { liveConfigured, supabaseApi } from '../api/supabase';
import type { Api, Profile } from '../api/types';
import { startLeaveWatch, stopLeaveWatch } from '../lib/background';
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
export interface TestSpot {
  name: string;
  lat: number;
  lng: number;
  speed?: number;
}

interface Ctx {
  ready: boolean;
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
  setTestSpot(s: TestSpot | null): Promise<void>;
  simulateLeaving(): Promise<void>;
  startParking(vehicleId: string): Promise<ParkingSession>;
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
const uuid = () => 'k' + Math.random().toString(36).slice(2) + Date.now().toString(36);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>(liveConfigured ? 'live' : 'demo');
  const api = mode === 'live' ? supabaseApi : demoApi;
  const [user, setUser] = useState<Profile | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [activeSession, setActiveSession] = useState<ParkingSession | null>(null);
  const [areas, setAreas] = useState<ParkingArea[]>([]);
  const [sessionAreaCache, setSessionAreaCache] = useState<ParkingArea | null>(null);
  const [testSpot, setTestSpotState] = useState<TestSpot | null>(DEMO_SPOTS[0]);
  const [gps, setGps] = useState<Fix | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [leftArea, setLeftArea] = useState(false);
  const [busy, setBusy] = useState(false);
  const outsideCount = useRef(0);
  const notifiedLeft = useRef<string | null>(null);
  const lastPing = useRef(0);
  const lastAreaFetch = useRef<{ lat: number; lng: number } | null>(null);

  const fix: Fix | null = testSpot
    ? { lat: testSpot.lat, lng: testSpot.lng, accuracy: 5, speed: testSpot.speed ?? 0, source: 'test', label: testSpot.name }
    : gps;

  // ---- boot: restore mode, test spot, user ------------------------------------------------
  useEffect(() => {
    (async () => {
      let m: Mode = liveConfigured ? 'live' : 'demo';
      try {
        const stored = (await AsyncStorage.getItem(MODE_KEY)) as Mode | null;
        if (stored === 'demo' || (stored === 'live' && liveConfigured)) m = stored;
        const spot = await AsyncStorage.getItem(SPOT_KEY);
        if (spot === 'gps') setTestSpotState(null);
        else if (spot) setTestSpotState(JSON.parse(spot));
      } catch {
        /* defaults */
      }
      setMode(m);
      try {
        const u = await (m === 'live' ? supabaseApi : demoApi).restore();
        setUser(u);
      } catch {
        setUser(null);
      }
      setReady(true);
    })();
  }, []);

  // ---- real GPS (only when not using a test spot) ----------------------------------------
  useEffect(() => {
    if (testSpot || !user || Platform.OS === 'web') return;
    let sub: Location.LocationSubscription | undefined;
    let cancelled = false;
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setLocationDenied(true);
        return;
      }
      setLocationDenied(false);
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
  }, [testSpot, user]);

  // ---- data refresh -----------------------------------------------------------------------
  const refreshVehicles = useCallback(async () => setVehicles(await api.vehicles()), [api]);
  const refreshSession = useCallback(async () => setActiveSession(await api.activeSession()), [api]);
  const refreshUser = useCallback(async () => setUser(await api.profile()), [api]);

  useEffect(() => {
    if (!user) {
      setVehicles([]);
      setActiveSession(null);
      setAreas([]);
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
    api.areas(fix.lat, fix.lng).then(setAreas).catch(() => undefined);
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
        void notifyNow('Did you leave?', `You are no longer in ${sessionArea.name}. End your parking session to stop the meter.`);
      }
    }
  }, [fix?.lat, fix?.lng, fix?.speed, activeSession?.id, sessionArea?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // breadcrumbs to the server while parked (live mode, at most once a minute)
  useEffect(() => {
    if (!activeSession || !fix || fix.source !== 'gps' || Date.now() - lastPing.current < 60_000) return;
    lastPing.current = Date.now();
    api.ping(activeSession.id, fix.lat, fix.lng, fix.accuracy, fix.speed).catch(() => undefined);
  }, [fix?.lat, fix?.lng, activeSession?.id, api]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- actions ----------------------------------------------------------------------------
  const signIn = useCallback(async (email: string, password: string) => setUser(await api.signIn(email, password)), [api]);
  const signUp = useCallback(
    async (email: string, password: string, name: string) => {
      const u = await api.signUp(email, password, name);
      if (!u) return 'confirm' as const;
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
    async (vehicleId: string) => {
      if (!fix) throw new Error('Waiting for your location…');
      setBusy(true);
      try {
        const s = await api.startSession({ vehicleId, lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, speed: fix.speed, key: uuid() });
        setActiveSession(s);
        notifiedLeft.current = null;
        const area = areas.find((a) => a.id === s.area_id);
        void scheduleSessionReminders(s.id, s.area_name, s.max_stay_minutes);
        if (area) void startLeaveWatch({ areaName: area.name, geometry: area.geometry });
        return s;
      } finally {
        setBusy(false);
      }
    },
    [api, fix, areas],
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
    setTestSpot,
    simulateLeaving,
    startParking,
    endParking,
    deleteAccount,
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}

export { errorMessage };
