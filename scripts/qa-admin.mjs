// Throwaway platform-admin account for testing the deployed console without typing a password.
//   node scripts/qa-admin.mjs create <out.json>   -> creates qa-<ts>@parkpay.test, writes a signed-in session to out.json
//   node scripts/qa-admin.mjs delete              -> deletes every qa-*@parkpay.test account and what it made
// The session JSON goes into localStorage key sb-<project-ref>-auth-token on the console's origin.
import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { connect } from '../supabase/db.mjs'; // loads ./.env (secret key, server side only)

const PILOT_OPERATOR = '00000000-0000-4000-8000-0000000000a0';
const svc = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const [cmd, out] = process.argv.slice(2);

if (cmd === 'create') {
  const email = `qa-${Date.now()}@parkpay.test`;
  const u = await svc.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: 'QA Admin' } });
  if (u.error) throw u.error;
  const db = await connect();
  // app_user row is created by the auth trigger; make it a platform admin of the pilot operator
  await db.query(`update app_user set role = 'platform_admin', operator_id = $2 where email = $1`, [email, PILOT_OPERATOR]);
  await db.end();
  const link = await svc.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error) throw link.error;
  const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const v = await anon.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: 'magiclink' });
  if (v.error) throw v.error;
  writeFileSync(out, JSON.stringify(v.data.session));
  const ref = new URL(process.env.SUPABASE_URL).hostname.split('.')[0];
  console.log(`created ${email}; session written; localStorage key sb-${ref}-auth-token`);
} else if (cmd === 'delete') {
  const db = await connect();
  const T = `select id from app_user where email like 'qa-%@parkpay.test'`;
  await db.query(`delete from audit_log where actor_user_id in (${T})`);
  await db.query(`delete from app_user where id in (${T})`);
  await db.end();
  const { data } = await svc.auth.admin.listUsers({ perPage: 1000 });
  for (const x of data.users.filter((x) => /^qa-\d+@parkpay\.test$/.test(x.email ?? ''))) {
    await svc.auth.admin.deleteUser(x.id);
    console.log('deleted', x.email);
  }
} else {
  console.log('usage: node scripts/qa-admin.mjs create <out.json> | delete');
}
