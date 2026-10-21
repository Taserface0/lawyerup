import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { openDatabase } from '../server/db/index.js';
import { createAuthMiddleware, DEMO_LAWYER } from '../server/auth/handler.js';
import { createDataMiddleware } from '../server/data/handler.js';
import { createEventHub } from '../server/data/events.js';
import { foldReviews } from '../server/db/conversations.js';

const NO_LIMIT = { take: () => ({ allowed: true }) };
const client = (n) => ({ firstName: `Client${n}`, lastName: 'Test', phone: `98765000${n}${n}`, email: `client${n}@example.com`, city: 'Pune', password: 'password-123', kycStatus: 'approved' });

let db, server, base, clock, events;

async function start() {
  db = openDatabase(':memory:');
  clock = { t: Date.UTC(2026, 0, 1, 6, 0) };
  const now = () => clock.t;
  events = createEventHub();
  const auth = createAuthMiddleware({ db, events, seedDemo: false, seedDemoLawyer: true, now, rateLimit: NO_LIMIT });
  const data = createDataMiddleware({ db, events, ready: auth.ready, now, rateLimit: NO_LIMIT });
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
const json = async (p) => (await p).json();
const cookieOf = (res) => res.headers.get('set-cookie')?.split(';')[0];
const signUpClient = async (n) => cookieOf(await call('/api/auth/signup', { body: client(n) }));
const signInLawyer = async () => cookieOf(await call('/api/auth/login', { body: { email: DEMO_LAWYER.user.email, password: DEMO_LAWYER.user.password, role: 'lawyer' } }));

/** A client (Alice) with an ACTIVE case booked with the demo lawyer. */
async function bookedCase() {
  const lawyer = await signInLawyer();
  const { slot } = await json(call('/api/data/slots', { cookie: lawyer, body: { date: '2026-02-01', startTime: '10:00 AM', consultationType: 'online' } }));
  const alice = await signUpClient(1);
  const { appointment, case: c } = await json(call('/api/data/bookings', { cookie: alice, body: { slotId: slot.id } }));
  return { lawyer, alice, appointment, caseId: c.caseId };
}
async function closeCase({ lawyer, alice, caseId }) {
  await call('/api/data/cases/request-resolution', { cookie: alice, body: { caseId } });
  await call('/api/data/cases/confirm-resolution', { cookie: lawyer, body: { caseId } });
}
const unread = (messages, viewerRole) => messages.filter((m) => m.senderRole !== viewerRole && !m.readAt).length;

beforeEach(start);
afterEach(async () => {
  events.closeAll();
  await new Promise((r) => server.close(r));
});

describe('consultation messages', () => {
  it('lets the client and the lawyer on a case talk, with unread counts that clear when read', async () => {
    const { lawyer, alice, caseId } = await bookedCase();
    const sent = await call('/api/data/messages', { cookie: alice, body: { caseId, text: '  Hello, I need help with bail  ' } });
    expect(sent.status).toBe(201);
    expect((await sent.json()).message).toMatchObject({ caseId, senderRole: 'client', senderId: 'client1@example.com', text: 'Hello, I need help with bail', readAt: null });
    clock.t += 1000;
    await call('/api/data/messages', { cookie: lawyer, body: { caseId, text: 'Happy to help.' } });

    const lawyerView = await json(call('/api/data', { cookie: lawyer }));
    expect(lawyerView.messages.map((m) => m.text)).toEqual(['Hello, I need help with bail', 'Happy to help.']);
    expect(unread(lawyerView.messages, 'lawyer')).toBe(1);

    expect((await json(call('/api/data/messages/read', { cookie: lawyer, body: { caseId } }))).changed).toBe(1);
    expect(unread((await json(call('/api/data', { cookie: lawyer }))).messages, 'lawyer')).toBe(0);
    expect(unread((await json(call('/api/data', { cookie: alice }))).messages, 'client')).toBe(1); // the lawyer's reply is still unread for Alice
  });

  it('keeps outsiders out: another client, another lawyer and signed-out visitors', async () => {
    const { alice, caseId } = await bookedCase();
    await call('/api/data/messages', { cookie: alice, body: { caseId, text: 'private' } });
    const bob = await signUpClient(2);
    expect((await call('/api/data/messages', { cookie: bob, body: { caseId, text: 'hi' } })).status).toBe(404);
    expect((await call('/api/data/messages/read', { cookie: bob, body: { caseId } })).status).toBe(404);
    expect((await json(call('/api/data', { cookie: bob }))).messages).toEqual([]);
    const otherLawyer = cookieOf(
      await call('/api/auth/lawyer-signup', {
        body: { ...client(3), email: 'other.lawyer@example.com', barCouncilId: 'X/1', barCouncilState: 'Goa', yearsOfExperience: 3, practiceAreas: ['family'], consultationFee: 500, courts: [], langs: 'English', bio: 'Bio', documents: {} },
      })
    );
    expect((await call('/api/data/messages', { cookie: otherLawyer, body: { caseId, text: 'hi' } })).status).toBe(404);
    expect((await json(call('/api/data', { cookie: otherLawyer }))).messages).toEqual([]);
    expect((await call('/api/data/messages', { body: { caseId, text: 'hi' } })).status).toBe(401);
    expect((await json(call('/api/data'))).messages).toEqual([]);
  });

  it('refuses messages on a closed case, and empty or oversized ones', async () => {
    const ctx = await bookedCase();
    expect((await call('/api/data/messages', { cookie: ctx.alice, body: { caseId: ctx.caseId, text: '   ' } })).status).toBe(400);
    expect((await call('/api/data/messages', { cookie: ctx.alice, body: { caseId: ctx.caseId, text: 'x'.repeat(4001) } })).status).toBe(400);
    await closeCase(ctx);
    const res = await call('/api/data/messages', { cookie: ctx.lawyer, body: { caseId: ctx.caseId, text: 'one more thing' } });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('case-closed');
  });

  it("stores text as typed (the UI renders it as text, so markup isn't interpreted)", async () => {
    const { alice, caseId } = await bookedCase();
    const { message } = await json(call('/api/data/messages', { cookie: alice, body: { caseId, text: '<img src=x onerror=alert(1)>' } }));
    expect(message.text).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('reviews', () => {
  it('only the client, only after the case is closed, only once', async () => {
    const ctx = await bookedCase();
    const review = { appointmentId: ctx.appointment.appointmentId, rating: 4, reviewText: 'Clear advice' };
    const early = await call('/api/data/reviews', { cookie: ctx.alice, body: review });
    expect(early.status).toBe(409);
    expect((await early.json()).error).toBe('case-not-closed');
    await closeCase(ctx);
    expect((await call('/api/data/reviews', { cookie: ctx.lawyer, body: review })).status).toBe(403);
    expect((await call('/api/data/reviews', { cookie: await signUpClient(2), body: review })).status).toBe(404);
    expect((await call('/api/data/reviews', { cookie: ctx.alice, body: { ...review, rating: 6 } })).status).toBe(400);
    expect((await call('/api/data/reviews', { cookie: ctx.alice, body: review })).status).toBe(201);
    const again = await call('/api/data/reviews', { cookie: ctx.alice, body: { ...review, rating: 1 } });
    expect(again.status).toBe(409);
    expect((await again.json()).error).toBe('already-reviewed');
    expect((await json(call('/api/data', { cookie: ctx.alice }))).myReviews).toEqual([expect.objectContaining({ appointmentId: review.appointmentId, rating: 4 })]);
  });

  it("folds reviews into the lawyer's published rating with the old weighted formula", async () => {
    const ctx = await bookedCase();
    await closeCase(ctx);
    await call('/api/data/reviews', { cookie: ctx.alice, body: { appointmentId: ctx.appointment.appointmentId, rating: 1, reviewText: 'Late' } });
    // Lawyer 1 is Adv. Rekha Menon: 4.9 from 112 in the static listing.
    const { ratings } = await json(call('/api/data'));
    expect(ratings[1]).toEqual({ rating: Math.round(((4.9 * 112 + 1) / 113) * 10) / 10, reviews: 113, revs: [{ n: 'Client1 Test', r: 1, c: 'Late' }] });
    expect(foldReviews({ rating: 0, reviews: 0 }, [{ rating: 5 }, { rating: 4 }])).toEqual({ rating: 4.5, reviews: 2 });
  });

  it('anonymises reviews when the client deletes their account, keeping the rating', async () => {
    const ctx = await bookedCase();
    await closeCase(ctx);
    await call('/api/data/reviews', { cookie: ctx.alice, body: { appointmentId: ctx.appointment.appointmentId, rating: 5, reviewText: 'My bail case' } });
    await call('/api/auth/me', { method: 'DELETE', cookie: ctx.alice });
    const { ratings } = await json(call('/api/data'));
    expect(ratings[1].reviews).toBe(113);
    expect(ratings[1].revs).toEqual([{ n: 'Former client', r: 5, c: '' }]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM messages').get().n).toBe(0);
  });
});

describe('live updates (Server-Sent Events)', () => {
  /** Opens the stream and resolves with a reader of its decoded chunks. */
  async function openStream(cookie) {
    const res = await fetch(`${base}/api/data/events`, { headers: { Cookie: cookie } });
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    return {
      async next() {
        const { value, done } = await reader.read();
        return done ? null : decoder.decode(value);
      },
      cancel: () => reader.cancel(),
    };
  }

  it("tells the other side about a new message, and nobody else's stream", async () => {
    const { lawyer, alice, caseId } = await bookedCase();
    const lawyerStream = await openStream(lawyer);
    expect(await lawyerStream.next()).toMatch(/retry: 5000/);
    const bobStream = await openStream(await signUpClient(2));
    await bobStream.next();

    await call('/api/data/messages', { cookie: alice, body: { caseId, text: 'Are you there?' } });
    expect(await lawyerStream.next()).toMatch(/event: change/);

    // Bob got nothing: the next thing on his stream is the broadcast below.
    await call('/api/data/slots', { cookie: lawyer, body: { date: '2026-02-02', startTime: '10:00 AM', consultationType: 'online' } });
    expect(await bobStream.next()).toMatch(/event: change/);
    lawyerStream.cancel();
    bobStream.cancel();
  });

  it('refuses signed-out visitors and ends the stream after sign-out', async () => {
    expect((await fetch(`${base}/api/data/events`)).status).toBe(401);
    const { lawyer, alice, caseId } = await bookedCase();
    const stream = await openStream(alice);
    await stream.next();
    await call('/api/auth/logout', { method: 'POST', body: {}, cookie: alice });
    await call('/api/data/messages', { cookie: lawyer, body: { caseId, text: 'ping' } });
    expect(await stream.next()).toBeNull(); // closed instead of delivering
    expect(events.size()).toBe(0);
  });
});
