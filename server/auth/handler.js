// /api/auth/*: real accounts and login sessions for clients and lawyers,
// backed by the database (server/db). Shared by the Vite dev server
// (vite.config.js) and the production server (server/index.js).
//
//   POST   /api/auth/signup            client: { firstName, lastName, phone, email, city, password, kycStatus }
//   POST   /api/auth/lawyer-signup     lawyer application: the same fields + bar council details (status 'submitted')
//   POST   /api/auth/login             { email, password, role: 'client' | 'lawyer' }
//   POST   /api/auth/logout
//   GET    /api/auth/me                { user } when signed in, { user: null } when not
//   DELETE /api/auth/me                a client deletes their own account and bookings (right to erasure)
//   POST   /api/auth/email-available   { email }
//   Mock admin console only (dev, or ENABLE_MOCK_ADMIN / VITE_ENABLE_MOCK_ADMIN=true):
//   GET    /api/auth/admin/clients
//   POST   /api/auth/admin/kyc         { email, kycStatus }
//   POST   /api/auth/admin/delete      { email }
//   GET    /api/auth/admin/lawyers
//   POST   /api/auth/admin/lawyer-status { id, status, rejectionReason }
//
// KYC and OTP are still simulated in the browser, so kycStatus is taken from
// the sign-up request. One email = one account, whichever role.

import { createRateLimiter } from '../rateLimit.js';
import { createUserRepository } from '../db/users.js';
import { createPracticeRepository } from '../db/practice.js';
import { hashPassword, verifyPassword, verifyAgainstDummy } from './passwords.js';
import { createSessions, clientIp, readJsonBody, send } from './sessions.js';

export { SESSION_COOKIE, SESSION_TTL_MS } from './sessions.js';

// Same demo accounts the sign-in screens have always advertised.
export const DEMO_ACCOUNT = {
  firstName: 'Prasanth',
  lastName: 'Kumar',
  phone: '9876543210',
  email: 'demo@lawyerup.in',
  city: 'Bengaluru',
  password: 'lawyerup123',
  kycStatus: 'approved',
};

// Dev only. Shares id 1 with "Adv. Rekha Menon" in src/data/lawyers.js and
// stays 'submitted', so it never adds a second marketplace card (see the
// note in src/services/mockLawyerStore.js).
export const DEMO_LAWYER = {
  user: { firstName: 'Rekha', lastName: 'Menon', phone: '9900011122', email: 'demo.lawyer@lawyerup.dev', city: 'Bengaluru', password: 'lawyerup123' },
  profile: {
    barCouncilId: 'KAR/2011/4521',
    barCouncilState: 'Karnataka',
    yearsOfExperience: 14,
    practiceAreas: ['criminal'],
    consultationFee: 1200,
    courts: ['Bengaluru City Civil Court', 'Karnataka High Court'],
    langs: 'English, Kannada, Hindi',
    bio: 'Practices criminal defence and bail matters across Karnataka district courts and the Karnataka High Court.',
    documents: { barCertificate: 'dev-seed.pdf', idProof: 'dev-seed.pdf' },
  },
};

// Two past, closed consultations so the demo client has history to look at
// (previously seeded in the browser by src/data/demoUser.js).
const DEMO_CONSULTATIONS = [
  {
    lawyerId: 1,
    lawyerName: 'Adv. Rekha Menon',
    categorySlug: 'criminal',
    consultationType: 'online',
    date: '14 Jul 2026',
    time: '11:30 AM',
    fee: 1200,
    caseSummary: 'Needed clarity on rights after being questioned by traffic police without a written notice.',
    createdAt: '2026-07-14T06:00:00.000Z',
  },
  {
    lawyerId: 3,
    lawyerName: 'Adv. Kavita Iyer',
    categorySlug: 'property',
    consultationType: 'in_person',
    date: '2 Jun 2026',
    time: '2:30 PM',
    fee: 999,
    city: 'Chennai',
    caseSummary: 'Reviewing a sale deed before registration.',
    createdAt: '2026-06-02T09:00:00.000Z',
  },
];

const PRACTICE_AREAS = ['criminal', 'family', 'property', 'corporate', 'cyber', 'consumer', 'immigration', 'other'];
const LAWYER_STATUSES = ['submitted', 'under_review', 'approved', 'rejected'];

const isEmail = (v) => typeof v === 'string' && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const isMobile = (v) => typeof v === 'string' && /^[6-9]\d{9}$/.test(v.trim());
const isName = (v) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 60;
const isPassword = (v) => typeof v === 'string' && v.length >= 8 && v.length <= 200;
const isText = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const isOptionalText = (v, max) => v === undefined || v === null || (typeof v === 'string' && v.length <= max);
const isPositiveInt = (v, max) => Number.isInteger(v) && v > 0 && v <= max;

