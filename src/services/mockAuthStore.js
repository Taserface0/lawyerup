// =============================================================================
// Browser-side helpers that are left over from the mock account system.
// Accounts, passwords and sessions live on the server (see authApi.js and
// server/auth/handler.js). This file stores no password and no other
// person's data.
//
// What is still here, and why:
//  - A cached copy of the signed-in user's own profile (saveSession/
//    loadSession), so the app can render the right screen instantly on
//    reload. It is display data only; AppContext re-checks it with the server
//    (/api/auth/me), the httpOnly cookie is what actually proves who you are,
//    and it is removed on sign-out.
//  - getClientAccountByEmail(): a client's name and phone for the lawyer
//    screens, from the profiles the server sends a lawyer for their own clients.
//  - deleteClientDataLocally(): after the server deleted an account, removes
//    it from the browser's copy of the server data.
// =============================================================================

// Pulled in only for deleteClientDataLocally(). No circular import risk:
// none of these modules import anything from this file.
import { getCasesForClient, deleteCasesForClient } from './mockCaseStore.js';
import { deleteAppointmentsForClient } from './mockAppointmentStore.js';
import { deleteMessagesForCase } from './mockMessageStore.js';
import { anonymiseReviewsForClient } from './mockReviewStore.js';
import { serverData } from './serverData.js';

const SESSION_KEY = 'lawyerup_mock_session';
// The old mock account list kept base64-encoded passwords. Remove it.
const LEGACY_ACCOUNTS_KEY = 'lawyerup_mock_accounts';

try {
  localStorage.removeItem(LEGACY_ACCOUNTS_KEY);
} catch {
  /* storage unavailable */
}

const sameEmail = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** A client's display profile, for a lawyer who has been booked by them. */
export function getClientAccountByEmail(email) {
  return serverData().clients.find((p) => sameEmail(p.email, email)) || null;
}

// --- Cached copy of the signed-in profile (display only) ---

export function saveSession(userProfile) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(userProfile));
  } catch {
    // localStorage unavailable (private browsing, quota, etc.): the server
    // session still works, the first render after a reload is just signed out
    // until /api/auth/me answers.
  }
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* no-op */
  }
}

// --- Demo account (created by the server on first run) ---

export const DEMO_EMAIL = 'demo@lawyerup.in';
export const DEMO_PASSWORD = 'lawyerup123';

/**
 * Removes a deleted client from the browser's copy of the server data
 * (the server has already deleted their bookings, cases and messages, and
 * anonymised their reviews). Cases and appointments store clientId as the
 * exact email used at booking time, so the same exact value is used here.
 */
export function deleteClientDataLocally(email) {
  for (const caseRecord of getCasesForClient(email)) {
    deleteMessagesForCase(caseRecord.caseId);
  }
  deleteCasesForClient(email);
  deleteAppointmentsForClient(email);
  anonymiseReviewsForClient(email);
}
