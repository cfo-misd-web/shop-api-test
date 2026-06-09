import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

// --- Password hashing (scrypt, salt stored alongside hash) ---------------

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const derived = scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(hashHex, 'hex');
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

// --- JWT (HS256, hand-rolled with node:crypto — no jsonwebtoken) ----------

function b64url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

export function signJwt(userId: number): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({ sub: userId, iat: now, exp: now + TOKEN_TTL_SECONDS }));
  const data = `${header}.${payload}`;
  const sig = createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyJwt(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const data = `${header}.${payload}`;
  const expected = createHmac('sha256', JWT_SECRET).update(data).digest();
  const given = Buffer.from(sig, 'base64url');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      sub?: unknown;
      exp?: unknown;
    };
    if (typeof claims.exp !== 'number' || claims.exp < Math.floor(Date.now() / 1000)) return null;
    if (typeof claims.sub !== 'number') return null;
    return claims.sub;
  } catch {
    return null;
  }
}

// --- Auth middleware (Bearer header) -------------------------------------

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  if (!token) {
    res.status(401).json({ error: 'Missing Bearer token' });
    return;
  }
  const userId = verifyJwt(token);
  if (userId === null) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
  req.userId = userId;
  next();
}
