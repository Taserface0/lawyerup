// Repository for accounts and sessions. Rows are returned in the shape the
// UI already uses; password hashes never leave this module except through
// getPasswordHash().

import { randomUUID } from 'node:crypto';

function toProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    role: row.role,
    firstName: row.first_name,
    lastName: row.last_name,
    name: `${row.first_name} ${row.last_name}`.trim(),
    phone: row.phone,
    email: row.email,
    city: row.city,
    kycStatus: row.kyc_status,
  };
}

export function createUserRepository(db) {
  const q = {
    byEmail: db.prepare('SELECT * FROM users WHERE email_lower = ?'),
    byId: db.prepare('SELECT * FROM users WHERE id = ?'),
    insert: db.prepare(
      `INSERT INTO users (id, role, first_name, last_name, phone, email, email_lower, city, kyc_status, password_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ),
    setKyc: db.prepare('UPDATE users SET kyc_status = ? WHERE email_lower = ?'),
    listByRole: db.prepare('SELECT * FROM users WHERE role = ? ORDER BY created_at'),
    deleteByEmail: db.prepare('DELETE FROM users WHERE email_lower = ?'),
    insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'),
    sessionUser: db.prepare(
      'SELECT users.*, sessions.expires_at AS session_expires_at FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ?'
    ),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    purgeSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
  };

  return {
    findByEmail: (email) => toProfile(q.byEmail.get(email.trim().toLowerCase())),
    findById: (id) => toProfile(q.byId.get(id)),
    getPasswordHash: (email) => q.byEmail.get(email.trim().toLowerCase())?.password_hash || null,

    /** Throws an Error with code 'email-in-use' for a duplicate email. */
    create({ role = 'client', firstName, lastName, phone, email, city, kycStatus = 'pending', passwordHash }) {
      const id = randomUUID();
      try {
        q.insert.run(id, role, firstName, lastName, phone, email.trim(), email.trim().toLowerCase(), city, kycStatus, passwordHash, new Date().toISOString());
      } catch (err) {
        if (/UNIQUE/i.test(err.message)) throw Object.assign(new Error('email-in-use'), { code: 'email-in-use' });
        throw err;
      }
      return toProfile(q.byId.get(id));
    },

    setKycStatus(email, kycStatus) {
      q.setKyc.run(kycStatus, email.trim().toLowerCase());
      return toProfile(q.byEmail.get(email.trim().toLowerCase()));
    },

    listClients: () => q.listByRole.all('client').map(toProfile),

    /** Deletes the account; its sessions go with it (ON DELETE CASCADE). */
    deleteByEmail: (email) => q.deleteByEmail.run(email.trim().toLowerCase()).changes > 0,

    createSession(tokenHash, userId, expiresAt, now) {
      q.insertSession.run(tokenHash, userId, expiresAt, now);
    },

    /** The session's user, or null when it is missing or expired (expired ones are removed). */
    userForSession(tokenHash, now) {
      const row = q.sessionUser.get(tokenHash);
      if (!row) return null;
      if (row.session_expires_at <= now) {
        q.deleteSession.run(tokenHash);
        return null;
      }
      return toProfile(row);
    },

    deleteSession: (tokenHash) => q.deleteSession.run(tokenHash),
    purgeExpiredSessions: (now) => q.purgeSessions.run(now).changes,
  };
}
