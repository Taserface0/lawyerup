// =============================================================================
// The browser's copy of the server data for lawyers, availability, bookings,
// cases, consultation messages and reviews (server/data/handler.js). The
// store files (mockLawyerStore, mockAvailabilityStore, mockAppointmentStore,
// mockCaseStore, mockMessageStore, mockReviewStore) keep their synchronous
// functions and read from this copy, so the screens did not have to change.
// It holds only what the server lets this visitor see.
//
// - refreshServerData() reloads it. AppContext calls it on start, after
//   sign-in/out, when the window regains focus, whenever the live-update
//   stream says something changed (connectLiveUpdates), and on a timer as a
//   fallback for when the stream can't connect.
// - mutate() applies a change locally first (the store passes the optimistic
//   update), sends it to the server, and then reloads. If the server refuses,
//   the reload puts the real state back and DATA_ERROR_EVENT listeners hear
//   about it.
// - Every change fires DATA_EVENT on window; AppContext re-renders on it.
// =============================================================================

export const DATA_EVENT = 'lawyerup:data';
export const DATA_ERROR_EVENT = 'lawyerup:data-error';

// Before the database, all of this lived in localStorage under these keys.
// The server is the source of truth now, so the old copies are removed
// (they included other people's names and phone numbers).
const LEGACY_KEYS = [
  'lawyerup_mock_appointments',
  'lawyerup_mock_cases',
  'lawyerup_mock_availability',
  'lawyerup_mock_messages',
  'lawyerup_mock_reviews',
  'lawyerup_client_profiles',
];
try {
  for (const key of LEGACY_KEYS) localStorage.removeItem(key);
} catch {
  /* storage unavailable */
}

const EMPTY = {
  approvedLawyers: [],
  openSlots: [],
  ratings: {},
  appointments: [],
  cases: [],
  mySlots: [],
  clients: [],
  messages: [],
  myReviews: [],
};
let data = { ...EMPTY };
let loaded = false;

export const serverData = () => data;
export const serverDataLoaded = () => loaded;

function emit(name, detail) {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}

/** Replaces part of the local copy (used for optimistic updates and tests). */
export function patchServerData(changes) {
  data = { ...data, ...changes };
  emit(DATA_EVENT);
}

/** Forget everything private, e.g. right after signing out. */
export function resetServerData() {
  data = { ...EMPTY, approvedLawyers: data.approvedLawyers, openSlots: data.openSlots, ratings: data.ratings };
  emit(DATA_EVENT);
}

let inFlight = null;
export function refreshServerData() {
  if (typeof fetch !== 'function') return Promise.resolve(data);
  inFlight ||= fetch('/api/data', { credentials: 'same-origin' })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`http-${res.status}`))))
    .then((next) => {
      data = { ...EMPTY, ...next };
      loaded = true;
      emit(DATA_EVENT);
      return data;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * Sends a change to the server. Resolves with the server's JSON answer;
 * rejects with Error(<server error code>) after restoring the server's state.
 */
export async function mutate(path, body) {
  let res;
  try {
    res = await fetch(`/api/data/${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    res = null;
  }
  let payload = {};
  try {
    payload = res ? await res.json() : {};
  } catch {
    /* empty body */
  }
  await refreshServerData().catch(() => {});
  if (!res || !res.ok) {
    const error = new Error(payload.error || (res ? `http-${res.status}` : 'network'));
    emit(DATA_ERROR_EVENT, { path, code: error.message });
    throw error;
  }
  return payload;
}

/** Fire-and-forget form used by the synchronous store functions; errors surface through DATA_ERROR_EVENT. */
export function mutateInBackground(path, body) {
  mutate(path, body).catch(() => {});
}

/**
 * Opens the live-update stream (Server-Sent Events, GET /api/data/events)
 * for the signed-in visitor: each "change" event reloads the data, so a new
 * message, booking or case change from the other person shows up at once,
 * on any device. EventSource reconnects by itself after a dropped connection.
 * Returns { close, isOpen }; call close() on sign-out.
 */
export function connectLiveUpdates() {
  if (typeof EventSource === 'undefined') return { close() {}, isOpen: () => false };
  const source = new EventSource('/api/data/events', { withCredentials: true });
  source.addEventListener('change', () => {
    refreshServerData().catch(() => {});
  });
  // After a reconnect, catch up on anything missed while it was down.
  source.addEventListener('open', () => {
    refreshServerData().catch(() => {});
  });
  return {
    close: () => source.close(),
    isOpen: () => source.readyState === EventSource.OPEN,
  };
}
