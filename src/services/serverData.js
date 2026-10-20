// =============================================================================
// The browser's copy of the server data for lawyers, availability, bookings
// and cases (server/data/handler.js). The stores (mockLawyerStore,
// mockAvailabilityStore, mockAppointmentStore, mockCaseStore) keep their
// synchronous functions and read from this copy, so the screens did not have
// to change. It holds only what the server lets this visitor see.
//
// - refreshServerData() reloads it; AppContext calls it on start, after
//   sign-in/out, when the window regains focus and every few seconds, so a
//   booking made in another browser shows up without a reload.
// - mutate() applies a change locally first (the store passes the optimistic
//   update), sends it to the server, and then reloads. If the server refuses,
//   the reload puts the real state back and onServerDataError listeners hear
//   about it.
// - Every change fires DATA_EVENT on window; AppContext re-renders on it.
// =============================================================================

export const DATA_EVENT = 'lawyerup:data';
export const DATA_ERROR_EVENT = 'lawyerup:data-error';

const EMPTY = { approvedLawyers: [], openSlots: [], appointments: [], cases: [], mySlots: [], clients: [] };
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
  data = { ...EMPTY, approvedLawyers: data.approvedLawyers, openSlots: data.openSlots };
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
