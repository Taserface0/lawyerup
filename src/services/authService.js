// =============================================================================
// "Create the account" once both verifications have succeeded. The server
// hashes the password and stores the account (see authApi.js); the frontend
// never keeps the password anywhere except transiently in this function's
// argument list. The welcome email is still simulated.
// =============================================================================

import { signUp } from './authApi.js';
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
 * @returns {Promise<object>} safe user profile (no password), ready for dispatch(SET_USER)
 * @throws {Error} 'email-in-use' if the email is already registered, 'network'
 *   if the server can't be reached
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
  const profile = await signUp({ firstName, lastName, phone, email, city, password, kycStatus });
  await sendWelcomeEmail({ toEmail: email, subject: welcomeSubject, body: welcomeBody });
  return profile;
}
