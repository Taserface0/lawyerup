// =============================================================================
// Browser-side helpers that are left over from the mock account system.
// Accounts, passwords and sessions now live on the server (see authApi.js
// and server/auth/handler.js). This file no longer stores any password.
//
// What is still here, and why:
//  - A cached copy of the signed-in profile (saveSession/loadSession), so the
//    app can render the right screen instantly on reload. It is display data
//    only; AppContext re-checks it with the server (/api/auth/me), and the
//    httpOnly cookie is what actually proves who you are.
//  - A small directory of client profiles seen in this browser
//    (rememberClientProfile/getClientAccountByEmail). Appointments, cases and
//    messages are still browser-only until they move to the database too, and
//    the lawyer screens use this to show a client's name and phone next to
//    their bookings, exactly as before.
//  - deleteClientDataLocally(): removes that browser-only data for a client
//    when their account is deleted.
// =============================================================================

// Pulled in only for deleteClientDataLocally(). No circular import risk:
// none of these modules import anything from this file.
import { getCasesForClient, deleteCasesForClient } from './mockCaseStore.js';
import { deleteAppointmentsForClient } from './mockAppointmentStore.js';
import { deleteMessagesForCase } from './mockMessageStore.js';
import { anonymiseReviewsForClient } from './mockReviewStore.js';

const PROFILES_KEY = 'lawyerup_client_profiles';
const SESSION_KEY = 'lawyerup_mock_session';
// The old mock account list kept base64-encoded passwords. Remove it.
const LEGACY_ACCOUNTS_KEY = 'lawyerup_mock_accounts';

try {
  localStorage.removeItem(LEGACY_ACCOUNTS_KEY);
} catch {
  /* storage unavailable */
}

function readProfiles() {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeProfiles(profiles) {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  } catch {
    /* storage unavailable: lawyer screens fall back to showing the email */
  }
}

const sameEmail = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Keeps a client's display profile (no password) for the lawyer screens in this browser. */
export function rememberClientProfile(profile) {
  if (!profile?.email || profile.role !== 'client') return;
  const { id, role, firstName, lastName, name, phone, email, city, kycStatus } = profile;
  const others = readProfiles().filter((p) => !sameEmail(p.email, email));
  writeProfiles([...others, { id, role, firstName, lastName, name, phone, email, city, kycStatus }]);
}

/** The cached display profile for a client email, if this browser has seen it. */
export function getClientAccountByEmail(email) {
  return readProfiles().find((p) => sameEmail(p.email, email)) || null;
}

function forgetClientProfile(email) {
  writeProfiles(readProfiles().filter((p) => !sameEmail(p.email, email)));
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
 * Removes a client's browser-only data after their account is deleted on the
 * server: messages, then their cases, then their appointments, and their
 * reviews are anonymised. Cases and appointments store clientId as the exact
 * email used at booking time, so the same exact value is used here.
 */
export function deleteClientDataLocally(email) {
  for (const caseRecord of getCasesForClient(email)) {
    deleteMessagesForCase(caseRecord.caseId);
  }
  deleteCasesForClient(email);
  deleteAppointmentsForClient(email);
  anonymiseReviewsForClient(email);
  forgetClientProfile(email);
}
