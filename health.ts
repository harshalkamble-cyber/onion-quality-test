import { Router } from 'express';
import { pool } from '../db.js';
import { redis } from '../queue.js';
export const healthRouter = Router();
healthRouter.get('/live', (_req,res) => res.json({ status:'ok', timestamp:new Date().toISOString() }));
healthRouter.get('/ready', async (_req,res) => {
  const checks: Record<string,string> = { api:'ok', database:'unknown', redis:'unknown' };
  try { await pool.query('SELECT 1'); checks.database='ok'; } catch { checks.database='error'; }
  try { checks.redis = (await redis.ping()) === 'PONG' ? 'ok' : 'error'; } catch { checks.redis='error'; }
  const ready = Object.values(checks).every(v => v === 'ok');
  res.status(ready ? 200 : 503).json({ status:ready ? 'ready':'not_ready', checks, timestamp:new Date().toISOString() });
});
