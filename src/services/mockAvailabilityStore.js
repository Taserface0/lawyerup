// =============================================================================
// Lawyer availability slots. Stored in the server database since Phase 2
// (server/db/practice.js); this module reads the browser's copy in
// serverData.js: `openSlots` (every lawyer's bookable future slots, the
// public calendar) and `mySlots` (a signed-in lawyer's own slots, every
// status).
//
// This is deliberately a SEPARATE record from Appointments (see
// mockAppointmentStore.js): an Availability Slot is a lawyer's offer of time
// ("I could see someone at 10am"); an Appointment is a client actually
// claiming one.
//
// -----------------------------------------------------------------------
// DOUBLE-BOOKING PROTECTION
// -----------------------------------------------------------------------
// Booking happens on the server (bookSlot() in mockAppointmentStore.js): one
// transaction claims the slot only if it is still AVAILABLE and in the
// future, and appointments.slot_id is UNIQUE, so two clients in two
// browsers can never both book the same slot. (The old localStorage version
// could not guarantee this across tabs.)
// =============================================================================

import { serverData, patchServerData, mutateInBackground } from './serverData.js';

export const SLOT_STATUS = {
  AVAILABLE: 'AVAILABLE',
  BOOKED: 'BOOKED',
  UNAVAILABLE: 'UNAVAILABLE',
};

/** Parses a "10:00 AM" style label + a "YYYY-MM-DD" date into a real Date, for past/future comparisons and sorting. */
function slotDateTime(slot) {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(slot.startTime.trim());
  const [y, m, d] = slot.date.split('-').map(Number);
  if (!match) return new Date(y, m - 1, d);
  let hour = parseInt(match[1], 10) % 12;
  if (match[3].toUpperCase() === 'PM') hour += 12;
  return new Date(y, m - 1, d, hour, parseInt(match[2], 10));
}

function isPast(slot) {
  return slotDateTime(slot).getTime() < Date.now();
}

/**
 * Generates the fixed list of selectable start-time labels for the "Add
 * Slot" form (half-hour increments, 9:00 AM–6:00 PM) — a plain dropdown
 * rather than a time-picker library, per "do not introduce unnecessary
 * dependencies," and formatted identically to how times are displayed
 * everywhere else in this app (e.g. "10:00 AM", matching the old
 * data/lawyers.js slot strings).
 */
export function generateTimeOptions() {
  const options = [];
  for (let h = 9; h <= 18; h++) {
    for (const m of [0, 30]) {
      if (h === 18 && m === 30) continue;
      const hour12 = h % 12 === 0 ? 12 : h % 12;
      const ampm = h < 12 ? 'AM' : 'PM';
      options.push(`${hour12}:${m === 0 ? '00' : '30'} ${ampm}`);
    }
  }
  return options;
}

/**
 * Relative-date label for grouping headers. Returns a small tagged object
 * rather than a hardcoded English string so the UI can translate the
 * 'today'/'tomorrow' cases; 'date' returns a plain, language-neutral
 * numeric-ish label (e.g. "25 Aug") since calendar dates don't really
 * need translation the way UI copy does.
 */
export function formatSlotDateLabel(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (dateObj.getTime() === today.getTime()) return { type: 'today' };
  if (dateObj.getTime() === tomorrow.getTime()) return { type: 'tomorrow' };
  return { type: 'date', label: dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) };
}

/** Groups a slot list by date, preserving whatever order they arrived in (getAvailabilityForLawyer/getAvailableSlotsForClient already sort chronologically). Shared by the lawyer's own availability screen and the client-facing slot picker. */
/**
 * Human-readable date stored on an Appointment record, e.g. "14 Jul 2026" —
 * the same format the demo seed data uses, so old and new records match.
 */
