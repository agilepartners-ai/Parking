// Applies supabase/migrations/*.sql in order and records them, so it is safe to re-run.
//   node supabase/migrate.mjs           apply pending migrations
//   node supabase/migrate.mjs --seed    also (re)load supabase/seed.sql
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './db.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const db = await connect();
await db.query(`create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now())`);
await db.query(`alter table public._migrations enable row level security`); // no policy: invisible to the API

for (const f of readdirSync(join(here, 'migrations')).filter((x) => x.endsWith('.sql')).sort()) {
  const done = await db.query('select 1 from public._migrations where name = $1', [f]);
  if (done.rowCount) { console.log(`skip    ${f}`); continue; }
  try {
    await db.query('begin');
    await db.query(readFileSync(join(here, 'migrations', f), 'utf8'));
    await db.query('insert into public._migrations (name) values ($1)', [f]);
    await db.query('commit');
    console.log(`applied ${f}`);
  } catch (e) {
    await db.query('rollback');
    console.error(`FAILED  ${f}: ${e.message}`);
    process.exit(1);
  }
}
if (process.argv.includes('--seed')) {
  await db.query(readFileSync(join(here, 'seed.sql'), 'utf8'));
  console.log('seeded demo data (Toronto)');
}
await db.end();
