// =============================================================================
// MOCK ONLY — email verification code + the post-signup welcome email.
//
// Nothing here sends a real email. Verification codes and the welcome
// email's rendered content are printed to the browser console so the full
// flow can be exercised locally. In-memory storage only — never
// localStorage, never sent anywhere.
//
// WHEN A REAL BACKEND EXISTS, replace this with:
//
//   POST /api/auth/email/send-otp    { email }
//   POST /api/auth/email/verify-otp  { email, code }
//   (server-triggered, not called from the frontend) sendWelcomeEmail(user)
//
// The backend would generate the code (or a signed verification-link
// token) server-side, store it with a TTL, and send it via a transactional
// email provider (SES, Postmark, SendGrid, etc.) using credentials that
// live ONLY on the server. It could equally send a secure link instead of
// an OTP — both are valid; this mock uses OTP for UI symmetry with the
// mobile step.
// =============================================================================

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;
const mockOtpStore = new Map(); // email -> { code, expiresAt } — in-memory only

function generateMockCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function delay(ms = 700) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendEmailOtp(email) {
  await delay();
  const code = generateMockCode();
  mockOtpStore.set(email, { code, expiresAt: Date.now() + OTP_TTL_MS });
   
  console.info(`[MOCK EMAIL] Verification code for ${email}: ${code} (dev-only — never shown in the UI)`);
  return { sent: true };
}

export async function verifyEmailOtp(email, code) {
  await delay();
  const entry = mockOtpStore.get(email);
  if (!entry) throw new Error('not-sent');
  if (Date.now() > entry.expiresAt) {
    mockOtpStore.delete(email);
    throw new Error('expired');
  }
  const isValid = entry.code === String(code).trim();
  if (isValid) {
    mockOtpStore.delete(email);
    return true;
  }
  // A 4-digit code has only 9,000 possibilities, so cap wrong guesses and
  // force a fresh code after MAX_ATTEMPTS (a real OTP provider does the same).
  entry.attempts = (entry.attempts || 0) + 1;
  if (entry.attempts >= MAX_ATTEMPTS) {
    mockOtpStore.delete(email);
    throw new Error('expired');
  }
  return false;
}

/**
 * Simulates the backend sending the post-registration welcome email.
 * Real implementation: triggered server-side right after the account row
 * is created, via SES/Postmark/SendGrid — never called from the browser.
 */
export async function sendWelcomeEmail({ toEmail, subject, body }) {
  await delay(300);
   
  console.info(`[MOCK EMAIL] Welcome email queued for ${toEmail}\nSubject: ${subject}\n\n${body}`);
  return { sent: true };
}
