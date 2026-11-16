// Operator / platform admin calls, used by the ParkPay Admin app. The same row-level-security RPCs the web console
// uses, so the server enforces who may see and change what; the app only shows what it is given.
import type { AreaGeometry, ParkingArea, RateRule } from '@parkpay/shared';
import { rpc } from './supabase';

export type OperatorArea = ParkingArea & { active: boolean };
export interface Report {
  sessions: number; active_now: number; revenue_cents: number; platform_fee_cents: number; operator_payout_cents: number;
  citations: number; citation_cents: number; by_area: { area_name: string; sessions: number; revenue_cents: number }[];
}
export interface ActiveSession { session_id: string; plate: string; area_name: string; started_at: string }
export interface AreaCheck { area_m2: number; valid: boolean; problems: string[]; overlaps: { name: string; same_operator: boolean; published: boolean; overlap_m2: number }[] }
export interface StaffRow { id: string; email: string; full_name: string; role: string; operator_id: string | null; operator_name: string | null; is_me: boolean }
export interface PlanInput { name: string; min_charge_cents: number; daily_max_cents: number | null; grace_minutes: number; rules: RateRule[] }

export const adminApi = {
  report: (days: number) => rpc<Report>('operator_report', { p_from: new Date(Date.now() - days * 86_400_000).toISOString(), p_to: new Date().toISOString() }),
  activeSessions: () => rpc<ActiveSession[]>('operator_active_sessions'),
  areas: () => rpc<OperatorArea[]>('operator_areas'),
  checkArea: (id: string | null, level: 2 | 3, g: AreaGeometry) => rpc<AreaCheck>('operator_check_area', { p_area_id: id, p_level: level, p_geojson: g }),
  saveArea: (a: { id: string | null; name: string; level: 2 | 3; geometry: AreaGeometry; maxStay: number | null; active: boolean; plan: PlanInput }) =>
    rpc<OperatorArea>('operator_save_area', { p_area_id: a.id, p_name: a.name, p_level: a.level, p_geojson: a.geometry, p_max_stay: a.maxStay, p_active: a.active, p_plan: a.plan }),
  setCapacity: (id: string, spaces: number | null) => rpc<OperatorArea>('operator_set_area_capacity', { p_area_id: id, p_total_spaces: spaces }),
  setHours: (id: string, closing: string) => rpc<OperatorArea>('operator_set_area_hours', { p_area_id: id, p_closing_time: closing }),
  publish: (id: string, on: boolean) => rpc<OperatorArea>('operator_publish_area', { p_area_id: id, p_publish: on }),
  archive: (id: string) => rpc('operator_archive_area', { p_area_id: id }),
  staff: () => rpc<StaffRow[]>('operator_staff'),
  operators: () => rpc<{ id: string; name: string }[]>('admin_operators'),
  setRole: (email: string, role: string, operatorId: string | null) => rpc('set_staff_role', { p_email: email, p_role: role, p_operator_id: operatorId }),
};

const AREA_ERRORS: Record<string, string> = {
  area_too_small: 'This shape is smaller than one parking bay (10 m²).',
  area_too_large: 'This shape is too large for a parking area (over 5 km²). Use a city zone.',
  area_too_complex: 'This shape has too many points.',
  area_overlaps_other_operator: "This shape overlaps another operator's published area, so it cannot be published.",
  invalid_geometry: 'This shape is not valid. Draw it again.',
  invalid_time: 'Write the closing time as HH:MM, for example 23:00, or leave it empty.',
  invalid_capacity: 'Spaces must be a whole number from 1 to 100,000, or empty if you do not count spaces.',
  area_has_active_sessions: 'A vehicle is parked here right now. Unpublish it and archive it once it is empty.',
  area_not_found: 'That area belongs to another operator.',
  operator_required: 'Your account is not linked to an operator.',
  no_rate_plan: 'Add at least one hourly rate and save before publishing.',
  user_not_found: 'No account with that email. The person must first create an account in a ParkPay app.',
  cannot_change_own_role: 'You cannot change your own role. Ask another admin.',
  forbidden: 'Your role is not allowed to make this change.',
};
export function adminError(e: unknown): string {
  const m = (e as { code?: string; message?: string })?.message ?? String(e);
  const c = (e as { code?: string })?.code ?? '';
  const k = Object.keys(AREA_ERRORS).find((x) => m.includes(x) || c === x);
  return k ? AREA_ERRORS[k] : m;
}
