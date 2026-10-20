// /api/auth/*: real accounts and login sessions for clients, backed by the
// database (server/db). Shared by the Vite dev server (vite.config.js) and
// the production server (server/index.js), like /api/chat.
//
//   POST   /api/auth/signup            { firstName, lastName, phone, email, city, password, kycStatus }
//   POST   /api/auth/login             { email, password }
//   POST   /api/auth/logout
//   GET    /api/auth/me                { user } when signed in, { user: null } when not
//   DELETE /api/auth/me                delete your own account (right to erasure)
//   POST   /api/auth/email-available   { email }
//   Mock admin console only (dev, or ENABLE_MOCK_ADMIN / VITE_ENABLE_MOCK_ADMIN=true):
//   GET    /api/auth/admin/clients
//   POST   /api/auth/admin/kyc         { email, kycStatus }
//   POST   /api/auth/admin/delete      { email }
//
// The session lives in an httpOnly cookie holding a random token; the
// database stores only the token's SHA-256. KYC and OTP are still simulated
// in the browser, so kycStatus is taken from the sign-up request.

import { createHash, randomBytes } from 'node:crypto';
import { createRateLimiter } from '../rateLimit.js';
import { createUserRepository } from '../db/users.js';
import { hashPassword, verifyPassword, verifyAgainstDummy } from './passwords.js';

export const SESSION_COOKIE = 'lu_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 16 * 1024;

// Same demo account the sign-in screen has always advertised.
export const DEMO_ACCOUNT = {
  firstName: 'Prasanth',
  lastName: 'Kumar',
  phone: '9876543210',
  email: 'demo@lawyerup.in',
  city: 'Bengaluru',
  password: 'lawyerup123',
  kycStatus: 'approved',
};

const isEmail = (v) => typeof v === 'string' && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const isMobile = (v) => typeof v === 'string' && /^[6-9]\d{9}$/.test(v.trim());
const isName = (v) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 60;
const isPassword = (v) => typeof v === 'string' && v.length >= 8 && v.length <= 200;

export const hashToken = (token) => createHash('sha256').update(token).digest('hex');

/**
 * @param {{ db: import('node:sqlite').DatabaseSync, adminRoutes?: boolean, seedDemo?: boolean,
 *           now?: () => number, rateLimit?: { take(key: string): { allowed: boolean } } }} options
 */
