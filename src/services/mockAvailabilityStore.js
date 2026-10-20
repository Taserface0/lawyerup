// =============================================================================
// MOCK ONLY — lawyer availability slots.
//
// This is deliberately a SEPARATE store/table from Appointments (see
// mockAppointmentStore.js) — an Availability Slot is a lawyer's offer of
// time ("I could see someone at 10am"); an Appointment is a client
// actually claiming one. Conflating the two was the original bug this
// feature fixes: previously, `lawyer.slots` in data/lawyers.js was just a
// hardcoded array of time-strings that never changed, so nothing actually
// stopped two different clients from both "booking" the same 10:00 AM.
//
// Same global-localStorage-key pattern as every other mock store here.
//
// -----------------------------------------------------------------------
// DOUBLE-BOOKING PROTECTION — WHAT THIS ACTUALLY GUARANTEES
// -----------------------------------------------------------------------
// claimAvailabilitySlot() below does a single synchronous read-check-write
// pass with no `await` in between the check and the write. Within ONE
// browser tab's single-threaded JS, that means two calls in the same tab
// genuinely cannot both succeed for the same slot — the second one always
// sees the first one's write. This is real protection against the literal
// "client clicks Pay twice" case, and against the sequential "client A
// books, then client B tries" case this feature's tests exercise.
//
// It is NOT a real distributed lock. If two SEPARATE browser tabs (e.g.
// two different client accounts open side by side, this app's usual way
// of simulating "two different people") both read localStorage at
// nearly the same real-world instant, before either has written its
// result back, both could still see AVAILABLE and both could still
// "succeed" from their own tab's point of view — localStorage has no
// cross-tab transaction mechanism. A real backend closes this gap with a
// database-level unique constraint or a row lock (e.g. `UPDATE slots SET
// status='BOOKED' WHERE id=? AND status='AVAILABLE'` and checking the
// affected-row count) — that is explicitly out of scope for this
// prototype and is the one piece of this feature that cannot be made
// fully correct without a real backend.
// =============================================================================

const AVAILABILITY_STORAGE_KEY = 'lawyerup_mock_availability';

export const SLOT_STATUS = {
  AVAILABLE: 'AVAILABLE',
  BOOKED: 'BOOKED',
  UNAVAILABLE: 'UNAVAILABLE',
};

