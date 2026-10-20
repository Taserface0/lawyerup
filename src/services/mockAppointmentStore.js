// =============================================================================
// Appointments (bookings). Stored in the server database
// (server/db/practice.js) since Phase 2; this module reads the browser's copy
// in serverData.js, which only ever contains this visitor's own bookings:
// a client gets the appointments they made, a lawyer the ones made with them.
//
// The file keeps its old name and synchronous getters so the screens that
// read appointments did not have to change.
// =============================================================================

import { serverData, patchServerData, mutate } from './serverData.js';

export const APPOINTMENT_STATUS = {
  REQUESTED: 'REQUESTED',
  CONFIRMED: 'CONFIRMED',
  UPCOMING: 'UPCOMING',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

const newestFirst = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);

/**
 * Books an availability slot for the signed-in client. The server claims the
 * slot and creates the Appointment and its Case in one transaction, so two
 * clients can never both get the same slot. Fee, lawyer name and date come
 * from the server, not the browser.
 *
 * @param {{ slotId: string, city?: string|null, caseSummary?: string|null }} booking
 *   city: resolved city NAME only, never coordinates (see mockLocationService.js)
 * @returns {Promise<{ appointment: object, case: object }>}
 * @throws {Error} 'slot-unavailable' when the slot was just taken or has passed,
 *   'lawyer-not-bookable', 'clients-only', 'network', ...
 */
export async function bookSlot({ slotId, city = null, caseSummary = null }) {
  const result = await mutate('bookings', { slotId, city, caseSummary });
  return { appointment: result.appointment, case: result.case };
}

export function getAppointmentsForClient(clientId) {
  return serverData()
    .appointments.filter((a) => a.clientId === clientId)
    .sort(newestFirst);
}

export function getAppointmentsForLawyer(lawyerId) {
  return serverData()
    .appointments.filter((a) => a.lawyerId === lawyerId)
    .sort(newestFirst);
}

export function getAppointmentById(appointmentId) {
  return serverData().appointments.find((a) => a.appointmentId === appointmentId) || null;
}

/**
 * Drops one client's appointments from the browser's copy after the server
 * has deleted their account (the server already deleted the rows). Used by
 * mockAuthStore.js's deleteClientDataLocally().
 */
export function deleteAppointmentsForClient(clientId) {
  patchServerData({ appointments: serverData().appointments.filter((a) => a.clientId !== clientId) });
}
