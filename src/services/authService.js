// =============================================================================
// MOCK ONLY — orchestrates "create the account" once both verifications
// have succeeded. This is the single seam to swap out when a real backend
// exists: replace the body of completeRegistration() with one call to
// POST /api/auth/register and let the server hash the password, insert the
// row, and trigger the real welcome email itself.
//
// The frontend NEVER stores the password anywhere except transiently in
// this function's argument list — it is not put in React state, not put in
// AppContext, not logged. mockAuthStore is the only place it's persisted
// (as a base64 stand-in, see the warning in that file), purely so the mock
// sign-in flow has something to check against later in this prototype.
// =============================================================================

import { registerMockAccount } from './mockAuthStore.js';
import { sendWelcomeEmail } from './mockEmailService.js';

/**
 * @param {object} payload
 * @param {string} payload.firstName
 * @param {string} payload.lastName
 * @param {string} payload.phone
 * @param {string} payload.email
 * @param {string} payload.city
 * @param {string} payload.password
 * @param {'pending'|'approved'} payload.kycStatus - resolved by the KYC step
 *   before this is called; see RegisterFlow.jsx
 * @param {string} payload.welcomeSubject - pre-rendered (translated) email subject
 * @param {string} payload.welcomeBody - pre-rendered (translated) email body
 * @returns {object} safe user profile (no password) — ready for dispatch(SET_USER)
 * @throws {Error} with message 'email-in-use' if the email is already registered
 */
export async function completeRegistration({
  firstName,
  lastName,
  phone,
  email,
  city,
  password,
  kycStatus,
  welcomeSubject,
  welcomeBody,
}) {
  const profile = registerMockAccount({ firstName, lastName, phone, email, city, password, kycStatus });
  await sendWelcomeEmail({ toEmail: email, subject: welcomeSubject, body: welcomeBody });
  return profile;
}
