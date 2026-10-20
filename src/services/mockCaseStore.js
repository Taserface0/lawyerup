// =============================================================================
// Case/Consultation records. Stored in the server database since Phase 2;
// this module reads the browser's copy in serverData.js (only this visitor's
// own cases) and sends the resolution steps to the server, which enforces
// who may make each one.
//
// A Case is deliberately a SEPARATE record from an Appointment (not the
// same table, not merged into one object): a client may need multiple
// appointments/matters with the same lawyer over time, and each one gets its
// own case with its OWN chat thread. Nothing in this file (or the chat store)
// ever assumes "one client + one lawyer = one permanent conversation."
// Cases are created by the server together with their appointment (see
// bookSlot() in mockAppointmentStore.js).
// =============================================================================

import { serverData, patchServerData, mutateInBackground } from './serverData.js';

// Screens listen for this key in `storage` events to refresh case views.
export const CASES_STORAGE_KEY = 'lawyerup_mock_cases';

export const CASE_STATUS = {
  ACTIVE: 'ACTIVE',
  CLIENT_REQUESTED_RESOLUTION: 'CLIENT_REQUESTED_RESOLUTION',
  LAWYER_REQUESTED_RESOLUTION: 'LAWYER_REQUESTED_RESOLUTION',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
};

const newestFirst = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);

export function getCasesForClient(clientId) {
  return serverData()
    .cases.filter((c) => c.clientId === clientId)
    .sort(newestFirst);
}

export function getCasesForLawyer(lawyerId) {
  return serverData()
    .cases.filter((c) => c.lawyerId === lawyerId)
    .sort(newestFirst);
}

export function getCaseById(caseId) {
  return serverData().cases.find((c) => c.caseId === caseId) || null;
}

export function getCaseByAppointmentId(appointmentId) {
  return serverData().cases.find((c) => c.appointmentId === appointmentId) || null;
}

// =============================================================================
// CASE RESOLUTION WORKFLOW
//
//   ACTIVE --(client requests)--> CLIENT_REQUESTED_RESOLUTION
//                                        |
//                        +---------------+---------------+
//                        |                               |
//              (lawyer keeps active)           (lawyer confirms)
//                        v                               v
//                     ACTIVE                          CLOSED
//
// CLOSED is terminal; more help means a new appointment and a new case.
// The server applies the same rules (server/db/practice.js) and also checks
// that the client or lawyer is the one on the case. Each function updates the
// browser's copy right away and returns it; the server's answer then
// replaces it (and puts it back if the server refused).
// =============================================================================

/** Applies `change` locally if the case is in `from` status, then sends `path` to the server. */
function transition(caseId, from, change, path) {
  const current = getCaseById(caseId);
  if (!current) return null;
  if (current.status !== from) return current; // stale or duplicate request: no-op, like before
  const updated = { ...current, ...change };
  patchServerData({ cases: serverData().cases.map((c) => (c.caseId === caseId ? updated : c)) });
  mutateInBackground(path, { caseId });
  return updated;
}

/** Client-initiated: requests resolution. No-op if the case isn't ACTIVE. */
export function requestCaseResolution(caseId) {
  return transition(
    caseId,
    CASE_STATUS.ACTIVE,
    { status: CASE_STATUS.CLIENT_REQUESTED_RESOLUTION, clientResolutionRequestedAt: new Date().toISOString() },
    'cases/request-resolution'
  );
}

/** Lawyer-initiated: declines the request, back to ACTIVE. No-op unless awaiting confirmation. */
export function keepCaseActive(caseId) {
  return transition(
    caseId,
    CASE_STATUS.CLIENT_REQUESTED_RESOLUTION,
    { status: CASE_STATUS.ACTIVE, clientResolutionRequestedAt: null },
    'cases/keep-active'
  );
}

/** Lawyer-initiated: confirms resolution and closes the case permanently. No-op unless awaiting confirmation. */
export function confirmCaseResolution(caseId) {
  const now = new Date().toISOString();
  return transition(
    caseId,
    CASE_STATUS.CLIENT_REQUESTED_RESOLUTION,
    { status: CASE_STATUS.CLOSED, lawyerConfirmedResolutionAt: now, resolvedAt: now },
    'cases/confirm-resolution'
  );
}

/**
 * Drops one client's cases from the browser's copy after the server deleted
 * their account, returning the case ids so their (still browser-only)
 * messages can be removed too. Used by mockAuthStore.js's
 * deleteClientDataLocally().
 */
export function deleteCasesForClient(clientId) {
  const toDelete = serverData().cases.filter((c) => c.clientId === clientId);
  patchServerData({ cases: serverData().cases.filter((c) => c.clientId !== clientId) });
  return toDelete.map((c) => c.caseId);
}
