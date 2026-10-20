import { useState } from 'react';
import { findMarketplaceLawyerById } from '../services/mockLawyerStore.js';
import { createAppointment } from '../services/mockAppointmentStore.js';
import { createCaseForAppointment } from '../services/mockCaseStore.js';
import {
  claimAvailabilitySlot,
  attachAppointmentToSlot,
  getSlotById,
  formatSlotDateForRecord,
} from '../services/mockAvailabilityStore.js';
import { useAppState, useAppDispatch } from '../context/AppContext.jsx';
import { useShowToast } from '../hooks/useToast.js';
import { useTranslation } from '../hooks/useTranslation.js';

const PLATFORM_FEE = 49;

export default function BookingCheckoutModal({ lawyerId, slotId, slotLabel, consultationType, city }) {
  const { user } = useAppState();
  const dispatch = useAppDispatch();
  const showToast = useShowToast();
  const { t } = useTranslation();
  const [caseSummary, setCaseSummary] = useState('');

  const lawyer = findMarketplaceLawyerById(lawyerId);
  if (!lawyer) return null;

  const modeLabel = consultationType === 'in_person' ? t('consultation.inPerson') : t('consultation.online');

  function handlePay() {
    if (user?.role !== 'client') {
      showToast(t('toast.lawyerCannotBook'));
      dispatch({ type: 'CLOSE_MODAL' });
      return;
    }
    // Read the slot's date before claiming it. The appointment used to be
    // saved with date: 'Today' regardless of the slot, so a booking for next
    // week showed as "Today" in Bookings and on the lawyer's dashboard.
    const slot = getSlotById(slotId);
    // Claim the slot FIRST, before creating anything — if this fails (someone
    // else booked it a moment ago, or it slipped into the past while this
    // checkout screen was open), no Appointment/Case is ever created for a
    // slot we don't actually hold. See mockAvailabilityStore.js's header
    // comment for exactly what this claim does and doesn't guarantee.
    const claimed = claimAvailabilitySlot(slotId);
    if (!claimed) {
      showToast(t('availability.slotTaken'));
      dispatch({ type: 'CLOSE_MODAL' });
      return;
    }

    // Appointment first (the booking itself), then a Case that references
    // it — kept as two separate records on purpose: a client may need a
    // second, unrelated appointment with the same lawyer later, and that
    // must become its OWN case with its OWN chat, never merged into this
    // one. See services/mockCaseStore.js.
    const appointment = createAppointment({
      clientId: user.email,
      lawyerId: lawyer.id,
      lawyerName: lawyer.name,
      categorySlug: lawyer.cats[0],
      consultationType,
      date: slot ? formatSlotDateForRecord(slot.date) : '—',
      time: slotLabel,
      city, // city NAME only — never coordinates, see mockLocationService.js
      fee: lawyer.fee,
      platformFee: PLATFORM_FEE,
      caseSummary: caseSummary.trim() || null,
    });
    attachAppointmentToSlot(slotId, appointment.appointmentId);
    const newCase = createCaseForAppointment(appointment);

    dispatch({
      type: 'OPEN_MODAL',
      payload: { type: 'bookingConfirm', payload: { lawyerName: lawyer.name, slot: slotLabel, caseId: newCase.caseId } },
    });
    showToast(t('toast.bookingSuccess'));
  }

  return (
    <>
      <button className="modal-close" onClick={() => dispatch({ type: 'CLOSE_MODAL' })}>
        &#10005;
      </button>

      <div className="section-label tight">{t('booking.confirmTitle')}</div>
      <div className="bio-text" style={{ marginBottom: 6 }}>
        <b>{lawyer.name}</b>
        <br />
        {t('booking.summaryLine', { slot: slotLabel, mode: modeLabel })}
        {consultationType === 'in_person' && city && (
          <>
            <br />
            {t('location.meetingCity', { city })}
          </>
        )}
      </div>

      <div className="fee-line">
        <span>{t('booking.consultationFee')}</span>
        <span className="mono">&#8377;{lawyer.fee}</span>
      </div>
      <div className="fee-line">
        <span>{t('booking.platformFee')}</span>
        <span className="mono">&#8377;{PLATFORM_FEE}</span>
      </div>
      <div className="fee-line total">
        <span>{t('booking.totalPayable')}</span>
        <span className="mono">&#8377;{lawyer.fee + PLATFORM_FEE}</span>
      </div>

      <div className="section-label">{t('booking.caseSummaryLabel')}</div>
      <textarea
        placeholder={t('booking.caseSummaryPlaceholder')}
        value={caseSummary}
        onChange={(e) => setCaseSummary(e.target.value)}
        style={{
          width: '100%',
          minHeight: 70,
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: 12,
          fontFamily: 'inherit',
          fontSize: 13,
          resize: 'none',
          background: 'var(--surface)',
        }}
      />

      <button className="book-btn" onClick={handlePay}>
        {t('booking.payButton', { amount: lawyer.fee + PLATFORM_FEE })}
      </button>
      <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--ink-faint)', marginTop: 10 }}>
        {t('booking.demoNote')}
      </p>
    </>
  );
}
