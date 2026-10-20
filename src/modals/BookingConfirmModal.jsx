import Icon from '../icons/Icon.jsx';
import { useAppDispatch } from '../context/AppContext.jsx';
import { useTranslation } from '../hooks/useTranslation.js';

export default function BookingConfirmModal({ lawyerName, date, slot, caseId }) {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();

  function viewBookings() {
    dispatch({ type: 'CLOSE_MODAL' });
    dispatch({ type: 'SET_SCREEN', payload: 'bookings' });
  }

  function openConsultation() {
    dispatch({ type: 'CLOSE_MODAL' });
    dispatch({ type: 'SET_ACTIVE_CASE_ORIGIN', payload: 'bookings' });
    dispatch({ type: 'SET_ACTIVE_CASE', payload: caseId });
    dispatch({ type: 'SET_SCREEN', payload: 'consultation' });
  }

  return (
    <>
      <button className="modal-close" onClick={() => dispatch({ type: 'CLOSE_MODAL' })}>
        &#10005;
      </button>
      <div className="confirm-check">
        <Icon name="checkBig" />
      </div>
      <h2 style={{ textAlign: 'center', fontFamily: "'Source Serif 4',serif", fontWeight: 600, margin: '0 0 6px' }}>
        {t('booking.confirmedTitle')}
      </h2>
      <p style={{ textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13.5, margin: '0 0 22px' }}>
        {t('booking.confirmedLine', { lawyerName, date, slot })}
        <br />
        {t('booking.whatsappNote')}
      </p>
      <button className="book-btn" onClick={openConsultation}>
        {t('consultation.openMyConsultation')}
      </button>
      <button className="book-btn secondary" style={{ marginTop: 8 }} onClick={viewBookings}>
        {t('booking.viewBookings')}
      </button>
    </>
  );
}
