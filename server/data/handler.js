// /api/data/*: lawyers, availability, bookings and cases from the database.
// Who you are comes only from the session cookie, never from ids in the
// request: a client sees and changes only their own bookings and cases, a
// lawyer only the slots, bookings and cases assigned to them. Something you
// may not see answers 404, exactly like something that doesn't exist.
//
//   GET  /api/data                           everything this visitor may see (see snapshot())
//   POST /api/data/bookings                  client: { slotId, city, caseSummary } -> { appointment, case, slot }
//   POST /api/data/cases/request-resolution  client who owns the case: { caseId }
//   POST /api/data/cases/keep-active         lawyer assigned to the case: { caseId }
//   POST /api/data/cases/confirm-resolution  lawyer assigned to the case: { caseId }
//   POST /api/data/slots                     lawyer: { date: 'YYYY-MM-DD', startTime: '10:00 AM', consultationType }
//   POST /api/data/slots/remove              lawyer who owns the slot: { slotId }
//   POST /api/data/slots/mark-day-unavailable  lawyer: { date }
//   POST /api/data/slots/mark-available      lawyer who owns the slot: { slotId }

import { createRateLimiter } from '../rateLimit.js';
import { createUserRepository } from '../db/users.js';
import { createPracticeRepository } from '../db/practice.js';
import { createSessions, clientIp, readJsonBody, send } from '../auth/sessions.js';

const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const isTime = (v) => typeof v === 'string' && /^(1[0-2]|[1-9]):[0-5]\d (AM|PM)$/.test(v);
const isType = (v) => v === 'online' || v === 'in_person';
const isId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 100;
const optionalText = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/**
 * @param {{ db: import('node:sqlite').DatabaseSync, ready?: Promise<unknown>, now?: () => number,
 *           rateLimit?: { take(key: string): { allowed: boolean } } }} options
 */
