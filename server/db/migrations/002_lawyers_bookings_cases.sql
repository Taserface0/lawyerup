-- Phase 2: lawyer profiles, availability slots, appointments and cases.
-- Field names mirror the records the UI already uses, in snake_case.
-- Lists (practice areas, courts) and the document file names are JSON text.

-- A lawyer is a users row with role 'lawyer' plus this profile. lawyer_id is
-- the number the marketplace, slots and bookings use (1-8 are the static
-- listing in src/data/lawyers.js; new applications start above 1000).
CREATE TABLE lawyer_profiles (
  lawyer_id           INTEGER PRIMARY KEY,
  user_id             TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  display_name        TEXT,
  bar_council_id      TEXT NOT NULL,
  bar_council_state   TEXT NOT NULL,
  years_of_experience INTEGER NOT NULL,
  practice_areas      TEXT NOT NULL,
  consultation_fee    INTEGER NOT NULL,
  courts              TEXT NOT NULL,
  langs               TEXT NOT NULL,
  bio                 TEXT NOT NULL,
  documents           TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'approved', 'rejected')),
  rejection_reason    TEXT,
  submitted_at        TEXT NOT NULL
);

-- A lawyer's offer of time. The same lawyer can't offer the same date,
-- time and consultation type twice.
CREATE TABLE availability_slots (
  id                TEXT PRIMARY KEY,
  lawyer_id         INTEGER NOT NULL,
  date              TEXT NOT NULL,
  start_time        TEXT NOT NULL,
  consultation_type TEXT NOT NULL CHECK (consultation_type IN ('online', 'in_person')),
  status            TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'BOOKED', 'UNAVAILABLE')),
  appointment_id    TEXT,
  created_at        TEXT NOT NULL,
  UNIQUE (lawyer_id, date, start_time, consultation_type)
);
CREATE INDEX availability_slots_lawyer ON availability_slots(lawyer_id);

-- A booking. slot_id is UNIQUE, so the database itself refuses a second
-- appointment for the same slot, whatever the application code does.
CREATE TABLE appointments (
  appointment_id    TEXT PRIMARY KEY,
  slot_id           TEXT UNIQUE,
  client_user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id         TEXT NOT NULL,
  lawyer_id         INTEGER NOT NULL,
  lawyer_name       TEXT NOT NULL,
  category_slug     TEXT,
  consultation_type TEXT NOT NULL,
  date              TEXT NOT NULL,
  time              TEXT NOT NULL,
  city              TEXT,
  fee               INTEGER NOT NULL,
  platform_fee      INTEGER NOT NULL,
  case_summary      TEXT,
  status            TEXT NOT NULL CHECK (status IN ('REQUESTED', 'CONFIRMED', 'UPCOMING', 'ACTIVE', 'COMPLETED', 'CANCELLED')),
  created_at        TEXT NOT NULL
);
CREATE INDEX appointments_client ON appointments(client_user_id);
CREATE INDEX appointments_lawyer ON appointments(lawyer_id);

-- The ongoing matter for one appointment: a separate record on purpose
-- (see src/services/mockCaseStore.js).
CREATE TABLE cases (
  case_id                         TEXT PRIMARY KEY,
  case_number                     INTEGER NOT NULL UNIQUE,
  appointment_id                  TEXT NOT NULL UNIQUE REFERENCES appointments(appointment_id) ON DELETE CASCADE,
  client_user_id                  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id                       TEXT NOT NULL,
  lawyer_id                       INTEGER NOT NULL,
  lawyer_name                     TEXT NOT NULL,
  category_slug                   TEXT,
  consultation_type               TEXT NOT NULL,
  status                          TEXT NOT NULL CHECK (status IN ('ACTIVE', 'CLIENT_REQUESTED_RESOLUTION', 'LAWYER_REQUESTED_RESOLUTION', 'RESOLVED', 'CLOSED')),
  created_at                      TEXT NOT NULL,
  resolved_at                     TEXT,
  client_resolution_requested_at  TEXT,
  lawyer_confirmed_resolution_at  TEXT
);
CREATE INDEX cases_client ON cases(client_user_id);
CREATE INDEX cases_lawyer ON cases(lawyer_id);
