// Live end-to-end check of parking capacity through the PUBLIC API (publishable key, row-level security on),
// exactly as the apps call it. Uses throwaway @parkpay.test accounts and puts everything back afterwards.
//   node scripts/capacity-live.mjs            run the check and clean up
//   node scripts/capacity-live.mjs --hold     leave the lot full until Enter is pressed (to look at the apps/console)
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { connect } from '../supabase/db.mjs';

const root = new URL('..', import.meta.url);
const env = Object.fromEntries(readFileSync(new URL('apps/mobile/.env', root), 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const svc = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const OP = '00000000-0000-4000-8000-0000000000a0';
const CITY = { lat: 43.6526, lng: -79.3832 }; // City Hall Lot
const tag = `cap${Date.now()}`;
let failed = 0;
const ok = (name, cond, extra = '') => { if (!cond) failed++; console.log(`${cond ? '  ok  ' : '  FAIL'} ${name}${cond ? '' : ' ' + extra}`); };

const users = [];
async function user(role, name) {
  const email = `${tag}-${name}@parkpay.test`;
  const password = randomBytes(12).toString('base64url');
  const c = await svc.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
  if (c.error) throw c.error;
  users.push(c.data.user.id);
  if (role !== 'driver') {
    const db = await connect();
    await db.query(`update app_user set role = $2, operator_id = $3 where id = $1`, [c.data.user.id, role, OP]);
    await db.end();
  }
  const sb = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_KEY, { auth: { persistSession: false } });
  const s = await sb.auth.signInWithPassword({ email, password });
  if (s.error) throw s.error;
  return sb;
}
const rpc = async (sb, fn, args) => { const { data, error } = await sb.rpc(fn, args); return error ? { error: error.message } : { data }; };

let areaId = null;
let before = null;
try {
  const admin = await user('operator_admin', 'admin');
  const d1 = await user('driver', 'one');
  const d2 = await user('driver', 'two');
  const veh = async (sb, plate) => {
    const { data: acc } = await sb.from('account_member').select('account_id').limit(1).single();
    const { data } = await sb.from('vehicle').insert({ account_id: acc.account_id, plate }).select('id').single();
    return data.id;
  };
  const v1 = await veh(d1, `CAP${String(Date.now()).slice(-4)}A`);
  const v2 = await veh(d2, `CAP${String(Date.now()).slice(-4)}B`);

  const areas = (await rpc(admin, 'operator_areas')).data;
  const city = areas.find((a) => a.name === 'City Hall Lot');
  areaId = city.id;
  before = city.total_spaces ?? null;
  const set1 = (await rpc(admin, 'operator_set_area_capacity', { p_area_id: areaId, p_total_spaces: 1 })).data;
  ok('admin sets City Hall Lot to 1 space', set1?.total_spaces === 1 && set1.available === 1, JSON.stringify(set1 && { t: set1.total_spaces, a: set1.available }));

  const seen0 = (await rpc(d2, 'list_areas', { p_lat: CITY.lat, p_lng: CITY.lng, p_radius_m: 2000 })).data.find((a) => a.id === areaId);
  ok('driver app sees "1 of 1 free"', seen0?.available === 1 && seen0.total_spaces === 1);

  const s1 = await rpc(d1, 'start_session', { p_vehicle_id: v1, p_lat: CITY.lat, p_lng: CITY.lng, p_accuracy: 10, p_speed: 0, p_idempotency_key: `${tag}-1` });
  ok('driver 1 parks', s1.data?.status === 'active' && s1.data.area_name === 'City Hall Lot', s1.error);

  const seen1 = (await rpc(d2, 'list_areas', { p_lat: CITY.lat, p_lng: CITY.lng, p_radius_m: 2000 })).data.find((a) => a.id === areaId);
  ok('driver 2 now sees the lot as full (0 free)', seen1?.available === 0 && seen1.occupied === 1);
  const s2 = await rpc(d2, 'start_session', { p_vehicle_id: v2, p_lat: CITY.lat, p_lng: CITY.lng, p_accuracy: 10, p_speed: 0, p_idempotency_key: `${tag}-2` });
  ok('driver 2 is refused: area_full', /area_full/.test(s2.error ?? ''), JSON.stringify(s2));
  const dash = (await rpc(admin, 'operator_areas')).data.find((a) => a.id === areaId);
  ok('admin dashboard shows 1 / 1, full', dash.occupied === 1 && dash.available === 0);

  if (process.argv.includes('--hold')) {
    // --hold <file>: wait until that file exists (works in the background); --hold alone: wait for Enter
    const file = process.argv[process.argv.indexOf('--hold') + 1];
    console.log(`\nCity Hall Lot is FULL now. Look at the apps / console, then ${file ? `create ${file}` : 'press Enter'} to continue.`);
    if (file) {
      const { existsSync } = await import('node:fs');
      while (!existsSync(file)) await new Promise((r) => setTimeout(r, 500));
    } else await new Promise((r) => process.stdin.once('data', r));
  }

  const e1 = await rpc(d1, 'end_session', { p_session_id: s1.data.id, p_lat: CITY.lat, p_lng: CITY.lng });
  ok('driver 1 ends and pays', e1.data?.status === 'completed', e1.error);
  const seen2 = (await rpc(d2, 'list_areas', { p_lat: CITY.lat, p_lng: CITY.lng, p_radius_m: 2000 })).data.find((a) => a.id === areaId);
  ok('the space is free again for driver 2', seen2?.available === 1 && seen2.occupied === 0);
  const s3 = await rpc(d2, 'start_session', { p_vehicle_id: v2, p_lat: CITY.lat, p_lng: CITY.lng, p_accuracy: 10, p_speed: 0, p_idempotency_key: `${tag}-3` });
  ok('driver 2 parks now', s3.data?.status === 'active', s3.error);
  if (s3.data) await rpc(d2, 'end_session', { p_session_id: s3.data.id, p_lat: CITY.lat, p_lng: CITY.lng });
} finally {
  const db = await connect();
  if (areaId) {
    await db.query(`update parking_area set total_spaces = $2 where id = $1`, [areaId, before]);
    await db.query(`delete from parking_area_version where area_id = $1 and action = 'capacity' and actor_user_id = any($2::uuid[])`, [areaId, users]);
  }
  if (users.length) {
    const T = `select unnest($1::uuid[])`;
    await db.query(`delete from payment where session_id in (select id from parking_session where user_id in (${T}))`, [users]);
    await db.query(`delete from parking_session where user_id in (${T})`, [users]);
    await db.query(`delete from audit_log where actor_user_id in (${T})`, [users]);
    await db.query(`delete from vehicle where account_id in (select id from account where owner_user_id in (${T}))`, [users]);
    await db.query(`delete from account where owner_user_id in (${T})`, [users]);
    await db.query(`delete from app_user where id in (${T})`, [users]);
  }
  await db.end();
  for (const id of users) await svc.auth.admin.deleteUser(id);
  console.log(`cleaned up: ${users.length} test accounts removed, City Hall Lot spaces back to ${before ?? 'not counted'}`);
}
console.log(failed ? `${failed} FAILED` : 'capacity end to end: all checks passed');
process.exit(failed ? 1 : 0);
