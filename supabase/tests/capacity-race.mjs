// Two drivers race for the LAST space of an area, on two real database connections at the same moment.
// Expected: exactly one gets the space, the other gets 'area_full' (start_session locks the area row before counting).
// Everything it creates is deleted at the end, so it is safe against the live project.
//   node supabase/tests/capacity-race.mjs
import { connect } from '../db.mjs';

const OP = '00000000-0000-4000-8000-0000000000a0';
const tag = `race${Date.now()}`;
const setup = await connect();
const ids = {};
let ok = false;
try {
  const mk = async (who) => {
    const u = (await setup.query(`insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), $1, jsonb_build_object('full_name', $2::text)) returning id`, [`${tag}-${who}@parkpay.test`, who])).rows[0].id;
    const acc = (await setup.query(`select id from account where owner_user_id = $1`, [u])).rows[0].id;
    const veh = (await setup.query(`insert into vehicle (account_id, plate) values ($1, $2) returning id`, [acc, `${who}${String(Date.now()).slice(-4)}`.toUpperCase()])).rows[0].id;
    return { u, veh };
  };
  ids.a = await mk('a');
  ids.b = await mk('b');
  ids.admin = await mk('adm');
  await setup.query(`update app_user set role = 'operator_admin', operator_id = $2 where id = $1`, [ids.admin.u, OP]);

  // the area, created and given ONE space through the real operator functions
  const asAdmin = async (sql, params) => {
    await setup.query('begin');
    await setup.query(`set local role authenticated`);
    await setup.query(`select set_config('request.jwt.claim.sub', $1, true)`, [ids.admin.u]);
    const r = await setup.query(sql, params);
    await setup.query('commit');
    return r.rows[0];
  };
  const poly = { type: 'Polygon', coordinates: [[[-79.43, 43.676], [-79.428, 43.676], [-79.428, 43.6775], [-79.43, 43.6775], [-79.43, 43.676]]] };
  const plan = { name: 'Race rate', min_charge_cents: 0, daily_max_cents: null, grace_minutes: 0, rules: [{ days_of_week: [1, 2, 3, 4, 5, 6, 7], start_time: '00:00', end_time: '24:00', price_per_hour_cents: 100, priority: 0 }] };
  ids.area = (await asAdmin(`select (operator_save_area(null, $1, 3, $2::jsonb, null, true, $3::jsonb))->>'id' as id`, [`${tag} lot`, JSON.stringify(poly), JSON.stringify(plan)])).id;
  await asAdmin(`select operator_set_area_capacity($1, 1)`, [ids.area]);

  // the race: A takes the space and keeps its transaction open for 2 s; B tries 300 ms later
  const A = await connect();
  const B = await connect();
  const attempt = async (c, who, key, holdMs) => {
    await c.query('begin');
    await c.query(`set local role authenticated`);
    await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [who.u]);
    const t0 = Date.now();
    try {
      await c.query(`select start_session($1, 43.67675, -79.429, 10, 0, $2)`, [who.veh, key]);
      if (holdMs) await c.query(`select pg_sleep($1)`, [holdMs / 1000]);
      await c.query('commit');
      return { result: 'parked', waitedMs: Date.now() - t0 };
    } catch (e) {
      await c.query('rollback');
      return { result: e.message, waitedMs: Date.now() - t0 };
    }
  };
  const pa = attempt(A, ids.a, `${tag}-a`, 2000);
  await new Promise((r) => setTimeout(r, 300));
  const pb = attempt(B, ids.b, `${tag}-b`, 0);
  const [ra, rb] = await Promise.all([pa, pb]);
  await A.end();
  await B.end();
  const active = (await setup.query(`select count(*)::int c from parking_session where area_id = $1 and status = 'active'`, [ids.area])).rows[0].c;
  console.log('driver A:', ra);
  console.log('driver B:', rb);
  console.log('cars in the 1-space area:', active);
  ok = ra.result === 'parked' && /area_full/.test(rb.result) && rb.waitedMs >= 1200 && active === 1;
  console.log(ok ? 'PASS: one space, one car; the second driver waited for the first and was refused' : 'FAIL');
} finally {
  // clean up everything this test made
  const users = [ids.a?.u, ids.b?.u, ids.admin?.u].filter(Boolean);
  if (ids.area) {
    await setup.query(`delete from payment where session_id in (select id from parking_session where area_id = $1)`, [ids.area]);
    await setup.query(`delete from parking_session where area_id = $1`, [ids.area]);
    await setup.query(`delete from parking_area_version where area_id = $1`, [ids.area]);
    await setup.query(`delete from rate_rule where rate_plan_id in (select id from rate_plan where area_id = $1)`, [ids.area]);
    await setup.query(`delete from rate_plan where area_id = $1`, [ids.area]);
    await setup.query(`delete from parking_area where id = $1`, [ids.area]);
  }
  if (users.length) {
    await setup.query(`delete from audit_log where actor_user_id = any($1::uuid[])`, [users]);
    await setup.query(`delete from vehicle where account_id in (select id from account where owner_user_id = any($1::uuid[]))`, [users]);
    await setup.query(`delete from account_member where account_id in (select id from account where owner_user_id = any($1::uuid[]))`, [users]).catch(() => undefined);
    await setup.query(`delete from account where owner_user_id = any($1::uuid[])`, [users]);
    await setup.query(`delete from app_user where id = any($1::uuid[])`, [users]);
    await setup.query(`delete from auth.users where id = any($1::uuid[])`, [users]);
  }
  await setup.end();
}
process.exit(ok ? 0 : 1);
