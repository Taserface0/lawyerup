// =============================================================================
// MOCK ONLY — a fake "accounts directory" and session, both in localStorage,
// so the sign-up → verify → sign-in loop can be exercised end-to-end with
// no backend at all. This is NOT a secure authentication system.
//
// -----------------------------------------------------------------------------
// WHY THIS EXISTS
// -----------------------------------------------------------------------------
// There is no database yet. To let "sign in with email + password" actually
// work across a page refresh in this prototype, something has to remember
// which (email, password) pairs were registered. That something is
// localStorage, under the keys below — never anything shared or synced.
//
// -----------------------------------------------------------------------------
// obfuscatePasswordForPrototypeOnly() IS NOT PASSWORD HASHING
// -----------------------------------------------------------------------------
// It base64-encodes the password so a plaintext string doesn't sit verbatim
// in localStorage during local development. Base64 is NOT encryption and is
// trivially reversible by anyone with dev tools open — this offers no real
// protection. It exists only to avoid the most obviously bad thing
// (plaintext-visible passwords at rest), not to be a security control.
//
// A real backend MUST hash passwords server-side with bcrypt or argon2
// (with a per-user salt), and this entire file must be deleted once that
// backend exists — the frontend should never again hold a password or a
// credential store itself.
//
// -----------------------------------------------------------------------------
// WHAT A REAL BACKEND REPLACES THIS WITH
// -----------------------------------------------------------------------------
//   POST /api/auth/register  { firstName, lastName, phone, email, city, password }
//     -> server hashes password (bcrypt/argon2), inserts user row, sends
//        verification code/link, returns created user (never the password)
//   POST /api/auth/login     { email, password }
//     -> server verifies the hash, issues a session cookie or JWT
//   Session state then lives in an httpOnly cookie or a short-lived token,
//   not in localStorage.
// =============================================================================

// Only pulled in for the DEV-ONLY cascading delete at the bottom of this
// file (deleteClientAccountCompletely). No circular import risk: none of
// these three modules import anything from this file.
import { getCasesForClient, deleteCasesForClient } from './mockCaseStore.js';
import { deleteAppointmentsForClient } from './mockAppointmentStore.js';
import { deleteMessagesForCase } from './mockMessageStore.js';
import { anonymiseReviewsForClient } from './mockReviewStore.js';

const ACCOUNTS_KEY = 'lawyerup_mock_accounts';
const SESSION_KEY = 'lawyerup_mock_session';

function obfuscatePasswordForPrototypeOnly(password) {
  try {
    return btoa(unescape(encodeURIComponent(password)));
  } catch {
    return password;
  }
}

