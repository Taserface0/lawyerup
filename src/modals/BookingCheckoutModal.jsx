import { useState } from 'react';
import { findMarketplaceLawyerById } from '../services/mockLawyerStore.js';
import { bookSlot } from '../services/mockAppointmentStore.js';
import { getSlotById, formatSlotDateForRecord } from '../services/mockAvailabilityStore.js';
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
  const [paying, setPaying] = useState(false);

  const lawyer = findMarketplaceLawyerById(lawyerId);
  if (!lawyer) return null;

  const modeLabel = consultationType === 'in_person' ? t('consultation.inPerson') : t('consultation.online');
  // The slot's real date: this line used to say "Today" whatever day was booked.
  const slot = getSlotById(slotId);
  const dateLabel = slot ? formatSlotDateForRecord(slot.date) : '';

  async function handlePay() {
    if (paying) return;
    if (user?.role !== 'client') {
      showToast(t('toast.lawyerCannotBook'));
      dispatch({ type: 'CLOSE_MODAL' });
      return;
    }
    // The server claims the slot and creates the Appointment and its Case
    // (two separate records on purpose, see services/mockCaseStore.js) in
    // one transaction. If someone else booked the slot a moment ago, or it
    // slipped into the past while this screen was open, nothing is created.
    // The date, fee and lawyer name are taken from the server's records.
    let newCase;
    let appointment;
    setPaying(true);
    try {
      ({ case: newCase, appointment } = await bookSlot({
        slotId,
        city, // city NAME only — never coordinates, see mockLocationService.js
        caseSummary: caseSummary.trim() || null,
      }));
    } catch (err) {
      setPaying(false);
      showToast(t(err.message === 'slot-unavailable' ? 'availability.slotTaken' : 'toast.actionFailed'));
      if (err.message === 'slot-unavailable') dispatch({ type: 'CLOSE_MODAL' });
      return;
    }

    dispatch({
      type: 'OPEN_MODAL',
      payload: { type: 'bookingConfirm', payload: { lawyerName: lawyer.name, date: appointment.date, slot: slotLabel, caseId: newCase.caseId } },
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
        {t('booking.summaryLine', { date: dateLabel, slot: slotLabel, mode: modeLabel })}
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

      <button className="book-btn" onClick={handlePay} disabled={paying}>
        {t('booking.payButton', { amount: lawyer.fee + PLATFORM_FEE })}
      </button>
      <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--ink-faint)', marginTop: 10 }}>
        {t('booking.demoNote')}
      </p>
    </>
  );
}
