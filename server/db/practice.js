// Repository for lawyer profiles, availability slots, appointments and
// cases. Records are returned in the exact shapes the UI's stores use
// (camelCase, same field names), so the browser code does not change shape.
//
// Every function here trusts its arguments; who may call what is decided in
// server/data/handler.js from the session.

import { randomUUID } from 'node:crypto';
import { LAWYERS } from '../../src/data/lawyers.js';

export const SLOT_STATUS = { AVAILABLE: 'AVAILABLE', BOOKED: 'BOOKED', UNAVAILABLE: 'UNAVAILABLE' };
export const CASE_STATUS = {
  ACTIVE: 'ACTIVE',
  CLIENT_REQUESTED_RESOLUTION: 'CLIENT_REQUESTED_RESOLUTION',
  CLOSED: 'CLOSED',
};
export const PLATFORM_FEE = 49;
const FIRST_APPLICATION_ID = 1001; // 1-8 belong to the static marketplace listing

const json = (value) => JSON.stringify(value ?? null);
const parse = (text, fallback) => {
  try {
    return JSON.parse(text) ?? fallback;
  } catch {
    return fallback;
  }
};

/**
 * Slot times are wall-clock times in India (IST, UTC+5:30), whatever time
 * zone the server runs in, so "is this slot in the past?" gives the same
 * answer in Docker (UTC) as on a laptop in India.
 */
export function slotStartsAt(date, startTime) {
  const [y, m, d] = String(date).split('-').map(Number);
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(startTime).trim());
  let hour = 0;
  let minute = 0;
  if (match) {
    hour = (parseInt(match[1], 10) % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0);
    minute = parseInt(match[2], 10);
  }
  return Date.UTC(y, m - 1, d, hour, minute) - 330 * 60 * 1000;
}

