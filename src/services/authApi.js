// =============================================================================
// Client and lawyer accounts and login, backed by the server (server/auth/handler.js)
// and its database. The browser never stores a password; the session is an
// httpOnly cookie the page cannot read.
//
// Every function returns a Promise. Failures throw an Error whose message is
// the server's error code ('invalid-credentials', 'email-in-use',
// 'not-signed-in', ...) or 'network' when the server can't be reached.
// =============================================================================

async function request(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('network');
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* empty or non-JSON body */
  }
  if (!res.ok) throw Object.assign(new Error(data.error || `http-${res.status}`), { status: res.status });
  return data;
}

/** @returns {Promise<object>} the new user's profile; the user is signed in afterwards. */
export async function signUp({ firstName, lastName, phone, email, city, password, kycStatus }) {
  return (await request('/api/auth/signup', { method: 'POST', body: { firstName, lastName, phone, email, city, password, kycStatus } })).user;
}

/**
 * Submits a lawyer application (status 'submitted'); the lawyer is signed in afterwards.
 * @returns {Promise<object>} the lawyer's application profile (id is the numeric lawyer id)
 */
export async function lawyerSignUp(application) {
  return (await request('/api/auth/lawyer-signup', { method: 'POST', body: application })).user;
}

/**
 * @param {'client'|'lawyer'} [role] which sign-in form is used; the other kind of account is refused
 * @returns {Promise<object>} the profile; throws 'invalid-credentials' on a wrong email or password.
 */
export async function signIn(email, password, role = 'client') {
  return (await request('/api/auth/login', { method: 'POST', body: { email, password, role } })).user;
}

export async function signOut() {
  await request('/api/auth/logout', { method: 'POST', body: {} });
}

/** @returns {Promise<object|null>} the signed-in user, or null when not signed in. */
export async function fetchCurrentUser() {
  return (await request('/api/auth/me')).user || null;
}

export async function deleteMyAccount() {
  await request('/api/auth/me', { method: 'DELETE' });
}

export async function isEmailAvailable(email) {
  return (await request('/api/auth/email-available', { method: 'POST', body: { email: email.trim() } })).available;
}

// --- Mock admin console only (dev builds / VITE_ENABLE_MOCK_ADMIN) ---------

export async function adminListClients() {
  return (await request('/api/auth/admin/clients')).clients;
}

export async function adminSetKycStatus(email, kycStatus) {
  return (await request('/api/auth/admin/kyc', { method: 'POST', body: { email, kycStatus } })).user;
}

export async function adminDeleteClient(email) {
  await request('/api/auth/admin/delete', { method: 'POST', body: { email } });
}

export async function adminListLawyers() {
  return (await request('/api/auth/admin/lawyers')).lawyers;
}

export async function adminSetLawyerStatus(id, status, rejectionReason = null) {
  return (await request('/api/auth/admin/lawyer-status', { method: 'POST', body: { id, status, rejectionReason } })).lawyer;
}
