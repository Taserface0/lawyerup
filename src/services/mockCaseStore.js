// =============================================================================
// MOCK ONLY — Case/Consultation data model.
//
// A Case is deliberately a SEPARATE record from an Appointment (not the
// same table, not merged into one object) — see the header comment in
// mockAppointmentStore.js and mockMessageStore.js for why: a client may
// need multiple appointments/matters with the same lawyer over time, and
// each one gets its own case with its OWN chat thread. Nothing in this
// file (or the chat store) ever assumes "one client + one lawyer = one
// permanent conversation."
//
// Same global-localStorage-key pattern as the other mock stores, same
// reasoning: a real backend replaces this with a `cases` table.
// =============================================================================

export const CASES_STORAGE_KEY = 'lawyerup_mock_cases';

export const CASE_STATUS = {
  ACTIVE: 'ACTIVE',
  CLIENT_REQUESTED_RESOLUTION: 'CLIENT_REQUESTED_RESOLUTION',
  LAWYER_REQUESTED_RESOLUTION: 'LAWYER_REQUESTED_RESOLUTION',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
};

function readCases() {
  try {
    const raw = localStorage.getItem(CASES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeCases(list) {
  localStorage.setItem(CASES_STORAGE_KEY, JSON.stringify(list));
}

/**
 * Creates a new case for a just-created appointment. Called once, right
 * after createAppointment() succeeds — see the booking flow in
 * BookingCheckoutModal.jsx.
 */
export function createCaseForAppointment(appointment, overrides = {}) {
  const cases = readCases();
  const newCase = {
    caseId: `case_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    // max + 1, not length + 1: once a deleted account's cases are removed,
    // length + 1 can hand out a number that is already in use.
    caseNumber: cases.reduce((max, c) => Math.max(max, c.caseNumber || 0), 0) + 1, // display-only, e.g. "Case #003"
    appointmentId: appointment.appointmentId,
    clientId: appointment.clientId,
    lawyerId: appointment.lawyerId,
    lawyerName: appointment.lawyerName,
    categorySlug: appointment.categorySlug,
    consultationType: appointment.consultationType,
    status: CASE_STATUS.ACTIVE, // demo-seed overrides below
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    clientResolutionRequestedAt: null,
    lawyerConfirmedResolutionAt: null,
    ...overrides, // status/createdAt/resolvedAt overrides — used only by demo-data seeding
  };
  cases.push(newCase);
  writeCases(cases);
  return newCase;
}

export function getCasesForClient(clientId) {
  return readCases()
    .filter((c) => c.clientId === clientId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function getCasesForLawyer(lawyerId) {
  return readCases()
    .filter((c) => c.lawyerId === lawyerId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function getCaseById(caseId) {
  return readCases().find((c) => c.caseId === caseId) || null;
}

export function getCaseByAppointmentId(appointmentId) {
  return readCases().find((c) => c.appointmentId === appointmentId) || null;
}

export function updateCaseStatus(caseId, status) {
  const cases = readCases();
  const idx = cases.findIndex((c) => c.caseId === caseId);
  if (idx === -1) return null;
  cases[idx] = {
    ...cases[idx],
    status,
    resolvedAt: status === CASE_STATUS.CLOSED ? new Date().toISOString() : cases[idx].resolvedAt,
  };
  writeCases(cases);
  return cases[idx];
}

// =============================================================================
// CASE RESOLUTION WORKFLOW
//
// Lifecycle:
//
//   ACTIVE --(client requests)--> CLIENT_REQUESTED_RESOLUTION
//                                        |
//                        +---------------+---------------+
//                        |                               |
//              (lawyer keeps active)           (lawyer confirms)
//                        |                               |
//                        v                               v
//                     ACTIVE                          CLOSED
//
// CLOSED is terminal — there is no "reopen" function anywhere in this
// file. A closed case stays closed forever; if the client needs more
// legal help, that's a brand new appointment -> brand new case (see
// createCaseForAppointment above), never a reopened old one.
//
// Each function below is a narrow, single-purpose state transition rather
// than a generic setter, so each can enforce exactly which transitions are
// valid — e.g. requestCaseResolution() silently no-ops (returns the
// unchanged case) if called on anything other than an ACTIVE case, which
// is the data-layer backstop for "the client should NOT be able to submit
// the same request repeatedly" — the UI already hides the button once the
// status changes, this just means a stale/duplicate request from a
// leftover open tab can't corrupt the record either.
// =============================================================================

/** Client-initiated: requests resolution. No-op if the case isn't ACTIVE. */
export function requestCaseResolution(caseId) {
  const cases = readCases();
  const idx = cases.findIndex((c) => c.caseId === caseId);
  if (idx === -1) return null;
  if (cases[idx].status !== CASE_STATUS.ACTIVE) return cases[idx];
  cases[idx] = {
    ...cases[idx],
    status: CASE_STATUS.CLIENT_REQUESTED_RESOLUTION,
    clientResolutionRequestedAt: new Date().toISOString(),
  };
  writeCases(cases);
  return cases[idx];
}

/**
 * Lawyer-initiated: declines the resolution request, returning the case
 * to ACTIVE. Clears the pending request timestamp so a later fresh
 * request isn't confused with this declined one. No-op unless the case is
 * currently awaiting confirmation.
 */
export function keepCaseActive(caseId) {
  const cases = readCases();
  const idx = cases.findIndex((c) => c.caseId === caseId);
  if (idx === -1) return null;
  if (cases[idx].status !== CASE_STATUS.CLIENT_REQUESTED_RESOLUTION) return cases[idx];
  cases[idx] = {
    ...cases[idx],
    status: CASE_STATUS.ACTIVE,
    clientResolutionRequestedAt: null,
  };
  writeCases(cases);
  return cases[idx];
}

/**
 * Lawyer-initiated: confirms resolution and closes the case permanently.
 * The closed record ends up with both confirmation timestamps —
 * clientResolutionRequestedAt (set earlier by requestCaseResolution) and
 * lawyerConfirmedResolutionAt (set here) — plus resolvedAt as the single
 * "when this case actually closed" timestamp. No-op unless the case is
 * currently awaiting confirmation.
 */
export function confirmCaseResolution(caseId) {
  const cases = readCases();
  const idx = cases.findIndex((c) => c.caseId === caseId);
  if (idx === -1) return null;
  if (cases[idx].status !== CASE_STATUS.CLIENT_REQUESTED_RESOLUTION) return cases[idx];
  const now = new Date().toISOString();
  cases[idx] = {
    ...cases[idx],
    status: CASE_STATUS.CLOSED,
    lawyerConfirmedResolutionAt: now,
    resolvedAt: now,
  };
  writeCases(cases);
  return cases[idx];
}

/**
 * DEV-ONLY: deletes every case belonging to one client (matched by exact
 * clientId — never a prefix/partial match), returning the deleted case
 * ids so the caller can also clean up their messages first. Used by
 * mockAuthStore.js's deleteClientDataLocally() — always call
 * deleteMessagesForCase() for each returned id BEFORE this runs, and
 * always call this BEFORE deleting the client's appointments/account, so
 * nothing is ever left referencing a caseId or clientId that no longer
 * has an owner.
 */
export function deleteCasesForClient(clientId) {
  const cases = readCases();
  const toDelete = cases.filter((c) => c.clientId === clientId);
  const remaining = cases.filter((c) => c.clientId !== clientId);
  writeCases(remaining);
  return toDelete.map((c) => c.caseId);
}
