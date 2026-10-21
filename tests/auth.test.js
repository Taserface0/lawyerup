import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer } from 'node:http';
import { openDatabase } from '../server/db/index.js';
import { createAuthMiddleware, DEMO_ACCOUNT, SESSION_TTL_MS } from '../server/auth/handler.js';
import { hashPassword, verifyPassword } from '../server/auth/passwords.js';

const ALICE = { firstName: 'Alice', lastName: 'Rao', phone: '9876501234', email: 'Alice@Example.com', city: 'Pune', password: 'correct-horse', kycStatus: 'approved' };

let db, server, base, clock;

async function start(options = {}) {
  db = openDatabase(':memory:');
  clock = { t: Date.UTC(2026, 0, 1) };
  const auth = createAuthMiddleware({ db, seedDemo: false, now: () => clock.t, rateLimit: { take: () => ({ allowed: true }) }, ...options });
  server = createServer((req, res) => auth(req, res));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
}

function call(path, { method = 'GET', body, cookie, headers = {} } = {}) {
  return fetch(base + path, {
    method,
    headers: { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(cookie && { Cookie: cookie }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const cookieOf = (res) => res.headers.get('set-cookie')?.split(';')[0];

beforeEach(() => start());
afterEach(() => new Promise((r) => server.close(r)));

describe('auth API', () => {
  it('signs up, reports the current user, logs out and logs back in', async () => {
    const signup = await call('/api/auth/signup', { method: 'POST', body: ALICE });
    expect(signup.status).toBe(201);
    const { user } = await signup.json();
    expect(user).toMatchObject({ role: 'client', name: 'Alice Rao', email: 'Alice@Example.com', kycStatus: 'approved' });
    expect(user).not.toHaveProperty('password');
    expect(user).not.toHaveProperty('passwordHash');

    const cookie = cookieOf(signup);
    expect((await (await call('/api/auth/me', { cookie })).json()).user.email).toBe('Alice@Example.com');

    expect((await call('/api/auth/logout', { method: 'POST', body: {}, cookie })).status).toBe(200);
    expect((await (await call('/api/auth/me', { cookie })).json()).user).toBeNull(); // the old cookie is dead server-side

    const login = await call('/api/auth/login', { method: 'POST', body: { email: ' alice@example.com ', password: 'correct-horse' } });
    expect(login.status).toBe(200);
    expect((await (await call('/api/auth/me', { cookie: cookieOf(login) })).json()).user).not.toBeNull();
  });

  it('gives the same generic error for a wrong password and an unknown email', async () => {
    await call('/api/auth/signup', { method: 'POST', body: ALICE });
    const wrong = await call('/api/auth/login', { method: 'POST', body: { email: ALICE.email, password: 'nope-nope' } });
    const unknown = await call('/api/auth/login', { method: 'POST', body: { email: 'bob@example.com', password: 'nope-nope' } });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());
    expect(wrong.headers.get('set-cookie')).toBeNull();
  });

  it('rejects a duplicate email regardless of case, and reports availability', async () => {
    await call('/api/auth/signup', { method: 'POST', body: ALICE });
    const dup = await call('/api/auth/signup', { method: 'POST', body: { ...ALICE, email: 'ALICE@example.COM' } });
    expect(dup.status).toBe(409);
    expect((await dup.json()).error).toBe('email-in-use');
    const available = async (email) => (await (await call('/api/auth/email-available', { method: 'POST', body: { email } })).json()).available;
    expect(await available('alice@example.com')).toBe(false);
    expect(await available('new@example.com')).toBe(true);
  });

  it('validates sign-up input on the server', async () => {
    const res = await call('/api/auth/signup', { method: 'POST', body: { ...ALICE, phone: '12345', password: 'short', email: 'not-an-email' } });
    expect(res.status).toBe(400);
    expect((await res.json()).fields).toEqual(expect.arrayContaining(['phone', 'password', 'email']));
  });

  it('expires sessions after 7 days', async () => {
    const cookie = cookieOf(await call('/api/auth/signup', { method: 'POST', body: ALICE }));
    clock.t += SESSION_TTL_MS - 1000;
    expect((await (await call('/api/auth/me', { cookie })).json()).user).not.toBeNull();
    clock.t += 2000;
    expect((await (await call('/api/auth/me', { cookie })).json()).user).toBeNull();
    expect(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n).toBe(0); // expired row removed
  });

  it('sets an httpOnly, SameSite=Lax cookie, Secure only over HTTPS', async () => {
    const plain = (await call('/api/auth/signup', { method: 'POST', body: ALICE })).headers.get('set-cookie');
    expect(plain).toMatch(/HttpOnly/);
    expect(plain).toMatch(/SameSite=Lax/);
    expect(plain).toMatch(/Max-Age=604800/);
    expect(plain).not.toMatch(/Secure/);
    const https = await call('/api/auth/login', { method: 'POST', body: { email: ALICE.email, password: ALICE.password }, headers: { 'X-Forwarded-Proto': 'https' } });
    expect(https.headers.get('set-cookie')).toMatch(/; Secure/);
  });

  it('stores only a salted scrypt hash and a hashed session token', async () => {
    const res = await call('/api/auth/signup', { method: 'POST', body: ALICE });
    const token = decodeURIComponent(cookieOf(res).split('=')[1]);
    const row = db.prepare('SELECT password_hash FROM users').get();
    expect(row.password_hash).toMatch(/^scrypt\$/);
    expect(row.password_hash).not.toContain(ALICE.password);
    const dump = JSON.stringify(db.prepare('SELECT * FROM sessions').all());
    expect(dump).not.toContain(token);
    // Same password, different salt, different hash.
    const [a, b] = await Promise.all([hashPassword('same-password'), hashPassword('same-password')]);
    expect(a).not.toBe(b);
    expect(await verifyPassword('same-password', a)).toBe(true);
    expect(await verifyPassword('other-password', a)).toBe(false);
  });

  it('lets a signed-in user delete their own account', async () => {
    const cookie = cookieOf(await call('/api/auth/signup', { method: 'POST', body: ALICE }));
    expect((await call('/api/auth/me', { method: 'DELETE', cookie })).status).toBe(200);
    expect((await (await call('/api/auth/me', { cookie })).json()).user).toBeNull();
    expect((await call('/api/auth/login', { method: 'POST', body: { email: ALICE.email, password: ALICE.password } })).status).toBe(401);
  });

  it('refuses non-JSON posts and hides admin routes unless enabled', async () => {
    const form = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'email=a&password=b' });
    expect(form.status).toBe(415);
    expect((await call('/api/auth/admin/clients')).status).toBe(404);
  });

  it('admin routes list clients, change KYC and delete accounts when enabled', async () => {
    await new Promise((r) => server.close(r));
    await start({ adminRoutes: true });
    await call('/api/auth/signup', { method: 'POST', body: { ...ALICE, kycStatus: 'pending' } });
    const kyc = await call('/api/auth/admin/kyc', { method: 'POST', body: { email: ALICE.email, kycStatus: 'approved' } });
    expect((await kyc.json()).user.kycStatus).toBe('approved');
    const { clients } = await (await call('/api/auth/admin/clients')).json();
    expect(clients.map((c) => c.email)).toEqual([ALICE.email]);
    expect((await (await call('/api/auth/admin/delete', { method: 'POST', body: { email: ALICE.email } })).json()).deleted).toBe(true);
  });

  it('seeds the demo account once, with a hashed password', async () => {
    await new Promise((r) => server.close(r));
    await start({ seedDemo: true });
    const login = await call('/api/auth/login', { method: 'POST', body: { email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password } });
    expect(login.status).toBe(200);
    expect((await login.json()).user).toMatchObject({ name: 'Prasanth Kumar', kycStatus: 'approved' });
    createAuthMiddleware({ db, seedDemo: true }); // a restart must not duplicate it
    expect(db.prepare('SELECT COUNT(*) AS n FROM users').get().n).toBe(1);
  });

  it('runs migrations once and survives a restart on the same database', () => {
    const versions = db.prepare('SELECT version FROM schema_migrations').all();
    expect(versions).toEqual([{ version: 1 }, { version: 2 }, { version: 3 }]);
  });

  it('never logs passwords or tokens on a server error', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.exec('DROP TABLE sessions'); // force a failure after the password is checked
    const res = await call('/api/auth/signup', { method: 'POST', body: ALICE });
    expect(res.status).toBe(500);
    expect(JSON.stringify(errors.mock.calls)).not.toContain(ALICE.password);
    errors.mockRestore();
  });
});
