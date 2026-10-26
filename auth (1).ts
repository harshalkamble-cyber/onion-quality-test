import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { config } from '../config.js';

declare global { namespace Express { interface Request { user?: { id: string; role: 'farmer' | 'admin' | 'inspector' } } } }

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const cookieToken = req.cookies?.access_token as string | undefined;
  const authHeader = req.header('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const token = cookieToken ?? bearerToken;
  if (!token) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Please sign in to continue.' } });
  try {
    const payload = jwt.verify(token, config.JWT_ACCESS_SECRET) as jwt.JwtPayload;
    if (typeof payload.sub !== 'string' || !['farmer', 'admin', 'inspector'].includes(String(payload.role))) throw new Error('invalid claims');
    req.user = { id: payload.sub, role: payload.role as 'farmer' | 'admin' | 'inspector' };
    next();
  } catch {
    return res.status(401).json({ error: { code: 'INVALID_SESSION', message: 'Your session has expired. Please sign in again.' } });
  }
}

export function requireRole(...roles: Array<'farmer' | 'admin' | 'inspector'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You do not have permission to perform this action.' } });
    next();
  };
}

// Cookie-authenticated writes require a matching, JS-readable CSRF token. Bearer clients are not ambiently authenticated.
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || !req.cookies?.access_token) return next();
  const cookie = req.cookies?.csrf_token as string | undefined;
  const header = req.header('x-csrf-token');
  if (!cookie || !header || cookie.length !== header.length || !crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(header))) {
    return res.status(403).json({ error: { code: 'CSRF_INVALID', message: 'Security token missing or invalid. Refresh the page and try again.' } });
  }
  next();
}
