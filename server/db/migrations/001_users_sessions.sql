-- Phase 1: client accounts and login sessions.
-- Field names mirror the profile the UI already uses (firstName, lastName,
-- name, phone, email, city, kycStatus), in snake_case.

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  role          TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'lawyer')),
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  phone         TEXT NOT NULL,
  email         TEXT NOT NULL,
  email_lower   TEXT NOT NULL UNIQUE,
  city          TEXT NOT NULL,
  kyc_status    TEXT NOT NULL DEFAULT 'pending' CHECK (kyc_status IN ('pending', 'approved')),
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

-- The cookie holds a random token; only its SHA-256 is stored here, so a
-- copy of the database cannot be used to log in.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX sessions_user_id ON sessions(user_id);