export function formatSlotDateForRecord(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function groupSlotsByDate(slots) {
  const groups = [];
  for (const slot of slots) {
    let group = groups.find((g) => g.date === slot.date);
    if (!group) {
      group = { date: slot.date, slots: [] };
      groups.push(group);
    }
    group.slots.push(slot);
  }
  return groups;
}

/**
 * Creates a new AVAILABLE slot. Refuses (returns null) if an identical
 * slot (same lawyer, date, time, and consultation type) already exists in
 * ANY status — including BOOKED: a lawyer can't create fresh "availability"
 * that collides with a slot a client has already claimed. To change an
 * existing slot's type/time, the lawyer removes it first and adds a new one.
 * The slot shows up at once; the server then confirms it (same rule).
 */
export function createAvailabilitySlot({ lawyerId, date, startTime, consultationType }) {
  const mine = serverData().mySlots;
  const duplicate = mine.some(
    (s) => s.lawyerId === lawyerId && s.date === date && s.startTime === startTime && s.consultationType === consultationType
  );
  if (duplicate) return null;
  const slot = {
    id: `pending_${Date.now()}_${Math.floor(Math.random() * 10000)}`, // replaced by the server's id on the next refresh
    lawyerId,
    date, // 'YYYY-MM-DD'
    startTime, // e.g. '10:00 AM'
    consultationType, // 'online' | 'in_person'
    status: SLOT_STATUS.AVAILABLE,
    appointmentId: null,
    createdAt: new Date().toISOString(),
  };
  patchServerData({ mySlots: [...mine, slot] });
  mutateInBackground('slots', { date, startTime, consultationType });
  return slot;
}

/** Removes a slot. Refuses (returns false) to remove a BOOKED slot — that would orphan the appointment that claimed it. */
export function removeAvailabilitySlot(slotId) {
  const slot = getSlotById(slotId);
  if (!slot) return false;
  if (slot.status === SLOT_STATUS.BOOKED) return false;
  patchServerData({
    mySlots: serverData().mySlots.filter((s) => s.id !== slotId),
    openSlots: serverData().openSlots.filter((s) => s.id !== slotId),
  });
  mutateInBackground('slots/remove', { slotId });
  return true;
}

/**
 * "Mark a day as unavailable": flips every AVAILABLE slot (only) for this
 * lawyer on this date to UNAVAILABLE. BOOKED slots are deliberately left
 * untouched — this cannot cancel an appointment a client already made.
 */
export function markDayUnavailable(lawyerId, date) {
  let changed = false;
  const mySlots = serverData().mySlots.map((s) => {
    if (s.lawyerId === lawyerId && s.date === date && s.status === SLOT_STATUS.AVAILABLE) {
      changed = true;
      return { ...s, status: SLOT_STATUS.UNAVAILABLE };
    }
    return s;
  });
  if (changed) {
    patchServerData({ mySlots, openSlots: serverData().openSlots.filter((s) => !(s.lawyerId === lawyerId && s.date === date)) });
    mutateInBackground('slots/mark-day-unavailable', { date });
  }
  return changed;
}

/** Reverses markDayUnavailable for a single slot, putting it back to AVAILABLE. */
export function markSlotAvailable(slotId) {
  const slot = getSlotById(slotId);
  if (!slot || slot.status === SLOT_STATUS.BOOKED) return null;
  const updated = { ...slot, status: SLOT_STATUS.AVAILABLE };
  patchServerData({ mySlots: serverData().mySlots.map((s) => (s.id === slotId ? updated : s)) });
  mutateInBackground('slots/mark-available', { slotId });
  return updated;
}

/** Full availability list for the lawyer's own "My Availability" dashboard — every status, every date, including past (so their history isn't hidden from them). */
export function getAvailabilityForLawyer(lawyerId) {
  return serverData()
    .mySlots.filter((s) => s.lawyerId === lawyerId)
    .sort((a, b) => slotDateTime(a) - slotDateTime(b));
}

/**
 * The client-facing query: only AVAILABLE slots, only the requested
 * consultation type, only future slots. The server only ever sends AVAILABLE
 * future slots here, and checks again when booking.
 */
export function getAvailableSlotsForClient(lawyerId, consultationType) {
  return serverData()
    .openSlots.filter(
      (s) =>
        s.lawyerId === lawyerId &&
        s.consultationType === consultationType &&
        s.status === SLOT_STATUS.AVAILABLE &&
        !isPast(s)
    )
    .sort((a, b) => slotDateTime(a) - slotDateTime(b));
}

export function getSlotById(slotId) {
  const { mySlots, openSlots } = serverData();
  return mySlots.find((s) => s.id === slotId) || openSlots.find((s) => s.id === slotId) || null;
}
