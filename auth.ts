import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from '../db.js';
import { config } from '../config.js';
import { authenticate } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

export const authRouter = Router();
const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.email().max(254).transform((v) => v.toLowerCase()),
  password: z.string().min(10).max(128),
  phone: z.string().trim().max(20).optional(),
  language: z.enum(['en','hi','mr']).default('mr')
});
const loginSchema = z.object({ email: z.email().transform((v) => v.toLowerCase()), password: z.string().min(1).max(128) });
const cookieBase = { httpOnly: true, secure: config.COOKIE_SECURE, sameSite: 'lax' as const, path: '/' };
function setSessionCookies(res: import('express').Response, accessToken: string, refreshToken: string, csrfToken: string) {
  res.cookie('access_token', accessToken, { ...cookieBase, maxAge: 15 * 60 * 1000 });
  res.cookie('refresh_token', refreshToken, { ...cookieBase, maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.cookie('csrf_token', csrfToken, { secure: config.COOKIE_SECURE, sameSite: 'lax', path: '/', maxAge: 7 * 24 * 60 * 60 * 1000 });
}
function signAccess(id: string, role: string) { return jwt.sign({ role }, config.JWT_ACCESS_SECRET, { subject: id, expiresIn: '15m', issuer: 'onion-quality-api', audience: 'onion-quality-web' }); }
function hashToken(token: string) { return crypto.createHash('sha256').update(token).digest('hex'); }
async function mintRefresh(userId: string) {
  const token = crypto.randomBytes(48).toString('base64url');
  await query('INSERT INTO refresh_tokens(user_id, token_hash, expires_at) VALUES($1,$2,NOW() + INTERVAL \'7 days\')', [userId, hashToken(token)]);
  return token;
}
function csrf() { return crypto.randomBytes(24).toString('base64url'); }

/** @openapi
 * /api/auth/register:
 *   post:
 *     tags: [Authentication]
 *     summary: Create a farmer account
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [fullName, email, password], properties: { fullName: {type: string}, email: {type: string, format: email}, password: {type: string, minLength: 10}, phone: {type: string}, language: {type: string, enum: [en,hi,mr]} } }
 *     responses: { '201': {description: Account created}, '409': {description: Email already registered} }
 */
authRouter.post('/register', async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(data.password, 12);
    const client = await (await import('../db.js')).pool.connect();
    let user: { id: string; full_name: string; email: string; role: string; preferred_language: string };
    try {
      await client.query('BEGIN');
      const insert = await client.query(`INSERT INTO users(full_name,email,phone,password_hash,preferred_language) VALUES($1,$2,$3,$4,$5) RETURNING id,full_name,email,role,preferred_language`, [data.fullName, data.email, data.phone ?? null, passwordHash, data.language]);
      user = insert.rows[0];
      await client.query('INSERT INTO farmers(user_id) VALUES($1)', [user.id]);
      await client.query('COMMIT');
    } catch (error: any) {
      await client.query('ROLLBACK');
      if (error?.code === '23505') return res.status(409).json({ error: { code: 'EMAIL_EXISTS', message: 'An account with this email already exists.' } });
      throw error;
    } finally { client.release(); }
    const refresh = await mintRefresh(user.id);
    const csrfToken = csrf();
    setSessionCookies(res, signAccess(user.id, user.role), refresh, csrfToken);
    await query(`INSERT INTO activity_logs(actor_user_id,action,target_type,target_id,details) VALUES($1,'auth.register','user',$1,'{}'::jsonb)`, [user.id]);
    return res.status(201).json({ user: { id: user.id, fullName: user.full_name, email: user.email, role: user.role, language: user.preferred_language }, csrfToken });
  } catch (error) { next(error); }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const result = await query<{ id: string; full_name: string; email: string; role: string; preferred_language: string; password_hash: string; is_active: boolean }>(
      'SELECT id, full_name, email, role, preferred_language, password_hash, is_active FROM users WHERE email=$1 LIMIT 1', [data.email]);
    const user = result.rows[0];
    const valid = user ? await bcrypt.compare(data.password, user.password_hash) : false;
    if (!user || !valid || !user.is_active) return res.status(401).json({ error: { code: 'LOGIN_FAILED', message: 'Email or password is incorrect.' } });
    const refresh = await mintRefresh(user.id);
    const csrfToken = csrf();
    setSessionCookies(res, signAccess(user.id, user.role), refresh, csrfToken);
    await query(`INSERT INTO activity_logs(actor_user_id,action,target_type,target_id,details) VALUES($1,'auth.login','user',$1,'{}'::jsonb)`, [user.id]);
    return res.json({ user: { id: user.id, fullName: user.full_name, email: user.email, role: user.role, language: user.preferred_language }, csrfToken });
  } catch (error) { next(error); }
});

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const token = req.cookies?.refresh_token as string | undefined;
    if (!token) return res.status(401).json({ error: { code: 'REFRESH_REQUIRED', message: 'Please sign in again.' } });
    const hashed = hashToken(token);
    const found = await query<{ id: string; user_id: string; role: string; is_active: boolean }>(`SELECT rt.id,rt.user_id,u.role,u.is_active FROM refresh_tokens rt JOIN users u ON u.id=rt.user_id WHERE rt.token_hash=$1 AND rt.revoked_at IS NULL AND rt.expires_at > NOW()`, [hashed]);
    const session = found.rows[0];
    if (!session || !session.is_active) return res.status(401).json({ error: { code: 'REFRESH_INVALID', message: 'Please sign in again.' } });
    await query('UPDATE refresh_tokens SET revoked_at=NOW() WHERE id=$1', [session.id]);
    const newRefresh = await mintRefresh(session.user_id);
    const csrfToken = csrf();
    setSessionCookies(res, signAccess(session.user_id, session.role), newRefresh, csrfToken);
    res.json({ csrfToken });
  } catch (error) { next(error); }
});

authRouter.post('/logout', async (req, res, next) => {
  try {
    const token = req.cookies?.refresh_token as string | undefined;
    if (token) await query('UPDATE refresh_tokens SET revoked_at=NOW() WHERE token_hash=$1 AND revoked_at IS NULL', [hashToken(token)]);
    res.clearCookie('access_token', cookieBase); res.clearCookie('refresh_token', cookieBase);
    res.clearCookie('csrf_token', { secure: config.COOKIE_SECURE, sameSite: 'lax', path: '/' });
    res.status(204).end();
  } catch (error) { next(error); }
});

authRouter.get('/me', authenticate, async (req, res, next) => {
  try {
    const result = await query<{ id:string; full_name:string; email:string; role:string; preferred_language:string; phone:string|null }>('SELECT id,full_name,email,role,preferred_language,phone FROM users WHERE id=$1 AND is_active=TRUE', [req.user!.id]);
    if (!result.rows[0]) return res.status(401).json({ error: { code: 'USER_INACTIVE', message: 'This account is no longer active.' } });
    const u = result.rows[0];
    res.json({ user: { id:u.id, fullName:u.full_name, email:u.email, role:u.role, language:u.preferred_language, phone:u.phone } });
  } catch (error) { next(error); }
});
