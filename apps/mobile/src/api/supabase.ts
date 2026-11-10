import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Citation, NearbyVehicle, ParkingArea, ParkingSession, PlateCheck, Vehicle } from '@parkpay/shared';
import { normalizePlate } from '@parkpay/shared';
import { toApiError } from './errors';
import type { Api, CitationInput, Profile, StartInput } from './types';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '';
export const liveConfigured = SUPABASE_URL.startsWith('http') && SUPABASE_KEY.length > 10;

let client: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
    });
  }
  return client;
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb().rpc(fn, args);
  if (error) throw toApiError(error);
  return data as T;
}

async function myAccountId(): Promise<string> {
  const { data, error } = await sb().from('account_member').select('account_id').limit(1).single();
  if (error) throw toApiError(error);
  return data.account_id as string;
}

const num = (n: number | null | undefined) => (n == null ? null : Number(n.toFixed(2)));

export const supabaseApi: Api = {
  mode: 'live',

  async restore() {
    const { data } = await sb().auth.getSession();
    if (!data.session) return null;
    try {
      return await rpc<Profile>('my_profile');
    } catch {
      return null; // deleted or expired account
    }
  },
  async signIn(email, password) {
    const { error } = await sb().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) throw toApiError(error);
    return rpc<Profile>('my_profile');
  },
  async signUp(email, password, fullName) {
    const { data, error } = await sb().auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { full_name: fullName.trim() } },
    });
    if (error) throw toApiError(error);
    if (!data.session) return null; // email confirmation required
    return rpc<Profile>('my_profile');
  },
  async signOut() {
    await sb().auth.signOut();
  },
  profile: () => rpc<Profile>('my_profile'),
  async updateName(name) {
    await rpc('update_profile', { p_full_name: name });
  },
  async deleteAccount() {
    await rpc('delete_my_account');
    await sb().auth.signOut().catch(() => undefined);
  },

  async vehicles() {
    const { data, error } = await sb()
      .from('vehicle')
      .select('id, plate, plate_region, nickname, is_default')
      .is('archived_at', null)
      .order('created_at');
    if (error) throw toApiError(error);
    return (data ?? []) as Vehicle[];
  },
  async addVehicle(v) {
    const account_id = await myAccountId();
    const existing = await this.vehicles();
    const { data, error } = await sb()
      .from('vehicle')
      .insert({
        account_id,
        plate: normalizePlate(v.plate),
        plate_region: v.region?.trim().toUpperCase() || null,
        plate_country: 'CA',
        nickname: v.nickname?.trim() || null,
        is_default: existing.length === 0,
      })
      .select('id, plate, plate_region, nickname, is_default')
      .single();
    if (error) throw toApiError(error);
    return data as Vehicle;
  },
  async removeVehicle(id) {
    const { error } = await sb().from('vehicle').update({ archived_at: new Date().toISOString(), is_default: false }).eq('id', id);
    if (error) throw toApiError(error);
  },
  async setDefaultVehicle(id) {
    const account_id = await myAccountId();
    const a = await sb().from('vehicle').update({ is_default: false }).eq('account_id', account_id).eq('is_default', true);
    if (a.error) throw toApiError(a.error);
    const b = await sb().from('vehicle').update({ is_default: true }).eq('id', id);
    if (b.error) throw toApiError(b.error);
  },

  areas: (lat, lng) => rpc<ParkingArea[]>('list_areas', { p_lat: lat, p_lng: lng, p_radius_m: 4000 }),
  area: (id) => rpc<ParkingArea | null>('get_area', { p_area_id: id }),
  startSession: (i: StartInput) =>
    rpc<ParkingSession>('start_session', {
      p_vehicle_id: i.vehicleId,
      p_lat: i.lat,
      p_lng: i.lng,
      p_accuracy: num(i.accuracy),
      p_speed: num(i.speed),
      p_idempotency_key: i.key,
    }),
  endSession: (id, lat, lng) => rpc<ParkingSession>('end_session', { p_session_id: id, p_lat: lat ?? null, p_lng: lng ?? null }),
  activeSession: () => rpc<ParkingSession | null>('my_active_session'),
  sessions: () => rpc<ParkingSession[]>('my_sessions', { p_limit: 100 }),
  async ping(sessionId, lat, lng, accuracy, speed) {
    await rpc('session_ping', { p_session_id: sessionId, p_lat: lat, p_lng: lng, p_accuracy: num(accuracy), p_speed: num(speed) });
  },

  officerCheck: (plate, lat, lng) => rpc<PlateCheck>('officer_check_plate', { p_plate: plate, p_region: null, p_lat: lat ?? null, p_lng: lng ?? null }),
  officerNearby: (lat, lng, radius) => rpc<NearbyVehicle[]>('officer_valid_vehicles', { p_lat: lat, p_lng: lng, p_radius_m: radius }),
  officerCite: (i: CitationInput) =>
    rpc<Citation>('officer_issue_citation', {
      p_plate: i.plate,
      p_region: i.region ?? null,
      p_reason: i.reason,
      p_fine_cents: i.fineCents,
      p_lat: i.lat ?? null,
      p_lng: i.lng ?? null,
    }),
  officerCitations: () => rpc<Citation[]>('officer_recent_citations', { p_limit: 30 }),
};
