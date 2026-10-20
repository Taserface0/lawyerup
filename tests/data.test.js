import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { openDatabase } from '../server/db/index.js';
import { createAuthMiddleware, DEMO_ACCOUNT, DEMO_LAWYER } from '../server/auth/handler.js';
import { createDataMiddleware } from '../server/data/handler.js';
import { slotStartsAt } from '../server/db/practice.js';

const NO_LIMIT = { take: () => ({ allowed: true }) };
const client = (n) => ({ firstName: `Client${n}`, lastName: 'Test', phone: `98765000${n}${n}`, email: `client${n}@example.com`, city: 'Pune', password: 'password-123', kycStatus: 'approved' });
const lawyerApplication = (n) => ({
  firstName: `Lawyer${n}`,
  lastName: 'Adv',
  phone: `91234000${n}${n}`,
  email: `lawyer${n}@example.com`,
  city: 'Mumbai',
  password: 'password-123',
  barCouncilId: `MAH/2015/00${n}`,
  barCouncilState: 'Maharashtra',
  yearsOfExperience: 9,
  practiceAreas: ['family'],
  consultationFee: 1500,
  courts: ['Bombay High Court'],
  langs: 'English, Marathi',
  bio: 'Family law.',
  documents: { barCertificate: 'bar.pdf', idProof: 'id.pdf' },
});

let db, server, base, clock;

async function start(options = {}) {
  db = openDatabase(':memory:');
  clock = { t: Date.UTC(2026, 0, 1, 6, 0) };
  const now = () => clock.t;
  const auth = createAuthMiddleware({ db, seedDemo: false, now, rateLimit: NO_LIMIT, adminRoutes: true, ...options });
  const data = createDataMiddleware({ db, ready: auth.ready, now, rateLimit: NO_LIMIT });
  server = createServer((req, res) => (req.url.startsWith('/api/auth/') ? auth(req, res) : data(req, res)));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
}

function call(path, { method, body, cookie } = {}) {
  return fetch(base + path, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(cookie && { Cookie: cookie }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const json = async (resPromise) => (await resPromise).json();
const cookieOf = (res) => res.headers.get('set-cookie')?.split(';')[0];

async function signUpClient(n) {
  return cookieOf(await call('/api/auth/signup', { body: client(n) }));
}
/** The dev demo lawyer (id 1, listed as Adv. Rekha Menon) signed in. */
async function signInDemoLawyer() {
  const res = await call('/api/auth/login', { body: { email: DEMO_LAWYER.user.email, password: DEMO_LAWYER.user.password, role: 'lawyer' } });
  return cookieOf(res);
}
async function addSlot(cookie, slot = {}) {
  return call('/api/data/slots', { cookie, body: { date: '2026-02-01', startTime: '10:00 AM', consultationType: 'online', ...slot } });
}

beforeEach(() => start({ seedDemoLawyer: true }));
afterEach(() => new Promise((r) => server.close(r)));

describe('booking', () => {
  it('lets a client book a lawyer slot and both sides see the same appointment and case', async () => {
    const lawyer = await signInDemoLawyer();
    const { slot } = await json(addSlot(lawyer));
    expect((await json(call('/api/data'))).openSlots.map((s) => s.id)).toEqual([slot.id]); // public calendar

    const alice = await signUpClient(1);
    const booked = await call('/api/data/bookings', { cookie: alice, body: { slotId: slot.id, caseSummary: 'Bail question' } });
    expect(booked.status).toBe(201);
    const { appointment, case: newCase } = await booked.json();
    expect(appointment).toMatchObject({ clientId: 'client1@example.com', lawyerId: 1, lawyerName: 'Adv. Rekha Menon', fee: 1200, platformFee: 49, date: '1 Feb 2026', time: '10:00 AM', status: 'CONFIRMED' });
    expect(newCase).toMatchObject({ appointmentId: appointment.appointmentId, status: 'ACTIVE', caseNumber: 1 });

    const lawyerView = await json(call('/api/data', { cookie: lawyer }));
    expect(lawyerView.appointments.map((a) => a.appointmentId)).toEqual([appointment.appointmentId]);
    expect(lawyerView.cases.map((c) => c.caseId)).toEqual([newCase.caseId]);
    expect(lawyerView.mySlots[0]).toMatchObject({ status: 'BOOKED', appointmentId: appointment.appointmentId });
    expect(lawyerView.clients).toEqual([expect.objectContaining({ email: 'client1@example.com', name: 'Client1 Test' })]);
    expect((await json(call('/api/data'))).openSlots).toEqual([]); // no longer offered
  });

  it('never lets two concurrent bookings take the same slot', async () => {
    const lawyer = await signInDemoLawyer();
    const { slot } = await json(addSlot(lawyer));
    const cookies = await Promise.all([1, 2, 3, 4, 5].map(signUpClient));
    const results = await Promise.all(cookies.map((cookie) => call('/api/data/bookings', { cookie, body: { slotId: slot.id } })));
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409, 409, 409, 409]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM appointments').get().n).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS n FROM cases').get().n).toBe(1);
  });

  it('refuses past slots, unknown slots, lawyers booking and signed-out visitors', async () => {
    const lawyer = await signInDemoLawyer();
    const { slot } = await json(addSlot(lawyer, { date: '2026-01-01', startTime: '9:00 AM' })); // 9:00 IST = 03:30 UTC, before the clock
    const alice = await signUpClient(1);
    expect((await call('/api/data/bookings', { cookie: alice, body: { slotId: slot.id } })).status).toBe(409);
    expect((await call('/api/data/bookings', { cookie: alice, body: { slotId: 'slot_nope' } })).status).toBe(409);
    const future = (await json(addSlot(lawyer))).slot;
    expect((await call('/api/data/bookings', { cookie: lawyer, body: { slotId: future.id } })).status).toBe(403);
    expect((await call('/api/data/bookings', { body: { slotId: future.id } })).status).toBe(401);
  });

  it('reads slot times as India time wherever the server runs', () => {
    expect(new Date(slotStartsAt('2026-02-01', '10:00 AM')).toISOString()).toBe('2026-02-01T04:30:00.000Z');
    expect(new Date(slotStartsAt('2026-02-01', '12:30 PM')).toISOString()).toBe('2026-02-01T07:00:00.000Z');
  });
});

