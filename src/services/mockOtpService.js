// =============================================================================
// MOCK ONLY — mobile OTP send/verify.
//
// This file exists purely so the frontend has a stable, backend-ready
// interface to call. It does NOT send a real SMS. The generated code is
// printed to the browser console (never rendered in the UI) and held only
// in an in-memory Map — never localStorage, never sent anywhere.
//
// WHEN A REAL BACKEND EXISTS, replace the two functions below with calls to
// your backend, e.g.:
//
//   POST /api/auth/mobile/send-otp   { phone }
//   POST /api/auth/mobile/verify-otp { phone, code }
//
// The backend endpoint would generate the code, store it server-side
// (Redis with a TTL is typical), and call an SMS provider such as MSG91,
// Twilio Verify, or AWS SNS using credentials that live ONLY on the server.
// The frontend must never hold SMS provider credentials or the raw OTP
// store — this mock's in-memory Map is a temporary stand-in for that
// server-side store, not a pattern to keep.
// =============================================================================

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;
const mockOtpStore = new Map(); // phone -> { code, expiresAt } — in-memory only

function generateMockCode() {
  return String(Math.floor(1000 + Math.random() * 9000)); // 4-digit
}

function delay(ms = 600) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendMobileOtp(phone) {
  await delay();
  const code = generateMockCode();
  mockOtpStore.set(phone, { code, expiresAt: Date.now() + OTP_TTL_MS });
   
  console.info(`[MOCK SMS] OTP for +91 ${phone}: ${code} (dev-only — never shown in the UI)`);
  return { sent: true };
}

export async function verifyMobileOtp(phone, code) {
  await delay();
  const entry = mockOtpStore.get(phone);
  if (!entry) throw new Error('not-sent');
  if (Date.now() > entry.expiresAt) {
    mockOtpStore.delete(phone);
    throw new Error('expired');
  }
  const isValid = entry.code === String(code).trim();
  if (isValid) {
    mockOtpStore.delete(phone);
    return true;
  }
  // A 4-digit code has only 9,000 possibilities, so cap wrong guesses and
  // force a fresh code after MAX_ATTEMPTS (a real OTP provider does the same).
  entry.attempts = (entry.attempts || 0) + 1;
  if (entry.attempts >= MAX_ATTEMPTS) {
    mockOtpStore.delete(phone);
    throw new Error('expired');
  }
  return false;
}
