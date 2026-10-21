import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isValidMobile, isValidPassword } from '../src/lib/utils.js';
import { formatSlotDateForRecord, getAvailableSlotsForClient, createAvailabilitySlot } from '../src/services/mockAvailabilityStore.js';
import { getCasesForClient, requestCaseResolution, keepCaseActive } from '../src/services/mockCaseStore.js';
import { getAllMarketplaceLawyers } from '../src/services/mockLawyerStore.js';
import { patchServerData } from '../src/services/serverData.js';
import { deleteClientDataLocally, getClientAccountByEmail } from '../src/services/mockAuthStore.js';
import { submitReview, getReviewForAppointment } from '../src/services/mockReviewStore.js';
import { sendMessage, getMessagesForCase, markCaseMessagesRead, getUnreadCountForCase } from '../src/services/mockMessageStore.js';
import { getAppointmentsForClient } from '../src/services/mockAppointmentStore.js';
import { sendMobileOtp, verifyMobileOtp } from '../src/services/mockOtpService.js';

// The stores read the browser's copy of the server data; the server itself is
// covered by tests/data.test.js. Background writes go to a stubbed fetch.
beforeEach(() => {
  localStorage.clear();
  patchServerData({ approvedLawyers: [], openSlots: [], ratings: {}, appointments: [], cases: [], mySlots: [], clients: [], messages: [], myReviews: [] });
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

  it("shows the server's rating and appends submitted reviews to the static samples", () => {
    const before = getAllMarketplaceLawyers().find((l) => l.id === 1);
    patchServerData({ ratings: { 1: { rating: 4.8, reviews: 113, revs: [{ n: 'Riya S', r: 1, c: 'Late' }] } } });
    const after = getAllMarketplaceLawyers().find((l) => l.id === 1);
    expect(after).toMatchObject({ rating: 4.8, reviews: 113 });
    expect(after.revs).toEqual([...before.revs, { n: 'Riya S', r: 1, c: 'Late' }]);
  });
});

describe('consultation messages', () => {
  it('shows a sent message at once, sends it to the server, and counts and clears unread', () => {
    patchServerData({ messages: [{ id: 'm1', caseId: 'c1', senderRole: 'lawyer', senderId: '1', text: 'Hi', createdAt: '2026-01-01T00:00:00Z', readAt: null }] });
    expect(getUnreadCountForCase('c1', 'client')).toBe(1);
    expect(getUnreadCountForCase('c1', 'lawyer')).toBe(0);
    sendMessage({ caseId: 'c1', senderId: 'a@x.in', senderRole: 'client', text: '  Thanks  ' });
    expect(getMessagesForCase('c1').map((m) => m.text)).toEqual(['Hi', 'Thanks']);
    expect(fetch).toHaveBeenCalledWith('/api/data/messages', expect.objectContaining({ body: JSON.stringify({ caseId: 'c1', text: 'Thanks' }) }));
    expect(markCaseMessagesRead('c1', 'client')).toBe(true);
    expect(getUnreadCountForCase('c1', 'client')).toBe(0);
    expect(markCaseMessagesRead('c1', 'client')).toBe(false); // nothing left: no second request
    expect(fetch.mock.calls.filter(([url]) => url === '/api/data/messages/read')).toHaveLength(1);
  });
});

describe('right to erasure', () => {
  it("removes a deleted account's bookings, messages and reviews from this browser's copy", () => {
    patchServerData({
      clients: [{ role: 'client', name: 'Riya S', email: 'riya@x.in' }],
      appointments: [{ appointmentId: 'apt1', clientId: 'riya@x.in', lawyerId: 2, lawyerName: 'Adv. Farhan Sheikh', fee: 1500, createdAt: '2026-01-01' }],
      cases: [{ caseId: 'c1', appointmentId: 'apt1', clientId: 'riya@x.in', lawyerId: 2, status: 'CLOSED', createdAt: '2026-01-01' }],
      messages: [{ id: 'm1', caseId: 'c1', senderRole: 'client', text: 'x', createdAt: '2026-01-01' }],
    });
    expect(getClientAccountByEmail('RIYA@x.in')).toMatchObject({ name: 'Riya S' });
    submitReview({ appointmentId: 'apt1', caseId: 'c1', lawyerId: 2, clientId: 'riya@x.in', clientName: 'Riya S', rating: 5, reviewText: 'my divorce case' });
    expect(getReviewForAppointment('apt1')).toMatchObject({ rating: 5 });
    expect(submitReview({ appointmentId: 'apt1', caseId: 'c1', lawyerId: 2, clientId: 'riya@x.in', clientName: 'Riya S', rating: 4 })).toBeNull(); // once only
    deleteClientDataLocally('riya@x.in');
    expect(getAppointmentsForClient('riya@x.in')).toEqual([]);
    expect(getMessagesForCase('c1')).toEqual([]);
    expect(getReviewForAppointment('apt1')).toBeNull();
  });
});

describe('browser storage', () => {
  it('removes the old browser copies of moved data, including the old password list', async () => {
    const legacy = [
      'lawyerup_mock_accounts',
      'lawyerup_mock_lawyer_applications',
      'lawyerup_mock_appointments',
      'lawyerup_mock_cases',
      'lawyerup_mock_availability',
      'lawyerup_mock_messages',
      'lawyerup_mock_reviews',
      'lawyerup_client_profiles',
    ];
    for (const key of legacy) localStorage.setItem(key, '[{"email":"a@x.in","passwordObfuscated":"cGFzcw=="}]');
    vi.resetModules();
    await import('../src/services/mockAuthStore.js');
    await import('../src/services/mockLawyerStore.js');
    for (const key of legacy) expect(localStorage.getItem(key)).toBeNull();
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