export function createDataMiddleware({ db, ready = Promise.resolve(), now = Date.now, rateLimit = createRateLimiter({ capacity: 60, refillPerMinute: 60 }) }) {
  const users = createUserRepository(db);
  const practice = createPracticeRepository(db, { now });
  const sessions = createSessions(users, now);

  /** { account, lawyerId } for the signed-in visitor (lawyerId only for lawyers). */
  function viewer(req) {
    const account = sessions.current(req);
    if (!account) return { account: null, lawyerId: null };
    const lawyerId = account.role === 'lawyer' ? practice.lawyerProfileForUser(account.id)?.id ?? null : null;
    return { account, lawyerId };
  }

  function snapshot({ account, lawyerId }) {
    const data = {
      // Public: the marketplace and the open booking calendar.
      approvedLawyers: practice.approvedListings(),
      openSlots: practice.openSlots(),
      appointments: [],
      cases: [],
      mySlots: [],
      clients: [],
    };
    if (account?.role === 'client') {
      data.appointments = practice.appointmentsForClient(account.id);
      data.cases = practice.casesForClient(account.id);
    } else if (lawyerId !== null) {
      data.appointments = practice.appointmentsForLawyer(lawyerId);
      data.cases = practice.casesForLawyer(lawyerId);
      data.mySlots = practice.slotsForLawyer(lawyerId);
      data.clients = practice.clientsForLawyer(lawyerId);
    }
    return data;
  }

  const needClient = ({ account }) => (account?.role === 'client' ? null : account ? [403, { error: 'clients-only' }] : [401, { error: 'not-signed-in' }]);
  const needLawyer = ({ account, lawyerId }) => (lawyerId !== null ? null : account ? [403, { error: 'lawyers-only' }] : [401, { error: 'not-signed-in' }]);

  /** The case, if this visitor is its client (side 'client') or its lawyer (side 'lawyer'). */
  function ownedCase(v, caseId, side) {
    const row = isId(caseId) ? practice.caseRow(caseId) : null;
    if (!row) return null;
    if (side === 'client') return row.client_user_id === v.account.id ? row : null;
    return row.lawyer_id === v.lawyerId ? row : null;
  }

  function ownedSlot(v, slotId) {
    const slot = isId(slotId) ? practice.slotById(slotId) : null;
    return slot && slot.lawyerId === v.lawyerId ? slot : null;
  }

  const caseAction = (side, apply) => (req, res, body, v) => {
    const denied = side === 'client' ? needClient(v) : needLawyer(v);
    if (denied) return send(res, ...denied);
    if (!ownedCase(v, body.caseId, side)) return send(res, 404, { error: 'not-found' });
    return send(res, 200, { case: apply(body.caseId) });
  };

  const routes = {
    'GET /api/data': (req, res, body, v) => send(res, 200, snapshot(v)),

    'POST /api/data/bookings': (req, res, body, v) => {
      const denied = needClient(v);
      if (denied) return send(res, ...denied);
      if (!isId(body.slotId)) return send(res, 400, { error: 'invalid-input' });
      try {
        const result = practice.bookSlot({
          slotId: body.slotId,
          client: v.account,
          city: optionalText(body.city, 80),
          caseSummary: optionalText(body.caseSummary, 2000),
        });
        return send(res, 201, result);
      } catch (err) {
        if (err.status === 409 || /UNIQUE/i.test(err.message)) return send(res, 409, { error: err.code || 'slot-unavailable' });
        throw err;
      }
    },

    'POST /api/data/cases/request-resolution': caseAction('client', (id) => practice.requestResolution(id)),
    'POST /api/data/cases/keep-active': caseAction('lawyer', (id) => practice.keepActive(id)),
    'POST /api/data/cases/confirm-resolution': caseAction('lawyer', (id) => practice.confirmResolution(id)),

    'POST /api/data/slots': (req, res, body, v) => {
      const denied = needLawyer(v);
      if (denied) return send(res, ...denied);
      if (!isDate(body.date) || !isTime(body.startTime) || !isType(body.consultationType)) return send(res, 400, { error: 'invalid-input' });
      const slot = practice.createSlot(v.lawyerId, body);
      return slot ? send(res, 201, { slot }) : send(res, 409, { error: 'duplicate-slot' });
    },

    'POST /api/data/slots/remove': (req, res, body, v) => {
      const denied = needLawyer(v);
      if (denied) return send(res, ...denied);
      if (!ownedSlot(v, body.slotId)) return send(res, 404, { error: 'not-found' });
      return practice.removeSlot(body.slotId) ? send(res, 200, { removed: true }) : send(res, 409, { error: 'slot-booked' });
    },

    'POST /api/data/slots/mark-day-unavailable': (req, res, body, v) => {
      const denied = needLawyer(v);
      if (denied) return send(res, ...denied);
      if (!isDate(body.date)) return send(res, 400, { error: 'invalid-input' });
      return send(res, 200, { changed: practice.markDayUnavailable(v.lawyerId, body.date) });
    },

    'POST /api/data/slots/mark-available': (req, res, body, v) => {
      const denied = needLawyer(v);
      if (denied) return send(res, ...denied);
      if (!ownedSlot(v, body.slotId)) return send(res, 404, { error: 'not-found' });
      const slot = practice.markSlotAvailable(body.slotId);
      return slot ? send(res, 200, { slot }) : send(res, 409, { error: 'slot-not-unavailable' });
    },
  };

  return async function dataMiddleware(req, res) {
    const { pathname } = new URL(req.originalUrl || req.url, 'http://localhost');
    const key = `${req.method} ${pathname.replace(/\/+$/, '')}`;
    const route = routes[key];
    if (!route) return send(res, 404, { error: 'not-found' });
    if (req.method === 'POST' && !rateLimit.take(clientIp(req)).allowed) return send(res, 429, { error: 'rate-limited' });

    const { body, error } = await readJsonBody(req);
    if (error) return send(res, ...error);

    try {
      await ready;
      return route(req, res, body, viewer(req));
    } catch (err) {
      console.error(JSON.stringify({ event: 'data_error', route: key, message: err?.message }));
      return send(res, 500, { error: 'server-error' });
    }
  };
}
