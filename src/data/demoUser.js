// Seeds two illustrative PAST/CLOSED consultations for the demo account
// (see services/mockAuthStore.js for DEMO_EMAIL/DEMO_PASSWORD) so there's
// something to look at on first sign-in without having to book anything
// first. Uses the real Appointment + Case stores (not a separate shape),
// so this demo data behaves identically to anything a real booking would
// create — same status tags, same "open consultation" flow, same chat.
import { createAppointment, APPOINTMENT_STATUS } from '../services/mockAppointmentStore.js';
import { createCaseForAppointment, CASE_STATUS } from '../services/mockCaseStore.js';
import { getAppointmentsForClient } from '../services/mockAppointmentStore.js';

export function seedDemoConsultationsIfMissing(clientEmail) {
  if (getAppointmentsForClient(clientEmail).length > 0) return; // already seeded (or user has real bookings)

  const seeds = [
    {
      lawyerId: 1, // Adv. Rekha Menon — criminal
      lawyerName: 'Adv. Rekha Menon',
      categorySlug: 'criminal',
      consultationType: 'online',
      date: '14 Jul 2026',
      time: '11:30 AM',
      fee: 1200,
      caseSummary: 'Needed clarity on rights after being questioned by traffic police without a written notice.',
      createdAt: '2026-07-14T06:00:00.000Z',
    },
    {
      lawyerId: 3, // Adv. Kavita Iyer — property
      lawyerName: 'Adv. Kavita Iyer',
      categorySlug: 'property',
      consultationType: 'in_person',
      date: '2 Jun 2026',
      time: '2:30 PM',
      fee: 999,
      city: 'Chennai',
      caseSummary: 'Reviewing a sale deed before registration.',
      createdAt: '2026-06-02T09:00:00.000Z',
    },
  ];

  for (const seed of seeds) {
    const appointment = createAppointment({
      clientId: clientEmail,
      lawyerId: seed.lawyerId,
      lawyerName: seed.lawyerName,
      categorySlug: seed.categorySlug,
      consultationType: seed.consultationType,
      date: seed.date,
      time: seed.time,
      city: seed.city || null,
      fee: seed.fee,
      platformFee: 49,
      caseSummary: seed.caseSummary,
      status: APPOINTMENT_STATUS.COMPLETED,
      createdAt: seed.createdAt,
    });
    createCaseForAppointment(appointment, {
      status: CASE_STATUS.CLOSED,
      createdAt: seed.createdAt,
      resolvedAt: seed.createdAt,
    });
  }
}
