-- Phase 3: consultation chat messages and post-closure reviews.

-- One thread per case (never per client/lawyer pair). read_at is set when
-- the other participant opens the chat, which drives the unread badges.
CREATE TABLE messages (
  id          TEXT PRIMARY KEY,
  case_id     TEXT NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
  sender_id   TEXT NOT NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('client', 'lawyer')),
  text        TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  read_at     TEXT
);
CREATE INDEX messages_case ON messages(case_id);

-- One review per appointment. No foreign keys to the client's rows on
-- purpose: when a client deletes their account the review is anonymised
-- (client fields cleared, text removed) so the lawyer's rating doesn't change.
CREATE TABLE reviews (
  review_id      TEXT PRIMARY KEY,
  appointment_id TEXT NOT NULL UNIQUE,
  case_id        TEXT NOT NULL,
  lawyer_id      INTEGER NOT NULL,
  client_user_id TEXT,
  client_id      TEXT,
  client_name    TEXT NOT NULL,
  rating         INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text    TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL
);
CREATE INDEX reviews_lawyer ON reviews(lawyer_id);
CREATE INDEX reviews_client ON reviews(client_user_id);
