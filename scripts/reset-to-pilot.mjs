// Removes every test account (emails ending in @parkpay.test) and everything they created, leaves the
// published parking areas and their tariffs in place, renames the demo operator, and creates the owner's
// platform-admin login. The password is written to ./admin-account.txt (gitignored), never printed.
//   node scripts/reset-to-pilot.mjs owner@example.com "Owner Name"
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { connect } from '../supabase/db.mjs'; // also loads ./.env

const [email, name = 'ParkPay Admin'] = process.argv.slice(2);
if (!email || !email.includes('@')) throw new Error('Usage: node scripts/reset-to-pilot.mjs <admin email> "<admin name>"');
const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const OPERATOR = '00000000-0000-4000-8000-0000000000a0';
const TEST = `select id from app_user where email like '%@parkpay.test'`;

const db = await connect();
await db.query('begin');
try {
  const before = (await db.query(`select count(*)::int n from app_user where email like '%@parkpay.test'`)).rows[0].n;
  await db.query(`delete from payment where session_id in (select id from parking_session where user_id in (${TEST}))
                     or citation_id in (select id from citation where officer_id in (${TEST}))
                     or account_id in (select account_id from account_member where user_id in (${TEST}))`);
  await db.query(`delete from citation where officer_id in (${TEST})
                     or plate in (select plate from vehicle where account_id in (select account_id from account_member where user_id in (${TEST})))`);
  await db.query(`delete from enforcement_check where officer_id in (${TEST})`);
  await db.query(`delete from parking_session where user_id in (${TEST})`); // breadcrumbs cascade
  await db.query(`delete from fraud_flag where user_id in (${TEST})`);
  await db.query(`delete from audit_log where actor_user_id in (${TEST}) or actor_user_id is null`);
  await db.query(`update parking_area set created_by = null where created_by in (${TEST})`);
  await db.query(`delete from parking_area_version`); // test edits; history restarts from the pilot
  await db.query(`delete from account where owner_user_id in (${TEST})`); // vehicles and memberships cascade
  await db.query(`delete from app_user where id in (${TEST})`);
  await db.query(`delete from auth.users where email like '%@parkpay.test'`);
  await db.query(`alter sequence receipt_seq restart with 1`);
  await db.query(`update operator set name = 'ParkPay Toronto Pilot' where id = $1`, [OPERATOR]);
  await db.query(`update parking_area set closing_time = null where closing_time is not null`);
  await db.query('commit');
  console.log(`removed ${before} test accounts and their data; areas and tariffs kept`);
} catch (e) {
  await db.query('rollback');
  throw e;
}

// owner's admin login
const password = randomBytes(12).toString('base64url').replace(/[-_]/g, 'x');
let { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
if (error && /already/i.test(error.message)) {
  const list = await admin.auth.admin.listUsers({ perPage: 1000 });
  const u = list.data.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
  ({ error } = await admin.auth.admin.updateUserById(u.id, { password, email_confirm: true }));
}
if (error) throw error;
await db.query(`select dev_set_role($1, 'platform_admin', $2)`, [email, OPERATOR]);
await db.end();
writeFileSync(
  new URL('../admin-account.txt', import.meta.url),
  `ParkPay admin login (keep private; change the password after first sign-in via "Forgot password").\n\nconsole   https://parkpay-console.pages.dev\nemail     ${email}\npassword  ${password}\nrole      platform admin (also admin of the ParkPay Toronto Pilot operator)\n`,
);
console.log(`admin ready: ${email} (platform admin). Login written to admin-account.txt`);