export function createAuthMiddleware({ db, adminRoutes = false, seedDemo = true, now = Date.now, rateLimit = createRateLimiter({ capacity: 10, refillPerMinute: 10 }) }) {
  const users = createUserRepository(db);
  users.purgeExpiredSessions(now());

  const ready = (async () => {
    if (seedDemo && !users.findByEmail(DEMO_ACCOUNT.email)) {
      const { password, ...profile } = DEMO_ACCOUNT;
      users.create({ ...profile, passwordHash: await hashPassword(password) });
    }
  })();

  function startSession(req, res, user) {
    const token = randomBytes(32).toString('base64url');
    const t = now();
    users.createSession(hashToken(token), user.id, t + SESSION_TTL_MS, t);
    setCookie(req, res, token, SESSION_TTL_MS / 1000);
  }

  function currentSession(req) {
    const token = readCookie(req, SESSION_COOKIE);
    if (!token) return null;
    const tokenHash = hashToken(token);
    const user = users.userForSession(tokenHash, now());
    return user ? { user, tokenHash } : null;
  }

  const routes = {
    'POST /api/auth/signup': async (req, res, body) => {
      const input = {
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone,
        email: body.email,
        city: body.city,
      };
      const invalid = Object.entries({
        firstName: isName(input.firstName),
        lastName: isName(input.lastName),
        phone: isMobile(input.phone),
        email: isEmail(input.email),
        city: isName(input.city),
        password: isPassword(body.password),
      })
        .filter(([, ok]) => !ok)
        .map(([field]) => field);
      if (invalid.length) return send(res, 400, { error: 'invalid-input', fields: invalid });
      const trimmed = Object.fromEntries(Object.entries(input).map(([k, v]) => [k, v.trim()]));
      let user;
      try {
        user = users.create({
          ...trimmed,
          kycStatus: body.kycStatus === 'approved' ? 'approved' : 'pending',
          passwordHash: await hashPassword(body.password),
        });
      } catch (err) {
        if (err.code === 'email-in-use') return send(res, 409, { error: 'email-in-use' });
        throw err;
      }
      startSession(req, res, user);
      return send(res, 201, { user });
    },

    'POST /api/auth/login': async (req, res, body) => {
      if (!isEmail(body.email) || typeof body.password !== 'string') return send(res, 401, { error: 'invalid-credentials' });
      const stored = users.getPasswordHash(body.email);
      const ok = stored ? await verifyPassword(body.password, stored) : await verifyAgainstDummy(body.password);
      if (!ok) return send(res, 401, { error: 'invalid-credentials' });
      const user = users.findByEmail(body.email);
      startSession(req, res, user);
      return send(res, 200, { user });
    },

    'POST /api/auth/logout': async (req, res) => {
      const token = readCookie(req, SESSION_COOKIE);
      if (token) users.deleteSession(hashToken(token));
      setCookie(req, res, '', 0);
      return send(res, 200, { ok: true });
    },

    'GET /api/auth/me': async (req, res) => {
      // 200 either way: being signed out is a normal answer, not an error.
      return send(res, 200, { user: currentSession(req)?.user || null });
    },

    'DELETE /api/auth/me': async (req, res) => {
      const session = currentSession(req);
      if (!session) return send(res, 401, { error: 'not-signed-in' });
      users.deleteByEmail(session.user.email);
      setCookie(req, res, '', 0);
      return send(res, 200, { ok: true });
    },

    'POST /api/auth/email-available': async (req, res, body) => {
      if (!isEmail(body.email)) return send(res, 400, { error: 'invalid-input', fields: ['email'] });
      return send(res, 200, { available: !users.findByEmail(body.email) });
    },
  };

  if (adminRoutes) {
    Object.assign(routes, {
      'GET /api/auth/admin/clients': async (req, res) => send(res, 200, { clients: users.listClients() }),
      'POST /api/auth/admin/kyc': async (req, res, body) => {
        if (!isEmail(body.email) || !['approved', 'pending'].includes(body.kycStatus)) return send(res, 400, { error: 'invalid-input' });
        const user = users.setKycStatus(body.email, body.kycStatus);
        return user ? send(res, 200, { user }) : send(res, 404, { error: 'not-found' });
      },
      'POST /api/auth/admin/delete': async (req, res, body) => {
        if (!isEmail(body.email)) return send(res, 400, { error: 'invalid-input' });
        return send(res, 200, { deleted: users.deleteByEmail(body.email) });
      },
    });
  }

  const RATE_LIMITED = new Set(['POST /api/auth/signup', 'POST /api/auth/login', 'POST /api/auth/email-available']);

  return async function authMiddleware(req, res) {
    const { pathname } = new URL(req.originalUrl || req.url, 'http://localhost');
    const key = `${req.method} ${pathname.replace(/\/+$/, '')}`;
    const route = routes[key];
    if (!route) return send(res, 404, { error: 'not-found' });

    if (RATE_LIMITED.has(key)) {
      const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
      if (!rateLimit.take(ip).allowed) return send(res, 429, { error: 'rate-limited' });
    }

    let body = {};
    if (req.method === 'POST') {
      // JSON only: a cross-site HTML form cannot send application/json.
      if (!String(req.headers['content-type'] || '').includes('application/json')) return send(res, 415, { error: 'json-required' });
      try {
        body = JSON.parse((await readBody(req)) || '{}') || {};
      } catch {
        return send(res, 400, { error: 'invalid-json' });
      }
    }

    try {
      await ready;
      return await route(req, res, body);
    } catch (err) {
      console.error(JSON.stringify({ event: 'auth_error', route: key, message: err?.message }));
      return send(res, 500, { error: 'server-error' });
    }
  };
}

function readCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function setCookie(req, res, value, maxAgeSeconds) {
  const https = req.socket?.encrypted || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
  const parts = [`${SESSION_COOKIE}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.floor(maxAgeSeconds)}`];
  if (https) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('too-large'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}
