// Creates three confirmed test accounts in YOUR Supabase project (no email step), grants roles,
// and writes the logins to ./demo-accounts.txt (gitignored). Needs SUPABASE_URL + SUPABASE_SECRET_KEY in ./.env.
//   node scripts/create-demo-users.mjs
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { connect } from '../supabase/db.mjs'; // also loads ./.env

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env');
const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const OPERATOR = '00000000-0000-4000-8000-0000000000a0';

const accounts = [
  { email: 'driver@parkpay.test', name: 'Demo Driver', role: 'driver' },
  { email: 'officer@parkpay.test', name: 'Demo Officer', role: 'officer' },
  { email: 'admin@parkpay.test', name: 'Demo Operator Admin', role: 'operator_admin' },
];

const db = await connect();
const lines = ['ParkPay demo accounts (test project only). Keep this file private.', ''];
for (const a of accounts) {
  const password = randomBytes(9).toString('base64url');
  let { data, error } = await admin.auth.admin.createUser({ email: a.email, password, email_confirm: true, user_metadata: { full_name: a.name } });
  if (error && /already/i.test(error.message)) {
    const list = await admin.auth.admin.listUsers({ perPage: 200 });
    const u = list.data.users.find((x) => x.email === a.email);
    const upd = await admin.auth.admin.updateUserById(u.id, { password, email_confirm: true });
    if (upd.error) throw upd.error;
  } else if (error) throw error;
  await db.query('select dev_set_role($1, $2::user_role, $3)', [a.email, a.role, a.role === 'driver' ? null : OPERATOR]);
  lines.push(`${a.role.padEnd(15)} ${a.email}   ${password}`);
  console.log(`ready: ${a.email} (${a.role})`);
}
await db.end();
writeFileSync(new URL('../demo-accounts.txt', import.meta.url), lines.join('\n') + '\n');
console.log('Logins written to demo-accounts.txt');
