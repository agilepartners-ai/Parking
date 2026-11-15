// End-to-end smoke test of the DRIVER flow against the real project, through the same public API the app uses
// (publishable key + a signed-in user, row-level security on). It creates a throwaway driver account,
// runs the flow, then deletes that account and everything it made, so the live project stays clean.
//   node scripts/live-smoke.mjs
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { connect } from '../supabase/db.mjs'; // also loads ./.env (secret key, server side only)

const root = new URL('..', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const env = Object.fromEntries(read('apps/mobile/.env').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));

const svc = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const email = `smoke-${Date.now()}@parkpay.test`;
const password = randomBytes(12).toString('base64url');
const created = await svc.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'Smoke Test' } });
if (created.error) throw created.error;
async function cleanup() {
  const db = await connect();
  const T = `select id from app_user where email = '${email}'`;
  await db.query(`delete from payment where session_id in (select id from parking_session where user_id in (${T}))`);
  await db.query(`delete from parking_session where user_id in (${T})`);
  await db.query(`delete from audit_log where actor_user_id in (${T})`);
  await db.query(`delete from account where owner_user_id in (${T})`);
  await db.query(`delete from app_user where id in (${T})`);
  await db.end();
  await svc.auth.admin.deleteUser(created.data.user.id);
}

const sb = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_KEY, { auth: { persistSession: false } });
let failed = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) failed++;
  console.log(`${cond ? '  ok  ' : '  FAIL'} ${name}${cond ? '' : ' ' + extra}`);
};
const rpc = async (fn, args) => {
  const { data, error } = await sb.rpc(fn, args);
  return error ? { error: error.message } : { data };
};

const CITY = { lat: 43.6526, lng: -79.3832 };
const anon = await rpc('list_areas', { p_lat: CITY.lat, p_lng: CITY.lng, p_radius_m: 5000 });
ok('signed-out caller is refused', !!anon.error, JSON.stringify(anon).slice(0, 120));

const { error: signErr } = await sb.auth.signInWithPassword({ email, password });
ok('throwaway driver signs in', !signErr, signErr?.message);
if (signErr) { await cleanup(); process.exit(1); }

const profile = await rpc('my_profile');
ok('profile loads with role driver', profile.data?.role === 'driver', JSON.stringify(profile));

// leftovers from an interrupted earlier run
const stale = await rpc('my_active_session');
if (stale.data?.id) await rpc('end_session', { p_session_id: stale.data.id });

const areas = await rpc('list_areas', { p_lat: CITY.lat, p_lng: CITY.lng, p_radius_m: 5000 });
const city = areas.data?.find((a) => a.name === 'City Hall Lot');
ok('nearby areas include City Hall Lot with a tariff', !!city?.plan?.rules?.length, JSON.stringify(areas).slice(0, 160));
ok('areas carry the new closing_time field', city && 'closing_time' in city);
const det = await rpc('detect_area', { p_lat: CITY.lat, p_lng: CITY.lng });
ok('server detects the same area', det.data?.id === city?.id, JSON.stringify(det).slice(0, 120));

const { data: mem } = await sb.from('account_member').select('account_id').limit(1).single();
let { data: vehicles } = await sb.from('vehicle').select('id, plate, make, size_class').is('archived_at', null);
if (!vehicles?.length) {
  const ins = await sb.from('vehicle').insert({ account_id: mem.account_id, plate: 'SMOKE 01', plate_region: 'ON', plate_country: 'CA', make: 'Toyota', colour: 'Blue', size_class: 'compact', is_default: true }).select('id, plate, make, size_class').single();
  ok('vehicle with details is saved (plate normalised)', ins.data?.plate === 'SMOKE01' && ins.data.size_class === 'compact', ins.error?.message);
  vehicles = [ins.data];
}
const veh = vehicles[0];
ok('driver has a vehicle', !!veh?.id);

const vague = await rpc('start_session', { p_vehicle_id: veh.id, p_lat: CITY.lat, p_lng: CITY.lng, p_accuracy: 400, p_speed: 0, p_idempotency_key: 'smoke-vague-' + Date.now(), p_planned_minutes: 30 });
ok('a 400 m fix is refused', /location_too_inaccurate/.test(vague.error ?? ''), JSON.stringify(vague).slice(0, 120));
const far = await rpc('start_session', { p_vehicle_id: veh.id, p_lat: 43.45, p_lng: -80.5, p_accuracy: 10, p_speed: 0, p_idempotency_key: 'smoke-far-' + Date.now(), p_planned_minutes: 30 });
ok('outside every area is refused', /no_parking_area/.test(far.error ?? ''), JSON.stringify(far).slice(0, 120));

const key = 'smoke-' + Date.now();
const start = await rpc('start_session', { p_vehicle_id: veh.id, p_lat: CITY.lat, p_lng: CITY.lng, p_accuracy: 12, p_speed: 0, p_idempotency_key: key, p_planned_minutes: 30 });
ok('session starts in City Hall Lot with a 30 minute plan', start.data?.status === 'active' && start.data.area_name === 'City Hall Lot' && start.data.planned_minutes === 30, JSON.stringify(start).slice(0, 200));
const again = await rpc('start_session', { p_vehicle_id: veh.id, p_lat: CITY.lat, p_lng: CITY.lng, p_accuracy: 12, p_speed: 0, p_idempotency_key: key, p_planned_minutes: 30 });
ok('a retry returns the same session (no double start)', again.data?.id === start.data?.id);
const dbl = await rpc('start_session', { p_vehicle_id: veh.id, p_lat: CITY.lat, p_lng: CITY.lng, p_accuracy: 12, p_speed: 0, p_idempotency_key: key + 'b', p_planned_minutes: 30 });
ok('a second session for the same vehicle is refused', /session_already_active/.test(dbl.error ?? ''));
const ping = await rpc('session_ping', { p_session_id: start.data.id, p_lat: CITY.lat, p_lng: CITY.lng, p_accuracy: 10, p_speed: 0 });
ok('breadcrumb accepted', !ping.error, ping.error);
const ext = await rpc('extend_session', { p_session_id: start.data.id, p_planned_minutes: 75 });
ok('planned time extended to 75 minutes', ext.data?.planned_minutes === 75, JSON.stringify(ext).slice(0, 160));
const active = await rpc('my_active_session');
ok('active session is reported', active.data?.id === start.data.id);
const end = await rpc('end_session', { p_session_id: start.data.id, p_lat: CITY.lat, p_lng: CITY.lng });
ok('session ends with a receipt and a fee', end.data?.status === 'completed' && /^PP-\d{4}-\d{6}$/.test(end.data.receipt_no ?? '') && end.data.fee_cents >= 0, JSON.stringify(end).slice(0, 200));
const hist = await rpc('my_sessions', { p_limit: 5 });
ok('it is in the history', hist.data?.[0]?.id === start.data.id);
const tickets = await rpc('my_citations');
ok('tickets list loads', Array.isArray(tickets.data), JSON.stringify(tickets).slice(0, 120));
const staff = await rpc('operator_areas');
ok('driver cannot use the operator API', /forbidden/.test(staff.error ?? ''));
const others = await sb.from('parking_session').select('user_id');
ok('driver sees only own sessions', (others.data ?? []).every((r) => r.user_id === profile.data.id));

await sb.auth.signOut();
await cleanup();
console.log('  (throwaway account and its data removed)');
console.log(failed ? `\n${failed} FAILED` : '\nlive driver flow: all checks passed');
process.exit(failed ? 1 : 0);
