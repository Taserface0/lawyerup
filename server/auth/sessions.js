// Login sessions and the small HTTP helpers shared by /api/auth and /api/data.
// The cookie holds a random token; the database stores only its SHA-256.

import { createHash, randomBytes } from 'node:crypto';

export const SESSION_COOKIE = 'lu_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 16 * 1024;

export const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export function createSessions(users, now = Date.now) {
  return {
    start(req, res, user) {
      const token = randomBytes(32).toString('base64url');
      const t = now();
      users.createSession(hashToken(token), user.id, t + SESSION_TTL_MS, t);
      setSessionCookie(req, res, token, SESSION_TTL_MS / 1000);
    },
    /** The signed-in user's account row (as users.js returns it), or null. */
    current(req) {
      const token = readCookie(req, SESSION_COOKIE);
      return token ? users.userForSession(hashToken(token), now()) : null;
    },
    end(req, res) {
      const token = readCookie(req, SESSION_COOKIE);
      if (token) users.deleteSession(hashToken(token));
      setSessionCookie(req, res, '', 0);
    },
    clearCookie: (req, res) => setSessionCookie(req, res, '', 0),
  };
}

function readCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function setSessionCookie(req, res, value, maxAgeSeconds) {
  const https = req.socket?.encrypted || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
  const parts = [`${SESSION_COOKIE}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.floor(maxAgeSeconds)}`];
  if (https) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export const clientIp = (req) => req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';

/**
 * Reads a JSON body (POST only). JSON is required: a cross-site HTML form
 * cannot send application/json, which, with SameSite=Lax, blocks CSRF.
 * Returns { body } or { error: [status, payload] }.
 */
export async function readJsonBody(req) {
  if (req.method !== 'POST') return { body: {} };
  if (!String(req.headers['content-type'] || '').includes('application/json')) return { error: [415, { error: 'json-required' }] };
  try {
    const text = await new Promise((resolve, reject) => {
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
    const body = JSON.parse(text || '{}');
    return { body: body && typeof body === 'object' ? body : {} };
  } catch {
    return { error: [400, { error: 'invalid-json' }] };
  }
}

export function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}
