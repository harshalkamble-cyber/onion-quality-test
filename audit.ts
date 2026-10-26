import { query } from '../db.js';
import type { Request } from 'express';
import crypto from 'node:crypto';

export async function audit(req: Request, action: string, targetType?: string, targetId?: string, details: Record<string, unknown> = {}) {
  const ip = req.ip ?? '';
  const ipHash = ip ? crypto.createHash('sha256').update(`${process.env.AUDIT_HASH_SALT ?? 'replace-this-salt'}:${ip}`).digest('hex') : null;
  await query(`INSERT INTO activity_logs(actor_user_id, action, target_type, target_id, ip_hash, user_agent, details)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`, [req.user?.id ?? null, action, targetType ?? null, targetId ?? null, ipHash, req.header('user-agent')?.slice(0,300) ?? null, JSON.stringify(details)]);
}