describe('access control', () => {
  it("keeps one client's bookings and cases away from another client", async () => {
    const lawyer = await signInDemoLawyer();
    const { slot } = await json(addSlot(lawyer));
    const alice = await signUpClient(1);
    const { case: aliceCase } = await json(call('/api/data/bookings', { cookie: alice, body: { slotId: slot.id } }));

    const bob = await signUpClient(2);
    const bobView = await json(call('/api/data', { cookie: bob }));
    expect(bobView.appointments).toEqual([]);
    expect(bobView.cases).toEqual([]);
    expect((await call('/api/data/cases/request-resolution', { cookie: bob, body: { caseId: aliceCase.caseId } })).status).toBe(404);
    expect((await json(call('/api/data'))).cases).toEqual([]); // signed out sees nothing private
  });

  it("keeps one lawyer's cases and slots away from another lawyer", async () => {
    const lawyer = await signInDemoLawyer();
    const { slot } = await json(addSlot(lawyer));
    const alice = await signUpClient(1);
    const { case: c } = await json(call('/api/data/bookings', { cookie: alice, body: { slotId: slot.id } }));
    await call('/api/data/cases/request-resolution', { cookie: alice, body: { caseId: c.caseId } });

    const other = cookieOf(await call('/api/auth/lawyer-signup', { body: lawyerApplication(1) }));
    const otherView = await json(call('/api/data', { cookie: other }));
    expect(otherView.cases).toEqual([]);
    expect(otherView.mySlots).toEqual([]);
    expect(otherView.clients).toEqual([]);
    expect((await call('/api/data/cases/confirm-resolution', { cookie: other, body: { caseId: c.caseId } })).status).toBe(404);
    expect((await call('/api/data/slots/remove', { cookie: other, body: { slotId: slot.id } })).status).toBe(404);
    expect((await json(call('/api/data', { cookie: lawyer }))).cases[0].status).toBe('CLIENT_REQUESTED_RESOLUTION'); // untouched
  });
});

