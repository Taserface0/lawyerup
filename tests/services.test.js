import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isValidMobile, isValidPassword } from '../src/lib/utils.js';
import { formatSlotDateForRecord } from '../src/services/mockAvailabilityStore.js';
import { createCaseForAppointment, getCasesForClient } from '../src/services/mockCaseStore.js';
import { getAllMarketplaceLawyers, seedDemoLawyerAccountIfMissing, updateLawyerApplicationStatus } from '../src/services/mockLawyerStore.js';
import { registerMockAccount, deleteClientAccountCompletely, getClientAccountByEmail } from '../src/services/mockAuthStore.js';
import { submitReview, getReviewsForLawyer } from '../src/services/mockReviewStore.js';
import { createAppointment, getAppointmentsForClient } from '../src/services/mockAppointmentStore.js';
import { sendMobileOtp, verifyMobileOtp } from '../src/services/mockOtpService.js';

beforeEach(() => localStorage.clear());

describe('validation', () => {
  it('accepts only real Indian mobile numbers', () => {
    expect(isValidMobile('9876543210')).toBe(true);
    expect(isValidMobile('0123456789')).toBe(false);
    expect(isValidMobile('98765')).toBe(false);
  });
  it('requires 8+ character passwords', () => {
    expect(isValidPassword('1234567')).toBe(false);
    expect(isValidPassword('12345678')).toBe(true);
  });
});

describe('bookings', () => {
  it('records the slot date instead of "Today"', () => {
    expect(formatSlotDateForRecord('2026-07-14')).toBe('14 Jul 2026');
  });

  it('never reuses a case number after deletions', () => {
    const appt = (clientId) => ({ appointmentId: `a-${clientId}-${Math.random()}`, clientId, lawyerId: 1 });
    createCaseForAppointment(appt('a@x.in'));
    createCaseForAppointment(appt('b@x.in'));
    registerMockAccount({ firstName: 'A', lastName: 'X', phone: '9000000000', email: 'a@x.in', city: 'Pune', password: 'password1' });
    deleteClientAccountCompletely('a@x.in');
    const c = createCaseForAppointment(appt('c@x.in'));
    expect(c.caseNumber).toBe(3);
    expect(getCasesForClient('a@x.in')).toEqual([]);
  });
});

describe('marketplace', () => {
  it('lists each lawyer once even when the demo lawyer is approved', () => {
    seedDemoLawyerAccountIfMissing();
    updateLawyerApplicationStatus(1, 'approved');
    const ids = getAllMarketplaceLawyers().map((l) => l.id);
    expect(ids.filter((id) => id === 1)).toHaveLength(1);
  });

  it('only lists verified lawyers', () => {
    expect(getAllMarketplaceLawyers().every((l) => l.verified)).toBe(true);
  });
});

describe('right to erasure', () => {
  it('deletes the account and its bookings and anonymises its reviews', () => {
    registerMockAccount({ firstName: 'Riya', lastName: 'S', phone: '9000000001', email: 'riya@x.in', city: 'Delhi', password: 'password1' });
    createAppointment({ clientId: 'riya@x.in', lawyerId: 2, lawyerName: 'Adv. Farhan Sheikh', fee: 1500 });
    submitReview({ appointmentId: 'apt1', caseId: 'c1', lawyerId: 2, clientId: 'riya@x.in', clientName: 'Riya S', rating: 5, reviewText: 'my divorce case' });
    deleteClientAccountCompletely('riya@x.in');
    expect(getClientAccountByEmail('riya@x.in')).toBeNull();
    expect(getAppointmentsForClient('riya@x.in')).toEqual([]);
    const [review] = getReviewsForLawyer(2);
    expect(review).toMatchObject({ rating: 5, clientId: null, clientName: 'Former client', reviewText: '' });
  });
});

describe('OTP', () => {
  it('locks the code after 5 wrong guesses', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const run = async (p) => {
      const promise = p();
      await vi.runAllTimersAsync();
      return promise;
    };
    await run(() => sendMobileOtp('9000000002'));
    for (let i = 0; i < 4; i++) expect(await run(() => verifyMobileOtp('9000000002', 'xxxx'))).toBe(false);
    const last = verifyMobileOtp('9000000002', 'xxxx');
    const assertion = expect(last).rejects.toThrow('expired');
    await vi.runAllTimersAsync();
    await assertion;
    vi.useRealTimers();
  });
});
