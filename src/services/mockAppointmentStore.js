// =============================================================================
// MOCK ONLY — Appointment data model. Replaces the old "booking = receipt"
// behavior (a plain object pushed into in-memory AppContext state) with a
// real, persisted lifecycle that both the client and lawyer sides of the
// app read from.
//
// STORAGE NOTE: this uses one global localStorage key
// (`lawyerup_mock_appointments`), the same pattern as mockAuthStore.js and
// mockLawyerStore.js. That's intentional, not an oversight: in this
// no-backend prototype, "the client" and "the lawyer" are just two
// different accounts signed into the SAME browser at different times, and
// localStorage is shared across the whole origin regardless of which
// account is currently signed in. That's exactly what makes it possible to
// book as a client, sign out, sign in as the lawyer, and see the same
// appointment — mirroring how a real backend's shared `appointments` table
// would work, without actually needing one yet.
//
// A real backend replaces this file with a real `appointments` table, an
// authenticated API (a client can only read their own rows; a lawyer can
// only read rows where they're the assigned lawyer), and server-issued IDs.
// =============================================================================

const APPOINTMENTS_KEY = 'lawyerup_mock_appointments';

export const APPOINTMENT_STATUS = {
  REQUESTED: 'REQUESTED',
  CONFIRMED: 'CONFIRMED',
  UPCOMING: 'UPCOMING',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

function readAppointments() {
  try {
    const raw = localStorage.getItem(APPOINTMENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAppointments(list) {
  localStorage.setItem(APPOINTMENTS_KEY, JSON.stringify(list));
}

/**
 * Creates a new appointment. Booking currently confirms immediately (no
 * lawyer accept/reject step yet — that's a natural Phase-4/5-adjacent
 * extension, not implemented here), so status starts at CONFIRMED.
 *
 * @param {object} params
 * @param {string} params.clientId - the client's email (stable identifier
 *   already used as the account key in mockAuthStore.js)
 * @param {number} params.lawyerId - matches the unified id space from
 *   getAllMarketplaceLawyers()/findMarketplaceLawyerById()
 * @param {string} params.lawyerName
 * @param {string} params.categorySlug
 * @param {'online'|'in_person'} params.consultationType
 * @param {string} params.date
 * @param {string} params.time
 * @param {string|null} params.city - resolved city name ONLY. Never pass
 *   raw coordinates here — see mockLocationService.js's privacy note.
 * @param {number} params.fee
 * @param {number} params.platformFee
 * @param {string|null} params.caseSummary
 */
export function createAppointment({
  clientId,
  lawyerId,
  lawyerName,
  categorySlug,
  consultationType,
  date,
  time,
  city,
  fee,
  platformFee,
  caseSummary,
  status = APPOINTMENT_STATUS.CONFIRMED, // override used only by demo-data seeding
  createdAt = new Date().toISOString(), // override used only by demo-data seeding
}) {
  const appointments = readAppointments();
  const appointment = {
    appointmentId: `apt_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    clientId,
    lawyerId,
    lawyerName,
    categorySlug,
    consultationType, // 'online' | 'in_person'
    date,
    time,
    city: city || null, // city name only — never raw lat/lng
    fee,
    platformFee,
    caseSummary: caseSummary || null,
    status,
    createdAt,
  };
  appointments.unshift(appointment);
  writeAppointments(appointments);
  return appointment;
}

export function getAppointmentsForClient(clientId) {
  return readAppointments()
    .filter((a) => a.clientId === clientId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function getAppointmentsForLawyer(lawyerId) {
  return readAppointments()
    .filter((a) => a.lawyerId === lawyerId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function getAppointmentById(appointmentId) {
  return readAppointments().find((a) => a.appointmentId === appointmentId) || null;
}

export function updateAppointmentStatus(appointmentId, status) {
  const appointments = readAppointments();
  const idx = appointments.findIndex((a) => a.appointmentId === appointmentId);
  if (idx === -1) return null;
  appointments[idx] = { ...appointments[idx], status };
  writeAppointments(appointments);
  return appointments[idx];
}

/**
 * DEV-ONLY: deletes every appointment belonging to one client (matched by
 * exact clientId — never a prefix/partial match). Used by
 * mockAuthStore.js's deleteClientDataLocally() — always run this
 * AFTER that client's cases (and their messages) have already been
 * deleted, and BEFORE deleting the account itself.
 */
export function deleteAppointmentsForClient(clientId) {
  const appointments = readAppointments();
  const remaining = appointments.filter((a) => a.clientId !== clientId);
  writeAppointments(remaining);
}
