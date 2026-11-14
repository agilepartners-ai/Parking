import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEMO_AREAS,
  DEMO_PLATE_FOR_OFFICER,
  computeFeeCents,
  findArea,
  haversineMeters,
  geometryCenter,
  normalizePlate,
  pointInGeometry,
  splitFee,
  type Citation,
  type NearbyVehicle,
  type ParkingArea,
  type ParkingSession,
  type PlateCheck,
  type Role,
  type Vehicle,
} from '@parkpay/shared';
import { ApiError } from './errors';
import type { Api, CitationInput, Profile } from './types';

/**
 * Offline demo backend. Same rules as the SQL functions (area lookup, fee engine, one active session per
 * vehicle, officer checks) but everything lives on the phone. Lets anyone try the full flow with no accounts.
 */

interface DemoState {
  user: Profile | null;
  vehicles: Vehicle[];
  sessions: (ParkingSession & { _lat?: number; _lng?: number })[];
  citations: Citation[];
  receiptSeq: number;
}

const KEY = 'parkpay.demo.v1';
const uid = () => 'demo-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function seeded(): DemoState {
  const city = DEMO_AREAS.find((a) => a.name === 'City Hall Lot')!;
  const c = geometryCenter(city.geometry);
  return {
    user: null,
    vehicles: [],
    // another driver's car, so an officer can look up a plate that IS paid (try DEMO123)
    sessions: [
      {
        id: 'demo-other-car',
        vehicle_id: 'other',
        plate: DEMO_PLATE_FOR_OFFICER,
        area_id: city.id,
        area_name: city.name,
        rate_plan_id: city.plan.id,
        status: 'active',
        started_at: new Date(Date.now() - 30 * 60_000).toISOString(),
        ended_at: null,
        duration_minutes: null,
        fee_cents: null,
        service_fee_cents: null,
        operator_payout_cents: null,
        currency: 'CAD',
        max_stay_minutes: city.max_stay_minutes,
        receipt_no: null,
        _lat: c.lat,
        _lng: c.lng,
      },
    ],
    citations: [],
    receiptSeq: 1,
  };
}

let cache: DemoState | null = null;
async function load(): Promise<DemoState> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as DemoState) : seeded();
  } catch {
    cache = seeded();
  }
  return cache;
}
async function save() {
  if (cache) await AsyncStorage.setItem(KEY, JSON.stringify(cache)).catch(() => undefined);
}

const mine = (s: DemoState) => s.sessions.filter((x) => x.vehicle_id !== 'other');
const strip = ({ _lat, _lng, ...rest }: ParkingSession & { _lat?: number; _lng?: number }): ParkingSession => rest;
const areaById = (id: string) => DEMO_AREAS.find((a) => a.id === id) as ParkingArea;

function requireStaff(s: DemoState) {
  if (!s.user || s.user.role === 'driver') throw new ApiError('forbidden');
}

