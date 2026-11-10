// Shared connection helper for the scripts in this folder. Reads ./.env (gitignored) or the environment.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));

export function connectionConfig() {
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  if (!DB_HOST || !DB_PASSWORD) throw new Error('Missing DB_HOST / DB_PASSWORD. Copy .env.example to .env and fill it in.');
  return {
    host: DB_HOST,
    port: Number(DB_PORT || 5432),
    user: DB_USER || 'postgres',
    password: DB_PASSWORD,
    database: DB_NAME || 'postgres',
    ssl: DB_HOST.includes('localhost') ? false : { rejectUnauthorized: false },
  };
}

export async function connect() {
  const c = new pg.Client(connectionConfig());
  await c.connect();
  return c;
}