describe('case lifecycle', () => {
  it('follows ACTIVE -> requested -> ACTIVE -> requested -> CLOSED, each step only by the right side', async () => {
    const lawyer = await signInDemoLawyer();
    const { slot } = await json(addSlot(lawyer));
    const alice = await signUpClient(1);
    const { case: c } = await json(call('/api/data/bookings', { cookie: alice, body: { slotId: slot.id } }));
    const act = async (action, cookie) => call(`/api/data/cases/${action}`, { cookie, body: { caseId: c.caseId } });

    expect((await act('confirm-resolution', alice)).status).toBe(403); // client can't close
    expect((await act('request-resolution', lawyer)).status).toBe(403); // lawyer can't request for the client
    expect((await (await act('keep-active', lawyer)).json()).case.status).toBe('ACTIVE'); // nothing pending: no-op

    const requested = (await (await act('request-resolution', alice)).json()).case;
    expect(requested.status).toBe('CLIENT_REQUESTED_RESOLUTION');
    expect(requested.clientResolutionRequestedAt).toBeTruthy();
    const kept = (await (await act('keep-active', lawyer)).json()).case;
    expect(kept).toMatchObject({ status: 'ACTIVE', clientResolutionRequestedAt: null });

    await act('request-resolution', alice);
    const closed = (await (await act('confirm-resolution', lawyer)).json()).case;
    expect(closed.status).toBe('CLOSED');
    expect(closed.resolvedAt).toBe(closed.lawyerConfirmedResolutionAt);
    expect((await (await act('request-resolution', alice)).json()).case.status).toBe('CLOSED'); // terminal
  });

  it('numbers cases max + 1, so numbers are never reused after a deletion', async () => {
    const lawyer = await signInDemoLawyer();
    const slots = [];
    for (const t of ['10:00 AM', '11:00 AM', '12:00 PM']) slots.push((await json(addSlot(lawyer, { startTime: t }))).slot);
    const a = await signUpClient(1);
    const b = await signUpClient(2);
    await call('/api/data/bookings', { cookie: a, body: { slotId: slots[0].id } });
    await call('/api/data/bookings', { cookie: b, body: { slotId: slots[1].id } });
    await call('/api/auth/me', { method: 'DELETE', cookie: a }); // case #1 goes away
    const c = await signUpClient(3);
    const { case: third } = await json(call('/api/data/bookings', { cookie: c, body: { slotId: slots[2].id } }));
    expect(third.caseNumber).toBe(3);
  });
});

describe('availability', () => {
  it('enforces the slot rules: no duplicates, booked slots stay, days can be closed and reopened', async () => {
    const lawyer = await signInDemoLawyer();
    const { slot } = await json(addSlot(lawyer));
    expect((await addSlot(lawyer)).status).toBe(409); // duplicate
    expect((await addSlot(lawyer, { consultationType: 'in_person' })).status).toBe(201); // other type is fine
    expect((await addSlot(lawyer, { startTime: '25:00 PM' })).status).toBe(400);

    expect((await json(call('/api/data/slots/mark-day-unavailable', { cookie: lawyer, body: { date: '2026-02-01' } }))).changed).toBe(true);
    expect((await json(call('/api/data'))).openSlots).toEqual([]);
    expect((await json(call('/api/data/slots/mark-available', { cookie: lawyer, body: { slotId: slot.id } }))).slot.status).toBe('AVAILABLE');

    const alice = await signUpClient(1);
    await call('/api/data/bookings', { cookie: alice, body: { slotId: slot.id } });
    expect((await call('/api/data/slots/remove', { cookie: lawyer, body: { slotId: slot.id } })).status).toBe(409); // booked
    expect((await call('/api/data/slots', { cookie: alice, body: { date: '2026-02-02', startTime: '10:00 AM', consultationType: 'online' } })).status).toBe(403);
  });
});

