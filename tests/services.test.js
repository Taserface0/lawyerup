import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isValidMobile, isValidPassword } from '../src/lib/utils.js';
import { formatSlotDateForRecord, getAvailableSlotsForClient, createAvailabilitySlot } from '../src/services/mockAvailabilityStore.js';
import { getCasesForClient, requestCaseResolution, keepCaseActive } from '../src/services/mockCaseStore.js';
import { getAllMarketplaceLawyers } from '../src/services/mockLawyerStore.js';
import { patchServerData, resetServerData } from '../src/services/serverData.js';
import { rememberClientProfile, deleteClientDataLocally, getClientAccountByEmail } from '../src/services/mockAuthStore.js';
import { submitReview, getReviewsForLawyer } from '../src/services/mockReviewStore.js';
import { getAppointmentsForClient } from '../src/services/mockAppointmentStore.js';
import { sendMobileOtp, verifyMobileOtp } from '../src/services/mockOtpService.js';

// The stores read the browser's copy of the server data; the server itself is
// covered by tests/data.test.js. Background writes go to a stubbed fetch.
beforeEach(() => {
  localStorage.clear();
  patchServerData({ approvedLawyers: [], openSlots: [], appointments: [], cases: [], mySlots: [], clients: [] });
  globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
});

const listing = (overrides) => ({
  id: 1001,
  name: 'Adv. New Lawyer',
  city: 'Pune',
  practiceAreas: ['family'],
  langs: 'English',
  yearsOfExperience: 5,
  consultationFee: 900,
  barCouncilId: 'MAH/1',
  bio: 'Bio',
  courts: [],
  ...overrides,
});

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

  it('offers clients only future, available slots of the chosen type', () => {
    const slot = (id, date, status = 'AVAILABLE', consultationType = 'online') => ({ id, lawyerId: 1, date, startTime: '10:00 AM', consultationType, status });
    patchServerData({ openSlots: [slot('past', '2020-01-01'), slot('ok', '2099-01-01'), slot('booked', '2099-01-02', 'BOOKED'), slot('other', '2099-01-03', 'AVAILABLE', 'in_person')] });
    expect(getAvailableSlotsForClient(1, 'online').map((s) => s.id)).toEqual(['ok']);
  });

  it('refuses a duplicate slot locally and sends new ones to the server', () => {
    patchServerData({ mySlots: [{ id: 's1', lawyerId: 1, date: '2099-01-01', startTime: '10:00 AM', consultationType: 'online', status: 'BOOKED' }] });
    expect(createAvailabilitySlot({ lawyerId: 1, date: '2099-01-01', startTime: '10:00 AM', consultationType: 'online' })).toBeNull();
    expect(createAvailabilitySlot({ lawyerId: 1, date: '2099-01-01', startTime: '11:00 AM', consultationType: 'online' })).toMatchObject({ status: 'AVAILABLE' });
    expect(fetch).toHaveBeenCalledWith('/api/data/slots', expect.objectContaining({ method: 'POST' }));
  });
});

describe('case resolution', () => {
  it('only moves a case along the allowed path and tells the server', () => {
    patchServerData({ cases: [{ caseId: 'c1', clientId: 'a@x.in', lawyerId: 1, status: 'ACTIVE', createdAt: '2026-01-01' }] });
    expect(keepCaseActive('c1').status).toBe('ACTIVE'); // nothing pending: no-op, nothing sent
    expect(fetch).not.toHaveBeenCalled();
    expect(requestCaseResolution('c1').status).toBe('CLIENT_REQUESTED_RESOLUTION');
    expect(getCasesForClient('a@x.in')[0].status).toBe('CLIENT_REQUESTED_RESOLUTION');
    expect(fetch).toHaveBeenCalledWith('/api/data/cases/request-resolution', expect.objectContaining({ body: JSON.stringify({ caseId: 'c1' }) }));
  });
});

describe('marketplace', () => {
  it('lists each lawyer once even when an approved application shares a static id', () => {
    patchServerData({ approvedLawyers: [listing({ id: 1, name: 'Adv. Rekha Menon' }), listing()] });
    const ids = getAllMarketplaceLawyers().map((l) => l.id);
    expect(ids.filter((id) => id === 1)).toHaveLength(1);
    expect(getAllMarketplaceLawyers().find((l) => l.id === 1001)).toMatchObject({ fee: 900, cats: ['family'], verified: true });
  });

  it('only lists verified lawyers', () => {
    expect(getAllMarketplaceLawyers().every((l) => l.verified)).toBe(true);
  });
});

describe('right to erasure', () => {
  it("removes a deleted account's bookings and profile from this browser and anonymises its reviews", () => {
    rememberClientProfile({ role: 'client', firstName: 'Riya', lastName: 'S', name: 'Riya S', phone: '9000000001', email: 'riya@x.in', city: 'Delhi' });
    expect(getClientAccountByEmail('RIYA@x.in')).toMatchObject({ name: 'Riya S' });
    patchServerData({ appointments: [{ appointmentId: 'apt1', clientId: 'riya@x.in', lawyerId: 2, lawyerName: 'Adv. Farhan Sheikh', fee: 1500, createdAt: '2026-01-01' }] });
    submitReview({ appointmentId: 'apt1', caseId: 'c1', lawyerId: 2, clientId: 'riya@x.in', clientName: 'Riya S', rating: 5, reviewText: 'my divorce case' });
    deleteClientDataLocally('riya@x.in');
    expect(getClientAccountByEmail('riya@x.in')).toBeNull();
    expect(getAppointmentsForClient('riya@x.in')).toEqual([]);
    resetServerData();
    const [review] = getReviewsForLawyer(2);
    expect(review).toMatchObject({ rating: 5, clientId: null, clientName: 'Former client', reviewText: '' });
  });
});

describe('browser profile cache', () => {
  it('never stores a password and removes the old mock account list', async () => {
    localStorage.setItem('lawyerup_mock_accounts', JSON.stringify([{ email: 'a@x.in', passwordObfuscated: 'cGFzcw==' }]));
    vi.resetModules();
    const fresh = await import('../src/services/mockAuthStore.js');
    expect(localStorage.getItem('lawyerup_mock_accounts')).toBeNull();
    fresh.rememberClientProfile({ role: 'client', name: 'A', email: 'a@x.in', password: 'secret123', passwordHash: 'x' });
    expect(localStorage.getItem('lawyerup_client_profiles')).not.toMatch(/secret123|passwordHash/);
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
