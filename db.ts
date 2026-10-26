import pg from 'pg';
import { config } from './config.js';
const { Pool } = pg;
export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX ?? 15),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: config.NODE_ENV === 'production' && process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined
});
pool.on('error', (error) => console.error(JSON.stringify({ level: 'error', event: 'pg_pool_error', message: error.message })));
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values: unknown[] = []) {
  return pool.query<T>(text, values);
}
