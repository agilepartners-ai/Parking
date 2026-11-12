// Database test suite. Runs the real SQL functions as different users with row-level security ON.
//
// EVERYTHING runs inside one transaction that is rolled back at the end, so no test data is
// ever left behind - safe to run against your real Supabase project.
//
//   node supabase/tests/run.mjs                    uses ./.env (Supabase). Migrations must already be applied.
//   node supabase/tests/run.mjs --fresh            also applies shim + migrations + seed INSIDE the transaction
//                                                  (validates unapplied migrations; --shim for plain Postgres)
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from '../db.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

let passed = 0;
let failed = 0;
const failures = [];
function check(name, cond, extra = '') {
  if (cond) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  FAIL ${name} ${extra}`);
  }
}
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

const db = await connect();
await db.query('begin');
if (process.argv.includes('--shim')) await db.query(readFileSync(join(here, 'shim.sql'), 'utf8'));
if (process.argv.includes('--fresh')) {
  for (const f of readdirSync(join(root, 'migrations')).filter((x) => x.endsWith('.sql')).sort()) {
    await db.query(readFileSync(join(root, 'migrations', f), 'utf8'));
    console.log(`applied ${f} (inside the test transaction)`);
  }
  await db.query(readFileSync(join(root, 'seed.sql'), 'utf8'));
}
await db.query(readFileSync(join(root, 'seed.sql'), 'utf8')); // seed must be re-runnable
console.log('seed present (and re-runnable)');

// ---- helpers ----------------------------------------------------------------------------
let sp = 0;
async function inRole(role, userId, sql, params) {
  const name = `sp${++sp}`;
  await db.query(`savepoint ${name}`);
  try {
    await db.query(`set local role ${role}`);
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? '']);
    const r = await db.query(sql, params);
    await db.query('reset role');
    await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
    await db.query(`release savepoint ${name}`);
    return { rows: r.rows, rowCount: r.rowCount };
  } catch (e) {
    await db.query(`rollback to savepoint ${name}`);
    await db.query('reset role');
    return { error: e.message };
  }
}
/** Run one statement as an authenticated user (RLS on). Returns {rows} or {error}. */
const as = (userId, sql, params = []) => inRole('authenticated', userId, sql, params);
const asAnon = (sql, params = []) => inRole('anon', null, sql, params);
const sys = (sql, params = []) => db.query(sql, params).then((r) => r.rows);
const val = (r, col) => r.rows?.[0]?.[col];

async function signUp(email, name) {
  const [u] = await sys(`insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), $1, jsonb_build_object('full_name', $2::text)) returning id`, [email, name]);
  return u.id;
}

const TORONTO = { tz: 'America/Toronto' };
const CITY = { lat: 43.6526, lng: -79.3832 }; // City Hall Lot
const KING = { lat: 43.6445, lng: -79.3955 }; // King West
const GENERAL = { lat: 43.67, lng: -79.35 };
const OUTSIDE = { lat: 43.45, lng: -80.5 };

// ---- 1. fee engine parity with packages/shared ---------------------------------------------
console.log('\nfee engine (must match packages/shared/tests/fee.test.ts)');
const planOf = async (areaName) => (await sys(`select rp.id from rate_plan rp join parking_area a on a.id = rp.area_id where a.name = $1`, [areaName]))[0].id;
const cityPlan = await planOf('City Hall Lot');
const kingPlan = await planOf('King West Street Zone');
const fee = async (plan, s, e) => (await sys(`select compute_fee_cents($1, $2::timestamptz, $3::timestamptz) as f`, [plan, s, e]))[0].f;
eq('2h Tue at $4/h = 800', await fee(cityPlan, '2027-01-05T10:00:00-05:00', '2027-01-05T12:00:00-05:00'), 800);
eq('grace period is free', await fee(cityPlan, '2027-01-05T10:00:00-05:00', '2027-01-05T10:05:00-05:00'), 0);
eq('per started minute + min charge', await fee(cityPlan, '2027-01-05T10:00:30-05:00', '2027-01-05T10:06:00-05:00'), 100);
eq('Sunday min charge', await fee(cityPlan, '2027-01-10T10:00:00-05:00', '2027-01-10T10:10:00-05:00'), 100);
eq('daily max cap', await fee(cityPlan, '2027-01-05T08:00:00-05:00', '2027-01-05T23:59:00-05:00'), 2000);
eq('night has no rule: min charge only', await fee(cityPlan, '2027-01-05T02:00:00-05:00', '2027-01-05T05:00:00-05:00'), 100);
eq('rate changes across a boundary', await fee(kingPlan, '2027-01-05T18:00:00-05:00', '2027-01-05T20:00:00-05:00'), 900);
eq('operator time zone + DST (July)', await fee(kingPlan, '2027-07-06T14:00:00Z', '2027-07-06T15:00:00Z'), 600);
eq('split_fee 8%', (await sys(`select * from split_fee(800, 800)`))[0], { service_fee_cents: 64, operator_payout_cents: 736 });

// ---- 2. signup hook ----------------------------------------------------------------------
console.log('\nsignup');
const alice = await signUp('alice@test.dev', 'Alice');
const bob = await signUp('bob@test.dev', 'Bob');
eq('profile created', (await sys(`select full_name, role from app_user where id = $1`, [alice]))[0], { full_name: 'Alice', role: 'driver' });
eq('personal account + membership created', (await sys(`select count(*)::int c from account_member where user_id = $1`, [alice]))[0].c, 1);

// ---- 3. row-level security ---------------------------------------------------------------
console.log('\nrow-level security');
const aliceAcc = (await sys(`select id from account where owner_user_id = $1`, [alice]))[0].id;
const bobAcc = (await sys(`select id from account where owner_user_id = $1`, [bob]))[0].id;
const insVeh = await as(alice, `insert into vehicle (account_id, plate, plate_region, is_default) values ($1, 'abc-123', 'ON', true) returning id, plate`, [aliceAcc]);
check('driver can add own vehicle (plate normalised)', val(insVeh, 'plate') === 'ABC123', JSON.stringify(insVeh));
const aliceVeh = val(insVeh, 'id');
check('driver cannot add a vehicle to someone else', !!(await as(alice, `insert into vehicle (account_id, plate) values ($1, 'HACK99')`, [bobAcc])).error);
const bobVeh = val(await as(bob, `insert into vehicle (account_id, plate) values ($1, 'BOB777') returning id`, [bobAcc]), 'id');
eq('driver sees only own vehicles', (await as(alice, `select plate from vehicle`)).rows, [{ plate: 'ABC123' }]);
eq('driver sees only own profile', (await as(alice, `select full_name from app_user`)).rows, [{ full_name: 'Alice' }]);
const selfPromote = await as(alice, `update app_user set role = 'platform_admin' where id = $1`, [alice]);
check('driver cannot promote themselves', selfPromote.rowCount === 0 || !!selfPromote.error);
eq('role unchanged', (await sys(`select role from app_user where id = $1`, [alice]))[0].role, 'driver');
check('anonymous user cannot call the API', !!(await asAnon(`select list_areas()`)).error);
check('anonymous user cannot read vehicles', ((await asAnon(`select * from vehicle`)).rows ?? []).length === 0 || !!(await asAnon(`select * from vehicle`)).error);
check('clients cannot call bootstrap function', !!(await as(alice, `select dev_set_role('alice@test.dev','platform_admin')`)).error);
check('clients cannot read repeat_offender view', !!(await as(alice, `select * from repeat_offender`)).error);

// ---- 4. areas -----------------------------------------------------------------------------
console.log('\nareas');
const list = val(await as(alice, `select list_areas($1, $2, 20000) as a`, [CITY.lat, CITY.lng]), 'a');
check('demo areas near Toronto', list.length >= 5, String(list.length));
const cityArea = list.find((a) => a.name === 'City Hall Lot');
eq('area carries timezone, plan and rules', [cityArea.timezone, cityArea.plan.rules.length, cityArea.plan.grace_minutes], ['America/Toronto', 2, 5]);
eq('24:00 end time survives round trip', cityArea.plan.rules.map((r) => r.end_time).sort(), ['24:00', '24:00']);
eq('detect_area: lot wins over city zone', val(await as(alice, `select detect_area($1,$2) as a`, [CITY.lat, CITY.lng]), 'a').name, 'City Hall Lot');
eq('detect_area: falls back to level 2', val(await as(alice, `select detect_area($1,$2) as a`, [GENERAL.lat, GENERAL.lng]), 'a').name, 'Toronto General Zone');
eq('get_area returns one area by id', val(await as(alice, `select get_area('00000000-0000-4000-8000-0000000000b2') as a`), 'a').name, 'City Hall Lot');
eq('detect_area: nothing outside', val(await as(alice, `select detect_area($1,$2) as a`, [OUTSIDE.lat, OUTSIDE.lng]), 'a'), null);
eq('list_areas radius filter excludes far areas', val(await as(alice, `select list_areas($1,$2,2000) as a`, [OUTSIDE.lat, OUTSIDE.lng]), 'a'), []);

// ---- 5. parking sessions ------------------------------------------------------------------
console.log('\nsessions');
const start = (user, veh, loc, key) => as(user, `select start_session($1,$2,$3,10,0,$4) as s`, [veh, loc.lat, loc.lng, key]);
check('cannot start with someone else\'s vehicle', /vehicle_not_found/.test((await start(alice, bobVeh, CITY, 'k0')).error ?? ''));
check('cannot start outside every area', /no_parking_area/.test((await start(alice, aliceVeh, OUTSIDE, 'k1')).error ?? ''));
const s1 = val(await start(alice, aliceVeh, CITY, 'k2'), 's');
check('start works; server picks area + time', s1?.status === 'active' && s1.area_name === 'City Hall Lot' && !!s1.started_at, JSON.stringify(s1));
eq('same idempotency key returns the same session', val(await start(alice, aliceVeh, CITY, 'k2'), 's')?.id, s1.id);
check('second active session for the vehicle is rejected', /session_already_active/.test((await start(alice, aliceVeh, CITY, 'k3')).error ?? ''));
eq('my_active_session returns it', val(await as(alice, `select my_active_session() as s`), 's').id, s1.id);
eq('other driver sees no active session', val(await as(bob, `select my_active_session() as s`), 's'), null);
check('other driver cannot end it', /session_not_found/.test((await as(bob, `select end_session($1)`, [s1.id])).error ?? ''));
const ping1 = val(await as(alice, `select session_ping($1,$2,$3,8,0) as p`, [s1.id, CITY.lat, CITY.lng]), 'p');
const ping2 = val(await as(alice, `select session_ping($1,$2,$3,8,15) as p`, [s1.id, OUTSIDE.lat, OUTSIDE.lng]), 'p');
eq('ping inside area', ping1.in_area, true);
eq('ping far away = left the area', ping2.in_area, false);

// make the session 2 hours old so the fee is non-trivial
await sys(`update parking_session set started_at = now() - interval '2 hours' where id = $1`, [s1.id]);
const ended = val(await as(alice, `select end_session($1,$2,$3) as s`, [s1.id, CITY.lat, CITY.lng]), 's');
check('end completes with a receipt number', ended?.status === 'completed' && /^PP-\d{4}-\d{6}$/.test(ended.receipt_no ?? ''), JSON.stringify(ended));
const expected = (await sys(`select compute_fee_cents($1, $2::timestamptz, $3::timestamptz) f`, [cityPlan, ended.started_at, ended.ended_at]))[0].f;
eq('fee equals compute_fee_cents', ended.fee_cents, expected);
eq('fee splits 8% platform / 92% operator', [ended.service_fee_cents, ended.operator_payout_cents], [Math.floor((expected * 800) / 10000), expected - Math.floor((expected * 800) / 10000)]);
eq('duration is about 120 minutes', ended.duration_minutes >= 120 && ended.duration_minutes <= 121, true);
const pay = (await sys(`select provider, status, amount_cents from payment where session_id = $1`, [s1.id]))[0];
eq('mock payment recorded', pay, { provider: 'mock', status: 'captured', amount_cents: expected });
check('cannot end twice', /session_not_active/.test((await as(alice, `select end_session($1)`, [s1.id])).error ?? ''));
eq('history lists it', val(await as(alice, `select my_sessions(10) as h`), 'h').map((x) => x.id), [s1.id]);
eq('driver can read own payment (RLS)', (await as(alice, `select amount_cents from payment`)).rows.length, 1);
eq('other driver cannot read it', (await as(bob, `select amount_cents from payment`)).rows.length, 0);
eq('vehicle is free again', val(await start(alice, aliceVeh, KING, 'k4'), 's')?.area_name, 'King West Street Zone');

// ---- 6. officer ----------------------------------------------------------------------------
console.log('\nofficer');
const olga = await signUp('olga@test.dev', 'Olga');
check('driver cannot use officer API', /forbidden/.test((await as(alice, `select officer_check_plate('ABC123')`)).error ?? ''));
await sys(`select dev_set_role('olga@test.dev','officer','00000000-0000-4000-8000-0000000000a0')`);
const chk = (plate, loc) => as(olga, `select officer_check_plate($1, null, $2, $3) as r`, [plate, loc.lat, loc.lng]);
eq('valid when paid in the same area', val(await chk('abc 123', KING), 'r').result, 'valid');
eq('wrong_area when paid elsewhere', val(await chk('ABC123', CITY), 'r').result, 'wrong_area');
eq('no_session for unknown plate', val(await chk('ZZZ999', KING), 'r').result, 'no_session');
await sys(`update parking_session set started_at = now() - interval '4 hours' where plate_snapshot = 'ABC123' and status = 'active'`);
eq('expired after the maximum stay (King West = 180 min)', val(await chk('ABC123', KING), 'r').result, 'expired');
check('valid_vehicles_near finds the car', val(await as(olga, `select officer_valid_vehicles($1,$2,300) as v`, [KING.lat, KING.lng]), 'v').some((v) => v.plate === 'ABC123'));
check('valid_vehicles_near respects radius', !val(await as(olga, `select officer_valid_vehicles($1,$2,100) as v`, [CITY.lat, CITY.lng]), 'v').some((v) => v.plate === 'ABC123'));
check('citation: fine must be positive', /invalid_fine/.test((await as(olga, `select officer_issue_citation('ABC123','ON','Overstay',0,$1,$2)`, [KING.lat, KING.lng])).error ?? ''));
check('citation: reason required', /reason_required/.test((await as(olga, `select officer_issue_citation('ABC123','ON','',5000,$1,$2)`, [KING.lat, KING.lng])).error ?? ''));
const cit = val(await as(olga, `select officer_issue_citation('ABC123','ON','Exceeded maximum stay',6000,$1,$2) as c`, [KING.lat, KING.lng]), 'c');
check('citation issued with currency and area', cit?.fine_cents === 6000 && cit.currency === 'CAD' && cit.area_name === 'King West Street Zone', JSON.stringify(cit));
eq('officer sees own citations', val(await as(olga, `select officer_recent_citations(10) as c`), 'c').length, 1);
eq('vehicle owner sees the citation (RLS)', (await as(alice, `select fine_cents from citation`)).rows, [{ fine_cents: 6000 }]);
eq('other driver does not', (await as(bob, `select fine_cents from citation`)).rows.length, 0);
eq('every lookup is logged', Number((await sys(`select count(*) c from enforcement_check`))[0].c) >= 4, true);

// ---- 7. operator ---------------------------------------------------------------------------
console.log('\noperator console');
const omar = await signUp('omar@test.dev', 'Omar');
check('driver cannot use operator API', /forbidden/.test((await as(alice, `select operator_report()`)).error ?? ''));
check('officer cannot use operator API', /forbidden/.test((await as(olga, `select operator_areas()`)).error ?? ''));
await sys(`select dev_set_role('omar@test.dev','operator_admin','00000000-0000-4000-8000-0000000000a0')`);
check('operator sees the areas', val(await as(omar, `select operator_areas() as a`), 'a').length >= 5);
const poly = { type: 'Polygon', coordinates: [[[-79.41, 43.66], [-79.408, 43.66], [-79.408, 43.662], [-79.41, 43.662], [-79.41, 43.66]]] };
const plan = { name: 'Test rate', min_charge_cents: 50, daily_max_cents: 1000, grace_minutes: 3, rules: [{ days_of_week: [1, 2, 3, 4, 5, 6, 7], start_time: '00:00', end_time: '24:00', price_per_hour_cents: 240, priority: 0 }] };
const created = val(await as(omar, `select operator_save_area(null, 'Annex Test Lot', 3, $1::jsonb, 90, true, $2::jsonb) as a`, [JSON.stringify(poly), JSON.stringify(plan)]), 'a');
check('operator draws a new area + tariff', created?.name === 'Annex Test Lot' && created.plan.rules.length === 1, JSON.stringify(created));
eq('new area is detectable by drivers', val(await as(alice, `select detect_area(43.661, -79.409) as a`), 'a').name, 'Annex Test Lot');
const edited = val(await as(omar, `select operator_save_area($1, 'Annex Test Lot', 3, $2::jsonb, 90, true, $3::jsonb) as a`, [created.id, JSON.stringify(poly), JSON.stringify({ ...plan, rules: [{ ...plan.rules[0], price_per_hour_cents: 300 }] })]), 'a');
eq('editing replaces the tariff (still one rule)', [edited.plan.rules.length, edited.plan.rules[0].price_per_hour_cents], [1, 300]);
check('bad geometry rejected', !!(await as(omar, `select operator_save_area(null,'Bad',3,'{"type":"Point","coordinates":[1,1]}'::jsonb,null,true,'{}'::jsonb)`)).error);
await as(omar, `select operator_save_area($1, 'Annex Test Lot', 3, $2::jsonb, 90, false, $3::jsonb)`, [created.id, JSON.stringify(poly), JSON.stringify(plan)]);
eq('deactivated lot falls back to the city zone', val(await as(alice, `select detect_area(43.661, -79.409) as a`), 'a').name, 'Toronto General Zone');
const rep = val(await as(omar, `select operator_report() as r`), 'r');
check('report has totals and per-area rows', rep.sessions >= 1 && rep.revenue_cents >= expected && rep.by_area.length >= 1 && rep.citations >= 1, JSON.stringify(rep));
check('active sessions listed', val(await as(omar, `select operator_active_sessions() as a`), 'a').some((x) => x.plate === 'ABC123'));
await as(omar, `select operator_set_user_role('bob@test.dev','officer')`);
eq('operator can appoint an officer', (await sys(`select role, operator_id from app_user where email = 'bob@test.dev'`))[0].role, 'officer');
check('operator cannot create another admin', /forbidden/.test((await as(omar, `select operator_set_user_role('bob@test.dev','platform_admin')`)).error ?? ''));

// ---- 7b. admin v2: publish, versions, tariff protection, reports, refunds, tickets --------
console.log('\nadmin v2');
check("driver cannot publish", /forbidden/.test((await as(alice, `select operator_publish_area($1, true)`, [created.id])).error ?? ""));
const pub = val(await as(omar, `select operator_publish_area($1, true) as a`, [created.id]), "a");
check("publish makes the area live", pub?.active === true && val(await as(alice, `select detect_area(43.661, -79.409) as a`), "a").name === "Annex Test Lot");
await as(omar, `select operator_publish_area($1, false)`, [created.id]);
eq("unpublish hides it again", val(await as(alice, `select detect_area(43.661, -79.409) as a`), "a").name, "Toronto General Zone");
const versions = val(await as(omar, `select operator_area_versions($1) as v`, [created.id]), "v");
check("every save and publish is versioned", versions.length >= 5 && versions[0].action === "unpublish", JSON.stringify(versions.map((v) => v.action)));
const king = val(await as(omar, `select operator_areas() as a`), "a").find((a) => a.name === "King West Street Zone");
const planBefore = (await sys(`select rate_plan_id from parking_session where user_id = $1 and status = 'active'`, [alice]))[0].rate_plan_id;
const kingSaved = val(await as(omar, `select operator_save_area($1, $2, $3, $4::jsonb, $5, true, $6::jsonb) as a`, [king.id, king.name, king.level, JSON.stringify(king.geometry), king.max_stay_minutes, JSON.stringify({ ...king.plan, rules: king.plan.rules.map((r) => ({ ...r, price_per_hour_cents: 9900 })) })]), "a");
const planAfter = (await sys(`select rate_plan_id from parking_session where user_id = $1 and status = 'active'`, [alice]))[0].rate_plan_id;
check("price change does not touch a running session", planAfter === planBefore && kingSaved.plan.id !== planBefore && kingSaved.plan.rules[0].price_per_hour_cents === 9900, JSON.stringify([planBefore, kingSaved.plan.id]));
eq("old tariff kept for the parked car", (await sys(`select count(*)::int c from rate_rule where rate_plan_id = $1 and price_per_hour_cents <> 9900`, [planBefore]))[0].c > 0, true);
const series = val(await as(omar, `select operator_report_series() as r`), "r");
check("report series by day and hour", series.by_day.length >= 1 && series.by_hour.length >= 1, JSON.stringify(series));
const found = val(await as(omar, `select operator_sessions(now() - interval '1 day', now() + interval '1 hour', 'abc 123') as s`), "s");
check("session search by plate", found.length >= 1 && found.every((x) => x.plate === "ABC123"), JSON.stringify(found.length));
check("driver cannot refund", /forbidden/.test((await as(alice, `select operator_refund_session($1, 1, 'test refund')`, [s1.id])).error ?? ""));
if (expected > 0) {
  eq("partial refund recorded", val(await as(omar, `select operator_refund_session($1, 1, 'Meter fault') as r`, [s1.id]), "r").refunded_cents, 1);
  check("cannot refund more than was paid", /invalid_amount/.test((await as(omar, `select operator_refund_session($1, 999999, 'too much')`, [s1.id])).error ?? ""));
}
check("refund needs a reason", /reason_required|invalid_amount|nothing_to_refund/.test((await as(omar, `select operator_refund_session($1, 1, '')`, [s1.id])).error ?? ""));
const tickets = val(await as(alice, `select my_citations() as c`), "c");
check("driver sees own ticket", tickets.length === 1 && tickets[0].status === "issued", JSON.stringify(tickets));
check("another driver cannot pay it", /citation_not_found/.test((await as(bob, `select pay_citation($1)`, [tickets[0].id])).error ?? ""));
eq("driver pays the ticket (simulated)", val(await as(alice, `select pay_citation($1) as r`, [tickets[0].id]), "r").status, "paid");
check("cannot pay twice", /citation_not_payable/.test((await as(alice, `select pay_citation($1)`, [tickets[0].id])).error ?? ""));
check("paid ticket cannot be voided", /citation_already_paid/.test((await as(omar, `select operator_void_citation($1, 'mistake')`, [tickets[0].id])).error ?? ""));
check("operator sees citations", val(await as(omar, `select operator_citations() as c`), "c").length >= 1);
check("operator sees own audit trail", val(await as(omar, `select operator_audit_log(50) as l`), "l").some((l) => l.action === "refund" || l.action === "publish"));
check("operator admin is not a platform admin", /forbidden/.test((await as(omar, `select admin_operators()`)).error ?? ""));
const paula = await signUp("paula@test.dev", "Paula");
await sys(`select dev_set_role('paula@test.dev','platform_admin',null)`);
check("platform admin lists operators", val(await as(paula, `select admin_operators() as o`), "o").length >= 1);
const newOp = val(await as(paula, `select admin_save_operator(null, 'Test Operator', 'CA', 'America/Toronto', 'CAD', 500) as id`), "id");
check("platform admin creates an operator", /^[0-9a-f-]{36}$/.test(newOp ?? ""), String(newOp));
check("service fee is capped", /invalid_fee/.test((await as(paula, `select admin_save_operator(null, 'Greedy', 'CA', 'America/Toronto', 'CAD', 9000)`)).error ?? ""));
await as(paula, `select admin_set_operator_admin('bob@test.dev', $1)`, [newOp]);
eq("platform admin appoints an operator admin", (await sys(`select role from app_user where email = 'bob@test.dev'`))[0].role, "operator_admin");

// ---- 7c. vehicle details and planned time (phase 1) ----------------------------------------
console.log('\nvehicle details and planned time');
const dana = await signUp('dana@test.dev', 'Dana');
const danaAcc = (await sys(`select id from account where owner_user_id = $1`, [dana]))[0].id;
const danaVeh = (await as(dana, `insert into vehicle (account_id, plate, make, model, colour, size_class) values ($1, 'dana 77', 'Toyota', 'Corolla', 'Blue', 'compact') returning id, plate, make, size_class`, [danaAcc])).rows?.[0];
check('driver saves vehicle details at sign-up', danaVeh?.plate === 'DANA77' && danaVeh.make === 'Toyota' && danaVeh.size_class === 'compact', JSON.stringify(danaVeh));
check('unknown size class rejected', !!(await as(dana, `insert into vehicle (account_id, plate, size_class) values ($1, 'DANA78', 'huge')`, [danaAcc])).error);
const planned = val(await as(dana, `select start_session($1, $2, $3, null, null, 'd1', 99999) as s`, [danaVeh.id, CITY.lat, CITY.lng]), 's');
check('planned time is stored and clamped to the max stay', planned?.planned_minutes === planned?.max_stay_minutes && planned.planned_minutes > 0, JSON.stringify(planned));
await as(dana, `select end_session($1)`, [planned.id]);
const open = val(await as(dana, `select start_session($1, $2, $3, null, null, 'd2') as s`, [danaVeh.id, CITY.lat, CITY.lng]), 's');
check('planned time is optional', open?.status === 'active' && open.planned_minutes == null, JSON.stringify(open));
await as(dana, `select end_session($1)`, [open.id]);

// ---- 8. account deletion -----------------------------------------------------------------
console.log('\naccount deletion');
const carol = await signUp('carol@test.dev', 'Carol');
const carolAcc = (await sys(`select id from account where owner_user_id = $1`, [carol]))[0].id;
const carolVeh = val(await as(carol, `insert into vehicle (account_id, plate) values ($1, 'CAROL1') returning id`, [carolAcc]), 'id');
await start(carol, carolVeh, KING, 'c1');
check('cannot delete while parked', /end_active_session_first/.test((await as(carol, `select delete_my_account()`)).error ?? ''));
await as(carol, `select end_session((select id from parking_session where user_id = $1 and status='active'))`, [carol]);
check('delete works after ending', !(await as(carol, `select delete_my_account()`)).error);
eq('auth user removed', Number((await sys(`select count(*) c from auth.users where id = $1`, [carol]))[0].c), 0);
eq('personal data anonymised', (await sys(`select full_name, phone_e164, role from app_user where id = $1`, [carol]))[0], { full_name: 'Deleted user', phone_e164: null, role: 'driver' });
check('deleted user can no longer call the API', /not_authenticated/.test((await as(carol, `select my_profile()`)).error ?? ''));

// ---- result --------------------------------------------------------------------------------
await db.end();
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  console.log('Failed: ' + failures.join(' | '));
  process.exit(1);
}
