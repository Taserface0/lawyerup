import { initials } from '../lib/utils.js';
import { useAppDispatch } from '../context/AppContext.jsx';
import { useTranslation } from '../hooks/useTranslation.js';
import { getAppointmentById } from '../services/mockAppointmentStore.js';
import { getCaseByAppointmentId } from '../services/mockCaseStore.js';

export default function BookingDetailModal({ appointmentId }) {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();

  const appointment = getAppointmentById(appointmentId);
  if (!appointment) return null;

  const relatedCase = getCaseByAppointmentId(appointmentId);
  const categoryLabel = appointment.categorySlug ? t(`category.${appointment.categorySlug}`) : '—';
  const typeLabel =
    appointment.consultationType === 'in_person' ? t('consultation.inPerson') : t('consultation.online');
  const statusKey = appointment.status.toLowerCase();

  function openConsultation() {
    dispatch({ type: 'CLOSE_MODAL' });
    dispatch({ type: 'SET_ACTIVE_CASE_ORIGIN', payload: 'bookings' });
    dispatch({ type: 'SET_ACTIVE_CASE', payload: relatedCase.caseId });
    dispatch({ type: 'SET_SCREEN', payload: 'consultation' });
  }

  return (
    <>
      <button className="modal-close" onClick={() => dispatch({ type: 'CLOSE_MODAL' })}>
        &#10005;
      </button>

      <div className="section-label tight">{t('bookingDetail.title')}</div>
      <div className="profile-head" style={{ marginTop: 4 }}>
        <div className="avatar">{initials(appointment.lawyerName)}</div>
        <div>
          <h2 style={{ fontSize: 16 }}>{appointment.lawyerName}</h2>
          <p>{categoryLabel}</p>
        </div>
      </div>

      <div className="detail-row">
        <span>{t('bookingDetail.status')}</span>
        <span>
          <span className={`status-tag status-${statusKey}`}>{t(`status.${statusKey}`)}</span>
        </span>
      </div>
      <div className="detail-row">
        <span>{t('bookingDetail.date')}</span>
        <span>{appointment.date}</span>
      </div>
      <div className="detail-row">
        <span>{t('bookingDetail.timeSlot')}</span>
        <span>{appointment.time}</span>
      </div>
      <div className="detail-row">
        <span>{t('consultation.typeLabel')}</span>
        <span>{typeLabel}</span>
      </div>
      {appointment.consultationType === 'in_person' && appointment.city && (
        <div className="detail-row">
          <span>{t('location.cityLabel')}</span>
          <span>{appointment.city}</span>
        </div>
      )}
      <div className="detail-row">
        <span>{t('bookingDetail.consultationFee')}</span>
        <span className="mono">&#8377;{appointment.fee}</span>
      </div>
      <div className="detail-row">
        <span>{t('bookingDetail.platformFee')}</span>
        <span className="mono">&#8377;{appointment.platformFee || 0}</span>
      </div>
      <div className="detail-row">
        <span>{t('bookingDetail.totalPaid')}</span>
        <span className="mono">
          <b>&#8377;{appointment.fee + (appointment.platformFee || 0)}</b>
        </span>
      </div>

      <div className="section-label tight">{t('bookingDetail.caseSummary')}</div>
      <p className="bio-text" style={{ marginBottom: 6 }}>
        {appointment.caseSummary || t('bookingDetail.noDetails')}
      </p>

      {relatedCase && (
        <button className="book-btn" onClick={openConsultation}>
          {t('consultation.openMyConsultation')}
        </button>
      )}
      <button className="book-btn secondary" style={{ marginTop: 8 }} onClick={() => dispatch({ type: 'CLOSE_MODAL' })}>
        {t('bookingDetail.close')}
      </button>
    </>
  );
}