function readSlots() {
  try {
    const raw = localStorage.getItem(AVAILABILITY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeSlots(list) {
  localStorage.setItem(AVAILABILITY_STORAGE_KEY, JSON.stringify(list));
}

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
 * ANY status — including BOOKED, which is the specific case called out:
 * a lawyer can't create fresh "availability" that collides with a slot a
 * client has already claimed. To change an existing slot's type/time, the
 * lawyer removes it first (see removeAvailabilitySlot) and adds a new one.
 */
export function createAvailabilitySlot({ lawyerId, date, startTime, consultationType }) {
  const slots = readSlots();
  const duplicate = slots.some(
    (s) => s.lawyerId === lawyerId && s.date === date && s.startTime === startTime && s.consultationType === consultationType
  );
  if (duplicate) return null;
  const slot = {
    id: `slot_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    lawyerId,
    date, // 'YYYY-MM-DD'
    startTime, // e.g. '10:00 AM'
    consultationType, // 'online' | 'in_person'
    status: SLOT_STATUS.AVAILABLE,
    appointmentId: null,
    createdAt: new Date().toISOString(),
  };
  slots.push(slot);
  writeSlots(slots);
  return slot;
}

/** Removes a slot. Refuses (returns false) to remove a BOOKED slot — that would orphan the appointment that claimed it. */
export function removeAvailabilitySlot(slotId) {
  const slots = readSlots();
  const idx = slots.findIndex((s) => s.id === slotId);
  if (idx === -1) return false;
  if (slots[idx].status === SLOT_STATUS.BOOKED) return false;
  slots.splice(idx, 1);
  writeSlots(slots);
  return true;
}

/**
 * "Mark a day as unavailable": flips every AVAILABLE slot (only) for this
 * lawyer on this date to UNAVAILABLE. BOOKED slots are deliberately left
 * untouched — this cannot cancel an appointment a client already made.
 */
export function markDayUnavailable(lawyerId, date) {
  const slots = readSlots();
  let changed = false;
  const updated = slots.map((s) => {
    if (s.lawyerId === lawyerId && s.date === date && s.status === SLOT_STATUS.AVAILABLE) {
      changed = true;
      return { ...s, status: SLOT_STATUS.UNAVAILABLE };
    }
    return s;
  });
  if (changed) writeSlots(updated);
  return changed;
}

/** Reverses markDayUnavailable for a single slot, putting it back to AVAILABLE. */
export function markSlotAvailable(slotId) {
  const slots = readSlots();
  const idx = slots.findIndex((s) => s.id === slotId);
  if (idx === -1 || slots[idx].status === SLOT_STATUS.BOOKED) return null;
  slots[idx] = { ...slots[idx], status: SLOT_STATUS.AVAILABLE };
  writeSlots(slots);
  return slots[idx];
}

/** Full availability list for the lawyer's own "My Availability" dashboard — every status, every date, including past (so their history isn't hidden from them). */
export function getAvailabilityForLawyer(lawyerId) {
  return readSlots()
    .filter((s) => s.lawyerId === lawyerId)
    .sort((a, b) => slotDateTime(a) - slotDateTime(b));
}

/**
 * The client-facing query: only AVAILABLE slots, only the requested
 * consultation type, only future slots. This is the actual enforcement of
 * "the client should only be able to book what the lawyer made
 * available" — the client-side UI never even receives a BOOKED, past, or
 * wrong-consultation-type slot to render as an option.
 */
export function getAvailableSlotsForClient(lawyerId, consultationType) {
  return readSlots()
    .filter(
      (s) =>
        s.lawyerId === lawyerId &&
        s.consultationType === consultationType &&
        s.status === SLOT_STATUS.AVAILABLE &&
        !isPast(s)
    )
    .sort((a, b) => slotDateTime(a) - slotDateTime(b));
}

export function getSlotById(slotId) {
  return readSlots().find((s) => s.id === slotId) || null;
}

/**
 * The core double-booking guard — see the file header for exactly what
 * this does and does not guarantee. Must be called and checked BEFORE
 * creating the Appointment, so a losing attempt never creates an orphaned
 * appointment for a slot it didn't actually secure.
 */
export function claimAvailabilitySlot(slotId) {
  const slots = readSlots();
  const idx = slots.findIndex((s) => s.id === slotId);
  if (idx === -1) return false;
  if (slots[idx].status !== SLOT_STATUS.AVAILABLE) return false;
  if (isPast(slots[idx])) return false;
  slots[idx] = { ...slots[idx], status: SLOT_STATUS.BOOKED };
  writeSlots(slots);
  return true;
}

/** Records which Appointment ended up claiming a slot, purely for the lawyer's "who booked this" view. Call only after claimAvailabilitySlot() has already succeeded. */
export function attachAppointmentToSlot(slotId, appointmentId) {
  const slots = readSlots();
  const idx = slots.findIndex((s) => s.id === slotId);
  if (idx === -1) return null;
  slots[idx] = { ...slots[idx], appointmentId };
  writeSlots(slots);
  return slots[idx];
}

/**
 * DEV-ONLY: deletes every availability slot belonging to one lawyer. Not
 * currently wired into anything (there is no "delete lawyer" flow
 * equivalent to the client account cascade yet) — provided for parity
 * with the other stores' cleanup helpers, so adding that flow later is a
 * one-line call rather than a new function.
 */
export function deleteAvailabilityForLawyer(lawyerId) {
  const slots = readSlots();
  const remaining = slots.filter((s) => s.lawyerId !== lawyerId);
  writeSlots(remaining);
}
