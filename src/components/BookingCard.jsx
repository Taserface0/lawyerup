import { useAppDispatch } from '../context/AppContext.jsx';
import { useTranslation } from '../hooks/useTranslation.js';
import { getCaseByAppointmentId } from '../services/mockCaseStore.js';
import { getUnreadCountForCase } from '../services/mockMessageStore.js';

export default function BookingCard({ appointment }) {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();

  function openDetail() {
    dispatch({ type: 'OPEN_MODAL', payload: { type: 'bookingDetail', payload: { appointmentId: appointment.appointmentId } } });
  }

  const categoryLabel = appointment.categorySlug ? t(`category.${appointment.categorySlug}`) : '';
  const typeLabel =
    appointment.consultationType === 'in_person' ? t('consultation.inPerson') : t('consultation.online');
  const statusKey = appointment.status.toLowerCase();

  const relatedCase = getCaseByAppointmentId(appointment.appointmentId);
  const unreadCount = relatedCase ? getUnreadCountForCase(relatedCase.caseId, 'client') : 0;

  return (
    <div className="booking-card" onClick={openDetail}>
      <div className="booking-top">
        <b>{appointment.lawyerName}</b>
        <span className={`status-tag status-${statusKey}`}>{t(`status.${statusKey}`)}</span>
      </div>
      <div className="lw-tags">
        {categoryLabel} · {typeLabel}
        {unreadCount > 0 && (
          <span className="unread-dot-badge">{t('consultation.unreadCount', { count: unreadCount })}</span>
        )}
      </div>
      <div className="lw-meta">
        <div className="lw-fee mono">
          &#8377;{appointment.fee + (appointment.platformFee || 0)} {t('bookings.paidSuffix')}
        </div>
        <div className="booking-date">
          {appointment.date} · {appointment.time}
        </div>
      </div>
    </div>
  );
}