function invalidFields(checks) {
  return Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([field]) => field);
}

function accountFields(body) {
  return {
    firstName: isName(body.firstName),
    lastName: isName(body.lastName),
    phone: isMobile(body.phone),
    email: isEmail(body.email),
    city: isName(body.city),
    password: isPassword(body.password),
  };
}

const trimAccount = (body) => ({
  firstName: body.firstName.trim(),
  lastName: body.lastName.trim(),
  phone: body.phone.trim(),
  email: body.email.trim(),
  city: body.city.trim(),
});

/**
 * @param {{ db: import('node:sqlite').DatabaseSync, adminRoutes?: boolean, seedDemo?: boolean,
 *           seedDemoLawyer?: boolean, now?: () => number,
 *           rateLimit?: { take(key: string): { allowed: boolean } } }} options
 */
export function createAuthMiddleware({
  db,
  adminRoutes = false,
  seedDemo = true,
  seedDemoLawyer = false,
  now = Date.now,
  rateLimit = createRateLimiter({ capacity: 10, refillPerMinute: 10 }),
}) {
  const users = createUserRepository(db);
  const practice = createPracticeRepository(db, { now });
  const sessions = createSessions(users, now);
  users.purgeExpiredSessions(now());

  // What the app keeps as `user`: a lawyer's application profile (id is the
  // numeric lawyer id the bookings use), or a client's account profile.
  const profileFor = (account) => (account?.role === 'lawyer' ? practice.lawyerProfileForUser(account.id) : account);

  const ready = (async () => {
    // Seed the lawyer first: the demo client's past consultations are with lawyer 1.
    if (seedDemoLawyer && !users.findByEmail(DEMO_LAWYER.user.email)) {
      const { password, ...account } = DEMO_LAWYER.user;
      const lawyerUser = users.create({ ...account, role: 'lawyer', passwordHash: await hashPassword(password) });
      practice.createLawyerProfile(lawyerUser.id, DEMO_LAWYER.profile, { lawyerId: 1, displayName: 'Adv. Rekha Menon' });
    }
    if (seedDemo && !users.findByEmail(DEMO_ACCOUNT.email)) {
      const { password, ...profile } = DEMO_ACCOUNT;
      const client = users.create({ ...profile, passwordHash: await hashPassword(password) });
      for (const consultation of DEMO_CONSULTATIONS) practice.seedPastConsultation(client, consultation);
    }
  })();

  const routes = {
    'POST /api/auth/signup': async (req, res, body) => {
      const invalid = invalidFields(accountFields(body));
      if (invalid.length) return send(res, 400, { error: 'invalid-input', fields: invalid });
      let user;
      try {
        user = users.create({
          ...trimAccount(body),
          kycStatus: body.kycStatus === 'approved' ? 'approved' : 'pending',
          passwordHash: await hashPassword(body.password),
        });
      } catch (err) {
        if (err.code === 'email-in-use') return send(res, 409, { error: 'email-in-use' });
        throw err;
      }
      sessions.start(req, res, user);
      return send(res, 201, { user });
    },

    'POST /api/auth/lawyer-signup': async (req, res, body) => {
      const invalid = invalidFields({
        ...accountFields(body),
        barCouncilId: isText(body.barCouncilId, 60),
        barCouncilState: isText(body.barCouncilState, 60),
        yearsOfExperience: isPositiveInt(body.yearsOfExperience, 80),
        consultationFee: isPositiveInt(body.consultationFee, 1_000_000),
        practiceAreas: Array.isArray(body.practiceAreas) && body.practiceAreas.length > 0 && body.practiceAreas.every((p) => PRACTICE_AREAS.includes(p)),
        courts: Array.isArray(body.courts) && body.courts.length <= 20 && body.courts.every((c) => isText(c, 120)),
        langs: isText(body.langs, 200),
        bio: isText(body.bio, 2000),
        documents: body.documents && isOptionalText(body.documents.barCertificate, 255) && isOptionalText(body.documents.idProof, 255),
      });
      if (invalid.length) return send(res, 400, { error: 'invalid-input', fields: invalid });
      const passwordHash = await hashPassword(body.password);
      let profile;
      let user;
      db.exec('BEGIN IMMEDIATE');
      try {
        user = users.create({ ...trimAccount(body), role: 'lawyer', passwordHash });
        profile = practice.createLawyerProfile(user.id, {
          barCouncilId: body.barCouncilId.trim(),
          barCouncilState: body.barCouncilState.trim(),
          yearsOfExperience: body.yearsOfExperience,
          practiceAreas: body.practiceAreas,
          consultationFee: body.consultationFee,
          courts: body.courts.map((c) => c.trim()),
          langs: body.langs.trim(),
          bio: body.bio.trim(),
          // File names only: the upload itself is still simulated.
          documents: { barCertificate: body.documents.barCertificate || null, idProof: body.documents.idProof || null },
        });
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        if (err.code === 'email-in-use') return send(res, 409, { error: 'email-in-use' });
        throw err;
      }
      sessions.start(req, res, user);
      return send(res, 201, { user: profile });
    },

    'POST /api/auth/login': async (req, res, body) => {
      const role = body.role === 'lawyer' ? 'lawyer' : 'client';
      if (!isEmail(body.email) || typeof body.password !== 'string') return send(res, 401, { error: 'invalid-credentials' });
      const stored = users.getPasswordHash(body.email);
      const ok = stored ? await verifyPassword(body.password, stored) : await verifyAgainstDummy(body.password);
      const account = ok ? users.findByEmail(body.email) : null;
      // A client account can't sign in through the lawyer form, or the other way round.
      if (!account || account.role !== role) return send(res, 401, { error: 'invalid-credentials' });
      sessions.start(req, res, account);
      return send(res, 200, { user: profileFor(account) });
    },

    'POST /api/auth/logout': async (req, res) => {
      sessions.end(req, res);
      return send(res, 200, { ok: true });
    },

    'GET /api/auth/me': async (req, res) => {
      // 200 either way: being signed out is a normal answer, not an error.
      return send(res, 200, { user: profileFor(sessions.current(req)) || null });
    },

    'DELETE /api/auth/me': async (req, res) => {
      const account = sessions.current(req);
      if (!account) return send(res, 401, { error: 'not-signed-in' });
      if (account.role !== 'client') return send(res, 403, { error: 'forbidden' });
      deleteClient(account.email);
      sessions.clearCookie(req, res);
      return send(res, 200, { ok: true });
    },

    'POST /api/auth/email-available': async (req, res, body) => {
      if (!isEmail(body.email)) return send(res, 400, { error: 'invalid-input', fields: ['email'] });
      return send(res, 200, { available: !users.findByEmail(body.email) });
    },
  };

  /** Deletes a client account; its appointments, cases and sessions cascade, and their booked slots open up again. */
  function deleteClient(email) {
    const account = users.findByEmail(email);
    if (!account || account.role !== 'client') return false;
    db.exec('BEGIN IMMEDIATE');
    try {
      practice.releaseSlotsForClient(account.id);
      users.deleteByEmail(email);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    return true;
  }

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
        return send(res, 200, { deleted: deleteClient(body.email) });
      },
      'GET /api/auth/admin/lawyers': async (req, res) => send(res, 200, { lawyers: practice.allLawyerProfiles() }),
      'POST /api/auth/admin/lawyer-status': async (req, res, body) => {
        if (!Number.isInteger(body.id) || !LAWYER_STATUSES.includes(body.status) || !isOptionalText(body.rejectionReason, 500)) {
          return send(res, 400, { error: 'invalid-input' });
        }
        if (!practice.lawyerProfileById(body.id)) return send(res, 404, { error: 'not-found' });
        return send(res, 200, { lawyer: practice.setLawyerStatus(body.id, body.status, body.rejectionReason || null) });
      },
    });
  }

  const RATE_LIMITED = new Set(['POST /api/auth/signup', 'POST /api/auth/lawyer-signup', 'POST /api/auth/login', 'POST /api/auth/email-available']);

  const middleware = async function authMiddleware(req, res) {
    const { pathname } = new URL(req.originalUrl || req.url, 'http://localhost');
    const key = `${req.method} ${pathname.replace(/\/+$/, '')}`;
    const route = routes[key];
    if (!route) return send(res, 404, { error: 'not-found' });
    if (RATE_LIMITED.has(key) && !rateLimit.take(clientIp(req)).allowed) return send(res, 429, { error: 'rate-limited' });

    const { body, error } = await readJsonBody(req);
    if (error) return send(res, ...error);

    try {
      await ready;
      return await route(req, res, body);
    } catch (err) {
      console.error(JSON.stringify({ event: 'auth_error', route: key, message: err?.message }));
      return send(res, 500, { error: 'server-error' });
    }
  };
  // Lets /api/data wait for the demo seed before its first answer.
  middleware.ready = ready;
  return middleware;
}