export const demoApi: Api = {
  mode: 'demo',

  async restore() {
    return (await load()).user;
  },
  async signIn(email) {
    const s = await load();
    if (!s.user) s.user = { id: 'demo-user', full_name: 'Demo Driver', email: email || 'demo@parkpay.app', role: 'driver', operator_id: null };
    await save();
    return s.user;
  },
  async signUp(email, _password, fullName) {
    const s = await load();
    s.user = { id: 'demo-user', full_name: fullName || 'Demo Driver', email, role: 'driver', operator_id: null };
    await save();
    return s.user;
  },
  async signOut() {
    const s = await load();
    s.user = null;
    await save();
  },
  async profile() {
    const s = await load();
    if (!s.user) throw new ApiError('not_authenticated');
    return s.user;
  },
  async updateName(name) {
    const s = await load();
    if (s.user) s.user.full_name = name;
    await save();
  },
  async deleteAccount() {
    const s = await load();
    if (mine(s).some((x) => x.status === 'active')) throw new ApiError('end_active_session_first');
    cache = seeded();
    await save();
  },
  async demoSetRole(role: Role) {
    const s = await load();
    if (!s.user) throw new ApiError('not_authenticated');
    s.user.role = role;
    s.user.operator_id = role === 'driver' ? null : DEMO_AREAS[0].operator_id;
    await save();
    return s.user;
  },

  async vehicles() {
    return (await load()).vehicles;
  },
  async addVehicle(v) {
    const s = await load();
    const plate = normalizePlate(v.plate);
    if (plate.length < 2 || plate.length > 10) throw new ApiError('invalid_plate');
    if (s.vehicles.some((x) => x.plate === plate)) throw new ApiError('duplicate_vehicle', 'You already added this plate.');
    const veh: Vehicle = { id: uid(), plate, plate_region: v.region?.trim().toUpperCase() || null, nickname: v.nickname?.trim() || null, is_default: s.vehicles.length === 0, make: v.make?.trim() || null, model: v.model?.trim() || null, colour: v.colour?.trim() || null, size_class: v.size_class ?? 'standard' };
    s.vehicles.push(veh);
    await save();
    return veh;
  },
  async removeVehicle(id) {
    const s = await load();
    s.vehicles = s.vehicles.filter((x) => x.id !== id);
    if (s.vehicles.length && !s.vehicles.some((x) => x.is_default)) s.vehicles[0].is_default = true;
    await save();
  },
  async setDefaultVehicle(id) {
    const s = await load();
    s.vehicles.forEach((x) => (x.is_default = x.id === id));
    await save();
  },

  async areas() {
    return DEMO_AREAS;
  },
  async area(id) {
    return DEMO_AREAS.find((a) => a.id === id) ?? null;
  },

  async startSession(i) {
    const s = await load();
    const prior = s.sessions.find((x) => (x as { _key?: string })._key === i.key);
    if (prior) return strip(prior);
    const veh = s.vehicles.find((x) => x.id === i.vehicleId);
    if (!veh) throw new ApiError('vehicle_not_found');
    const area = findArea(DEMO_AREAS, i.lat, i.lng);
    if (!area) throw new ApiError('no_parking_area');
    if (s.sessions.some((x) => x.status === 'active' && x.plate === veh.plate)) throw new ApiError('session_already_active');
    const sess = {
      id: uid(),
      vehicle_id: veh.id,
      plate: veh.plate,
      area_id: area.id,
      area_name: area.name,
      rate_plan_id: area.plan.id,
      status: 'active' as const,
      started_at: new Date().toISOString(),
      ended_at: null,
      duration_minutes: null,
      fee_cents: null,
      service_fee_cents: null,
      operator_payout_cents: null,
      currency: area.plan.currency,
      max_stay_minutes: area.max_stay_minutes,
      receipt_no: null,
      planned_minutes: i.plannedMinutes ? Math.min(i.plannedMinutes, area.max_stay_minutes ?? 1440) : null,
      _lat: i.lat,
      _lng: i.lng,
      _key: i.key,
    };
    s.sessions.unshift(sess);
    await save();
    return strip(sess);
  },
  async requestPasswordReset() {
    /* demo mode has no passwords */
  },
  async extendSession(id, plannedMinutes) {
    const s = await load();
    const sess = mine(s).find((x) => x.id === id);
    if (!sess) throw new ApiError('session_not_found');
    if (sess.status !== 'active') throw new ApiError('session_not_active');
    const max = areaById(sess.area_id).max_stay_minutes ?? 1440;
    const elapsed = Math.ceil((Date.now() - Date.parse(sess.started_at)) / 60_000);
    sess.planned_minutes = plannedMinutes && plannedMinutes > 0 ? Math.min(Math.max(plannedMinutes, elapsed + 1), max) : null;
    await save();
    return strip(sess);
  },
  async endSession(id) {
    const s = await load();
    const sess = mine(s).find((x) => x.id === id);
    if (!sess) throw new ApiError('session_not_found');
    if (sess.status !== 'active') throw new ApiError('session_not_active');
    const area = areaById(sess.area_id);
    const end = Date.now();
    const fee = computeFeeCents(area.plan, area.timezone, Date.parse(sess.started_at), end);
    const split = splitFee(fee, area.service_fee_bps);
    sess.status = 'completed';
    sess.ended_at = new Date(end).toISOString();
    sess.duration_minutes = Math.max(1, Math.ceil((end - Date.parse(sess.started_at)) / 60_000));
    sess.fee_cents = fee;
    sess.service_fee_cents = split.serviceFeeCents;
    sess.operator_payout_cents = split.operatorPayoutCents;
    sess.receipt_no = `PP-${new Date(end).getFullYear()}-${String(s.receiptSeq++).padStart(6, '0')}`;
    await save();
    return strip(sess);
  },
  async activeSession() {
    const s = await load();
    const a = mine(s).find((x) => x.status === 'active');
    return a ? strip(a) : null;
  },
  async sessions() {
    return mine(await load()).map(strip);
  },
  async ping() {
    /* nothing to store in demo mode */
  },

  async officerCheck(plate, lat, lng): Promise<PlateCheck> {
    const s = await load();
    requireStaff(s);
    const p = normalizePlate(plate);
    if (p.length < 2) throw new ApiError('invalid_plate');
    const here = lat != null && lng != null ? findArea(DEMO_AREAS, lat, lng) : null;
    const sess = s.sessions.find((x) => x.status === 'active' && x.plate === p);
    if (!sess) return { result: 'no_session', plate: p, area_name: null, started_at: null, message: 'No active parking session for this plate.' };
    const area = areaById(sess.area_id);
    if (area.max_stay_minutes && Date.parse(sess.started_at) + area.max_stay_minutes * 60_000 < Date.now()) {
      return { result: 'expired', plate: p, area_name: area.name, started_at: sess.started_at, message: `Session exceeded the maximum stay of ${area.max_stay_minutes} min.` };
    }
    if (here && here.id !== area.id && here.level >= area.level) {
      return { result: 'wrong_area', plate: p, area_name: area.name, started_at: sess.started_at, message: `Paid for ${area.name}, but vehicle is in a different area.` };
    }
    return { result: 'valid', plate: p, area_name: area.name, started_at: sess.started_at, message: `Valid: paid in ${area.name}.` };
  },
  async officerNearby(lat, lng, radius): Promise<NearbyVehicle[]> {
    const s = await load();
    requireStaff(s);
    return s.sessions
      .filter((x) => x.status === 'active' && x._lat != null && x._lng != null && haversineMeters(lat, lng, x._lat, x._lng) <= radius)
      .map((x) => ({ session_id: x.id, plate: x.plate, area_name: x.area_name, started_at: x.started_at }));
  },
  async officerCite(i: CitationInput): Promise<Citation> {
    const s = await load();
    requireStaff(s);
    const plate = normalizePlate(i.plate);
    if (plate.length < 2) throw new ApiError('invalid_plate');
    if (!i.fineCents || i.fineCents <= 0 || i.fineCents > 50000) throw new ApiError('invalid_fine');
    if (!i.reason || i.reason.trim().length < 3) throw new ApiError('reason_required');
    const area = i.lat != null && i.lng != null ? findArea(DEMO_AREAS, i.lat, i.lng) : null;
    const c: Citation = { status: 'issued', id: uid(), plate, area_name: area?.name ?? null, reason: i.reason.trim(), fine_cents: i.fineCents, currency: 'CAD', issued_at: new Date().toISOString() };
    s.citations.unshift(c);
    await save();
    return c;
  },
  async myCitations() {
    const s = await load();
    const mine = new Set(s.vehicles.map((v) => v.plate));
    return s.citations.filter((c) => mine.has(c.plate) && c.status !== 'void');
  },
  async payCitation(id: string) {
    const s = await load();
    const c = s.citations.find((x) => x.id === id);
    if (!c) throw new ApiError('citation_not_found');
    c.status = 'paid';
    await save();
  },
  async officerCitations() {
    const s = await load();
    requireStaff(s);
    return s.citations;
  },
};

export { pointInGeometry };