function readAccounts() {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAccounts(accounts) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

function toSafeProfile(account) {
  // Strips the password stand-in before this ever reaches app state.
  const { passwordObfuscated, ...safe } = account; // eslint-disable-line no-unused-vars
  return safe;
}

export function emailIsRegistered(email) {
  const normalized = email.trim().toLowerCase();
  return readAccounts().some((a) => a.email.toLowerCase() === normalized);
}

/**
 * Registers a new mock account. Throws { code: 'email-in-use' } if the
 * email is already registered. Returns the safe profile (no password).
 *
 * kycStatus starts 'pending' and is expected to be flipped to 'approved'
 * by the caller (see RegisterFlow's KYC step) before the success screen —
 * see updateKycStatus() below, which is how that flip is persisted.
 */
export function registerMockAccount({ firstName, lastName, phone, email, city, password, kycStatus = 'pending' }) {
  const accounts = readAccounts();
  const normalized = email.trim().toLowerCase();
  if (accounts.some((a) => a.email.toLowerCase() === normalized)) {
    throw new Error('email-in-use');
  }
  const account = {
    role: 'client',
    firstName,
    lastName,
    name: `${firstName} ${lastName}`.trim(),
    phone,
    email: email.trim(),
    city,
    kycStatus,
    passwordObfuscated: obfuscatePasswordForPrototypeOnly(password),
  };
  accounts.push(account);
  writeAccounts(accounts);
  return toSafeProfile(account);
}

/** Admin / KYC-step use: updates a client account's kycStatus in place. */
export function updateKycStatus(email, kycStatus) {
  const accounts = readAccounts();
  const normalized = email.trim().toLowerCase();
  const idx = accounts.findIndex((a) => a.email.toLowerCase() === normalized);
  if (idx === -1) return null;
  accounts[idx] = { ...accounts[idx], kycStatus };
  writeAccounts(accounts);
  return toSafeProfile(accounts[idx]);
}

/** Admin: full client account list (no passwords), for the review page. */
export function getAllClientAccounts() {
  return readAccounts().map(toSafeProfile);
}

/** Re-reads and returns the latest safe profile for a given email, if any. */
export function getClientAccountByEmail(email) {
  const normalized = email.trim().toLowerCase();
  const account = readAccounts().find((a) => a.email.toLowerCase() === normalized);
  return account ? toSafeProfile(account) : null;
}

/**
 * Returns the safe profile if email+password match a registered mock
 * account, otherwise null. Never throws on a bad password — that's a
 * normal "wrong credentials" case for the caller to handle.
 */
export function verifyMockCredentials(email, password) {
  const normalized = email.trim().toLowerCase();
  const account = readAccounts().find((a) => a.email.toLowerCase() === normalized);
  if (!account) return null;
  const matches = account.passwordObfuscated === obfuscatePasswordForPrototypeOnly(password);
  return matches ? toSafeProfile(account) : null;
}

// --- Session persistence (safe profile fields only — never the password) ---

export function saveSession(userProfile) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(userProfile));
  } catch {
    // localStorage unavailable (private browsing, quota, etc.) — the app
    // still works for the current tab session, it just won't survive a
    // refresh. Not worth surfacing to the user for a prototype.
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

// --- Demo account seeding, so there's something to sign in with immediately ---

export const DEMO_EMAIL = 'demo@lawyerup.in';
export const DEMO_PASSWORD = 'lawyerup123';

export function seedDemoAccountIfMissing() {
  if (!emailIsRegistered(DEMO_EMAIL)) {
    try {
      registerMockAccount({
        firstName: 'Prasanth',
        lastName: 'Kumar',
        phone: '9876543210',
        email: DEMO_EMAIL,
        city: 'Bengaluru',
        password: DEMO_PASSWORD,
        kycStatus: 'approved',
      });
    } catch {
      /* already exists — fine */
    }
  }
}

/**
 * DEV-ONLY: removes one client account row only. Exported mainly so
 * deleteClientAccountCompletely() below has something to call, but kept
 * as its own small function (matching the pattern of every other store's
 * new delete primitive) rather than inlined, in case it's ever useful on
 * its own. Prefer deleteClientAccountCompletely() from a UI — calling
 * this alone would silently leave that client's appointments/cases/
 * messages behind with no owner.
 */
function deleteClientAccount(email) {
  const accounts = readAccounts();
  const normalized = email.trim().toLowerCase();
  const remaining = accounts.filter((a) => a.email.toLowerCase() !== normalized);
  writeAccounts(remaining);
}

/**
 * DEV-ONLY: the real "delete this test account" operation used by
 * AdminScreen.jsx. Cascades in dependency order — messages, then their
 * cases, then that client's appointments, then the account row itself —
 * so nothing is ever left referencing a caseId/clientId that no longer
 * exists. Every step below filters on the exact `email` passed in; it
 * never touches any other client's rows, the seeded demo lawyer account
 * (a completely separate table — mockLawyerStore.js's
 * lawyerup_mock_lawyer_applications — that this function never reads
 * from), or the static marketplace data in data/lawyers.js (a hardcoded
 * JS module, not localStorage at all).
 *
 * ARCHITECTURE NOTE FOR THE FUTURE BACKEND MIGRATION: this whole cascade
 * exists only because the prototype uses a client's EMAIL as the foreign
 * key linking accounts/appointments/cases (see `clientId` fields
 * throughout mockAppointmentStore.js and mockCaseStore.js). A real backend
 * should use a stable, immutable user ID instead — an email can change,
 * be reused, or be entered inconsistently, none of which a numeric/UUID
 * primary key has to worry about. That's a data-model decision for the
 * backend migration, not something to rework in this prototype now.
 */
export function deleteClientAccountCompletely(email) {
  // Cases/appointments store clientId as the exact email string used when
  // they were created (see BookingCheckoutModal.jsx passing user.email
  // directly), and getAppointmentsForClient()/getCasesForClient() already
  // match that with a case-sensitive === — so this cascade must use that
  // same exact value too, not a lowercased one, or matching rows would be
  // silently skipped and left behind.
  const casesToDelete = getCasesForClient(email);
  for (const caseRecord of casesToDelete) {
    deleteMessagesForCase(caseRecord.caseId);
  }
  deleteCasesForClient(email);
  deleteAppointmentsForClient(email);
  anonymiseReviewsForClient(email);
  // Only the account row lookup itself is case-insensitive, matching
  // verifyMockCredentials()/updateKycStatus()'s existing convention.
  deleteClientAccount(email);
}