/** "14 Jul 2026", the format appointment records have always used. */
export function formatRecordDate(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function toLawyerProfile(row) {
  if (!row) return null;
  return {
    id: row.lawyer_id,
    role: 'lawyer',
    firstName: row.first_name,
    lastName: row.last_name,
    name: row.display_name || `${row.first_name} ${row.last_name}`.trim(),
    phone: row.phone,
    email: row.email,
    city: row.city,
    barCouncilId: row.bar_council_id,
    barCouncilState: row.bar_council_state,
    yearsOfExperience: row.years_of_experience,
    practiceAreas: parse(row.practice_areas, []),
    consultationFee: row.consultation_fee,
    courts: parse(row.courts, []),
    langs: row.langs,
    bio: row.bio,
    documents: parse(row.documents, {}),
    status: row.status,
    rejectionReason: row.rejection_reason,
    submittedAt: row.submitted_at,
  };
}

// Only what the marketplace shows: no email, phone or documents.
function toPublicListing(profile) {
  const { id, name, city, practiceAreas, langs, yearsOfExperience, consultationFee, barCouncilId, bio, courts } = profile;
  return { id, name, city, practiceAreas, langs, yearsOfExperience, consultationFee, barCouncilId, bio, courts };
}

const toSlot = (row) =>
  row && {
    id: row.id,
    lawyerId: row.lawyer_id,
    date: row.date,
    startTime: row.start_time,
    consultationType: row.consultation_type,
    status: row.status,
    appointmentId: row.appointment_id,
    createdAt: row.created_at,
  };

const toAppointment = (row) =>
  row && {
    appointmentId: row.appointment_id,
    clientId: row.client_id,
    lawyerId: row.lawyer_id,
    lawyerName: row.lawyer_name,
    categorySlug: row.category_slug,
    consultationType: row.consultation_type,
    date: row.date,
    time: row.time,
    city: row.city,
    fee: row.fee,
    platformFee: row.platform_fee,
    caseSummary: row.case_summary,
    status: row.status,
    createdAt: row.created_at,
  };

const toCase = (row) =>
  row && {
    caseId: row.case_id,
    caseNumber: row.case_number,
    appointmentId: row.appointment_id,
    clientId: row.client_id,
    lawyerId: row.lawyer_id,
    lawyerName: row.lawyer_name,
    categorySlug: row.category_slug,
    consultationType: row.consultation_type,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    clientResolutionRequestedAt: row.client_resolution_requested_at,
    lawyerConfirmedResolutionAt: row.lawyer_confirmed_resolution_at,
  };

/** Runs fn inside BEGIN IMMEDIATE ... COMMIT (ROLLBACK if it throws). */
function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

const fail = (code, status) => Object.assign(new Error(code), { code, status });

export function createPracticeRepository(db, { now = Date.now } = {}) {
  const PROFILE_SELECT = 'SELECT lawyer_profiles.*, users.first_name, users.last_name, users.phone, users.email, users.city FROM lawyer_profiles JOIN users ON users.id = lawyer_profiles.user_id';
  const q = {
    profileByUser: db.prepare(`${PROFILE_SELECT} WHERE lawyer_profiles.user_id = ?`),
    profileById: db.prepare(`${PROFILE_SELECT} WHERE lawyer_profiles.lawyer_id = ?`),
    allProfiles: db.prepare(`${PROFILE_SELECT} ORDER BY lawyer_profiles.submitted_at`),
    approvedProfiles: db.prepare(`${PROFILE_SELECT} WHERE lawyer_profiles.status = 'approved' ORDER BY lawyer_profiles.lawyer_id`),
    nextLawyerId: db.prepare('SELECT MAX(lawyer_id) AS max FROM lawyer_profiles'),
    insertProfile: db.prepare(
      `INSERT INTO lawyer_profiles (lawyer_id, user_id, display_name, bar_council_id, bar_council_state, years_of_experience, practice_areas,
         consultation_fee, courts, langs, bio, documents, status, rejection_reason, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`
    ),
    setProfileStatus: db.prepare('UPDATE lawyer_profiles SET status = ?, rejection_reason = ? WHERE lawyer_id = ?'),

    slotById: db.prepare('SELECT * FROM availability_slots WHERE id = ?'),
    slotsForLawyer: db.prepare('SELECT * FROM availability_slots WHERE lawyer_id = ?'),
    availableSlots: db.prepare("SELECT * FROM availability_slots WHERE status = 'AVAILABLE'"),
    insertSlot: db.prepare(
      "INSERT INTO availability_slots (id, lawyer_id, date, start_time, consultation_type, status, appointment_id, created_at) VALUES (?, ?, ?, ?, ?, 'AVAILABLE', NULL, ?)"
    ),
    deleteSlot: db.prepare("DELETE FROM availability_slots WHERE id = ? AND status != 'BOOKED'"),
    markDayUnavailable: db.prepare("UPDATE availability_slots SET status = 'UNAVAILABLE' WHERE lawyer_id = ? AND date = ? AND status = 'AVAILABLE'"),
    markSlotAvailable: db.prepare("UPDATE availability_slots SET status = 'AVAILABLE' WHERE id = ? AND status = 'UNAVAILABLE'"),
    claimSlot: db.prepare("UPDATE availability_slots SET status = 'BOOKED', appointment_id = ? WHERE id = ? AND status = 'AVAILABLE'"),
    releaseSlotsForClient: db.prepare(
      "UPDATE availability_slots SET status = 'AVAILABLE', appointment_id = NULL WHERE appointment_id IN (SELECT appointment_id FROM appointments WHERE client_user_id = ?)"
    ),

    insertAppointment: db.prepare(
      `INSERT INTO appointments (appointment_id, slot_id, client_user_id, client_id, lawyer_id, lawyer_name, category_slug, consultation_type,
         date, time, city, fee, platform_fee, case_summary, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ),
    appointmentsForClient: db.prepare('SELECT * FROM appointments WHERE client_user_id = ? ORDER BY created_at DESC'),
    appointmentsForLawyer: db.prepare('SELECT * FROM appointments WHERE lawyer_id = ? ORDER BY created_at DESC'),

    nextCaseNumber: db.prepare('SELECT COALESCE(MAX(case_number), 0) + 1 AS next FROM cases'),
    insertCase: db.prepare(
      `INSERT INTO cases (case_id, case_number, appointment_id, client_user_id, client_id, lawyer_id, lawyer_name, category_slug, consultation_type,
         status, created_at, resolved_at, client_resolution_requested_at, lawyer_confirmed_resolution_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`
    ),
    caseById: db.prepare('SELECT * FROM cases WHERE case_id = ?'),
    casesForClient: db.prepare('SELECT * FROM cases WHERE client_user_id = ? ORDER BY created_at DESC'),
    casesForLawyer: db.prepare('SELECT * FROM cases WHERE lawyer_id = ? ORDER BY created_at DESC'),
    requestResolution: db.prepare(
      "UPDATE cases SET status = 'CLIENT_REQUESTED_RESOLUTION', client_resolution_requested_at = ? WHERE case_id = ? AND status = 'ACTIVE'"
    ),
    keepActive: db.prepare(
      "UPDATE cases SET status = 'ACTIVE', client_resolution_requested_at = NULL WHERE case_id = ? AND status = 'CLIENT_REQUESTED_RESOLUTION'"
    ),
    confirmResolution: db.prepare(
      "UPDATE cases SET status = 'CLOSED', lawyer_confirmed_resolution_at = ?, resolved_at = ? WHERE case_id = ? AND status = 'CLIENT_REQUESTED_RESOLUTION'"
    ),

    clientsForLawyer: db.prepare(
      `SELECT DISTINCT users.id, users.first_name, users.last_name, users.phone, users.email, users.city, users.kyc_status
       FROM appointments JOIN users ON users.id = appointments.client_user_id WHERE appointments.lawyer_id = ?`
    ),
  };

  /** Static verified listing + approved applications; an approved application replaces a static entry with the same id. */
  function bookableLawyer(lawyerId) {
    const approved = toLawyerProfile(q.profileById.get(lawyerId));
    if (approved?.status === 'approved') {
      return { id: approved.id, name: approved.name, fee: approved.consultationFee, category: approved.practiceAreas[0] || null };
    }
    const listed = LAWYERS.find((l) => l.id === lawyerId && l.verified);
    return listed ? { id: listed.id, name: listed.name, fee: listed.fee, category: listed.cats[0] || null } : null;
  }

  return {
    // ---- lawyers -------------------------------------------------------
    lawyerProfileForUser: (userId) => toLawyerProfile(q.profileByUser.get(userId)),
    lawyerProfileById: (lawyerId) => toLawyerProfile(q.profileById.get(lawyerId)),
    allLawyerProfiles: () => q.allProfiles.all().map(toLawyerProfile),
    approvedListings: () => q.approvedProfiles.all().map((row) => toPublicListing(toLawyerProfile(row))),

    /** lawyerId is only passed by the dev seed (the demo lawyer is id 1). */
    createLawyerProfile(userId, p, { lawyerId, displayName = null, status = 'submitted' } = {}) {
      const id = lawyerId ?? Math.max(FIRST_APPLICATION_ID - 1, q.nextLawyerId.get().max || 0) + 1;
      q.insertProfile.run(
        id,
        userId,
        displayName,
        p.barCouncilId,
        p.barCouncilState,
        p.yearsOfExperience,
        json(p.practiceAreas),
        p.consultationFee,
        json(p.courts),
        p.langs,
        p.bio,
        json(p.documents),
        status,
        new Date(now()).toISOString()
      );
      return toLawyerProfile(q.profileById.get(id));
    },

    setLawyerStatus(lawyerId, status, rejectionReason = null) {
      q.setProfileStatus.run(status, status === 'rejected' ? rejectionReason : null, lawyerId);
      return toLawyerProfile(q.profileById.get(lawyerId));
    },

    // ---- availability --------------------------------------------------
    slotById: (id) => toSlot(q.slotById.get(id)),
    slotsForLawyer: (lawyerId) => q.slotsForLawyer.all(lawyerId).map(toSlot),
    /** Every AVAILABLE slot that hasn't started yet: the public booking calendar. */
    openSlots: () =>
      q.availableSlots
        .all()
        .filter((r) => slotStartsAt(r.date, r.start_time) > now())
        .map(toSlot),

    /** Returns null for a duplicate (same lawyer, date, time and type, any status). */
    createSlot(lawyerId, { date, startTime, consultationType }) {
      const id = `slot_${randomUUID()}`;
      try {
        q.insertSlot.run(id, lawyerId, date, startTime, consultationType, new Date(now()).toISOString());
      } catch (err) {
        if (/UNIQUE/i.test(err.message)) return null;
        throw err;
      }
      return toSlot(q.slotById.get(id));
    },
    /** False when the slot is booked (removing it would orphan the appointment). */
    removeSlot: (id) => q.deleteSlot.run(id).changes > 0,
    markDayUnavailable: (lawyerId, date) => q.markDayUnavailable.run(lawyerId, date).changes > 0,
    markSlotAvailable: (id) => (q.markSlotAvailable.run(id).changes > 0 ? toSlot(q.slotById.get(id)) : null),

    // ---- booking ---------------------------------------------------------
    /**
     * Claims the slot and creates the Appointment and its Case in one
     * transaction. The conditional UPDATE (status must still be AVAILABLE)
     * plus the UNIQUE slot_id on appointments mean two bookings of one slot
     * can never both succeed.
     * Throws 'slot-unavailable' (409) or 'lawyer-not-bookable' (409).
     */
    bookSlot({ slotId, client, city = null, caseSummary = null }) {
      return transaction(db, () => {
        const slot = q.slotById.get(slotId);
        if (!slot || slot.status !== SLOT_STATUS.AVAILABLE || slotStartsAt(slot.date, slot.start_time) <= now()) {
          throw fail('slot-unavailable', 409);
        }
        const lawyer = bookableLawyer(slot.lawyer_id);
        if (!lawyer) throw fail('lawyer-not-bookable', 409);

        const appointmentId = `apt_${randomUUID()}`;
        if (q.claimSlot.run(appointmentId, slotId).changes !== 1) throw fail('slot-unavailable', 409);
        const createdAt = new Date(now()).toISOString();
        q.insertAppointment.run(
          appointmentId,
          slotId,
          client.id,
          client.email,
          lawyer.id,
          lawyer.name,
          lawyer.category,
          slot.consultation_type,
          formatRecordDate(slot.date),
          slot.start_time,
          slot.consultation_type === 'in_person' ? city : null,
          lawyer.fee,
          PLATFORM_FEE,
          caseSummary,
          'CONFIRMED',
          createdAt
        );
        const caseId = `case_${randomUUID()}`;
        q.insertCase.run(
          caseId,
          q.nextCaseNumber.get().next,
          appointmentId,
          client.id,
          client.email,
          lawyer.id,
          lawyer.name,
          lawyer.category,
          slot.consultation_type,
          CASE_STATUS.ACTIVE,
          createdAt,
          null
        );
        return {
          appointment: toAppointment(db.prepare('SELECT * FROM appointments WHERE appointment_id = ?').get(appointmentId)),
          case: toCase(q.caseById.get(caseId)),
          slot: toSlot(q.slotById.get(slotId)),
        };
      });
    },

    /** Demo seed only: a past, already-closed consultation with no slot. */
    seedPastConsultation(client, s) {
      return transaction(db, () => {
        const appointmentId = `apt_${randomUUID()}`;
        q.insertAppointment.run(
          appointmentId,
          null,
          client.id,
          client.email,
          s.lawyerId,
          s.lawyerName,
          s.categorySlug,
          s.consultationType,
          s.date,
          s.time,
          s.city || null,
          s.fee,
          PLATFORM_FEE,
          s.caseSummary,
          'COMPLETED',
          s.createdAt
        );
        q.insertCase.run(
          `case_${randomUUID()}`,
          q.nextCaseNumber.get().next,
          appointmentId,
          client.id,
          client.email,
          s.lawyerId,
          s.lawyerName,
          s.categorySlug,
          s.consultationType,
          CASE_STATUS.CLOSED,
          s.createdAt,
          s.createdAt
        );
      });
    },

    appointmentsForClient: (userId) => q.appointmentsForClient.all(userId).map(toAppointment),
    appointmentsForLawyer: (lawyerId) => q.appointmentsForLawyer.all(lawyerId).map(toAppointment),

    // ---- cases ---------------------------------------------------------
    caseRow: (caseId) => q.caseById.get(caseId) || null,
    caseById: (caseId) => toCase(q.caseById.get(caseId)),
    casesForClient: (userId) => q.casesForClient.all(userId).map(toCase),
    casesForLawyer: (lawyerId) => q.casesForLawyer.all(lawyerId).map(toCase),

    /** Each transition only applies from its allowed status; otherwise the case is returned unchanged. */
    requestResolution(caseId) {
      q.requestResolution.run(new Date(now()).toISOString(), caseId);
      return toCase(q.caseById.get(caseId));
    },
    keepActive(caseId) {
      q.keepActive.run(caseId);
      return toCase(q.caseById.get(caseId));
    },
    confirmResolution(caseId) {
      const at = new Date(now()).toISOString();
      q.confirmResolution.run(at, at, caseId);
      return toCase(q.caseById.get(caseId));
    },

    /** Display profiles of the clients who booked this lawyer (for the lawyer's screens). */
    clientsForLawyer: (lawyerId) =>
      q.clientsForLawyer.all(lawyerId).map((r) => ({
        id: r.id,
        role: 'client',
        firstName: r.first_name,
        lastName: r.last_name,
        name: `${r.first_name} ${r.last_name}`.trim(),
        phone: r.phone,
        email: r.email,
        city: r.city,
        kycStatus: r.kyc_status,
      })),

    /** Before a client account is deleted: free the future slots their bookings held. */
    releaseSlotsForClient: (userId) => q.releaseSlotsForClient.run(userId),
  };
}