describe('lawyer accounts', () => {
  it('applies, signs in as a lawyer only, and appears in the marketplace once approved', async () => {
    const signup = await call('/api/auth/lawyer-signup', { body: lawyerApplication(1) });
    expect(signup.status).toBe(201);
    const { user } = await signup.json();
    expect(user).toMatchObject({ role: 'lawyer', status: 'submitted', name: 'Lawyer1 Adv', practiceAreas: ['family'], consultationFee: 1500 });
    expect(user.id).toBeGreaterThan(1000);
    expect(user).not.toHaveProperty('passwordHash');

    const asClient = await call('/api/auth/login', { body: { email: 'lawyer1@example.com', password: 'password-123', role: 'client' } });
    expect(asClient.status).toBe(401); // the client form can't sign a lawyer in
    const asLawyer = await call('/api/auth/login', { body: { email: 'lawyer1@example.com', password: 'password-123', role: 'lawyer' } });
    const cookie = cookieOf(asLawyer);
    expect((await json(call('/api/auth/me', { cookie }))).user).toMatchObject({ id: user.id, status: 'submitted' });

    expect((await json(call('/api/data'))).approvedLawyers).toEqual([]);
    await call('/api/auth/admin/lawyer-status', { body: { id: user.id, status: 'approved' } });
    const [listing] = (await json(call('/api/data'))).approvedLawyers;
    expect(listing).toMatchObject({ id: user.id, name: 'Lawyer1 Adv', consultationFee: 1500 });
    expect(listing).not.toHaveProperty('email');
    expect(listing).not.toHaveProperty('phone');
    expect((await json(call('/api/auth/me', { cookie }))).user.status).toBe('approved');

    // Bookable at its own fee once approved.
    const { slot } = await json(call('/api/data/slots', { cookie, body: { date: '2026-02-01', startTime: '3:00 PM', consultationType: 'in_person' } }));
    const alice = await signUpClient(1);
    const { appointment } = await json(call('/api/data/bookings', { cookie: alice, body: { slotId: slot.id, city: 'Mumbai' } }));
    expect(appointment).toMatchObject({ lawyerId: user.id, fee: 1500, city: 'Mumbai', categorySlug: 'family' });
  });

  it("can't book an applicant who hasn't been approved", async () => {
    const cookie = cookieOf(await call('/api/auth/lawyer-signup', { body: lawyerApplication(2) }));
    const { slot } = await json(call('/api/data/slots', { cookie, body: { date: '2026-02-01', startTime: '3:00 PM', consultationType: 'online' } }));
    const alice = await signUpClient(1);
    const res = await call('/api/data/bookings', { cookie: alice, body: { slotId: slot.id } });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('lawyer-not-bookable');
    expect(db.prepare("SELECT status FROM availability_slots WHERE id = ?").get(slot.id).status).toBe('AVAILABLE'); // rolled back
  });

  it('rejects an application with a reason, and refuses a duplicate email across roles', async () => {
    const { user } = await json(call('/api/auth/lawyer-signup', { body: lawyerApplication(3) }));
    const { lawyer } = await json(call('/api/auth/admin/lawyer-status', { body: { id: user.id, status: 'rejected', rejectionReason: 'Bar ID not found' } }));
    expect(lawyer).toMatchObject({ status: 'rejected', rejectionReason: 'Bar ID not found' });
    expect((await call('/api/auth/signup', { body: { ...client(1), email: 'lawyer3@example.com' } })).status).toBe(409);
  });
});

describe('account deletion and demo data', () => {
  it("deleting a client removes their bookings and cases and reopens the slot", async () => {
    const lawyer = await signInDemoLawyer();
    const { slot } = await json(addSlot(lawyer));
    const alice = await signUpClient(1);
    await call('/api/data/bookings', { cookie: alice, body: { slotId: slot.id } });
    expect((await call('/api/auth/me', { method: 'DELETE', cookie: alice })).status).toBe(200);
    expect(db.prepare('SELECT COUNT(*) AS n FROM appointments').get().n).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM cases').get().n).toBe(0);
    expect((await json(call('/api/data'))).openSlots.map((s) => s.id)).toEqual([slot.id]);
    expect((await call('/api/auth/me', { method: 'DELETE', cookie: lawyer })).status).toBe(403); // lawyers can't use the client erasure route
  });

  it('seeds the demo client with two closed consultations the demo lawyer can see', async () => {
    await new Promise((r) => server.close(r));
    await start({ seedDemo: true, seedDemoLawyer: true });
    const demo = cookieOf(await call('/api/auth/login', { body: { email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password } }));
    const view = await json(call('/api/data', { cookie: demo }));
    expect(view.cases.map((c) => c.status)).toEqual(['CLOSED', 'CLOSED']);
    expect(view.appointments.map((a) => a.lawyerName)).toEqual(['Adv. Rekha Menon', 'Adv. Kavita Iyer']);
    const lawyerView = await json(call('/api/data', { cookie: await signInDemoLawyer() }));
    expect(lawyerView.cases).toHaveLength(1);
    expect(lawyerView.clients[0]).toMatchObject({ email: DEMO_ACCOUNT.email, name: 'Prasanth Kumar' });
  });
});
