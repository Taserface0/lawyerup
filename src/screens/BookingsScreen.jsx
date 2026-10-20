import Icon from '../icons/Icon.jsx';
import BookingCard from '../components/BookingCard.jsx';
import { useAppState } from '../context/AppContext.jsx';
import { useTranslation } from '../hooks/useTranslation.js';
import { getAppointmentsForClient } from '../services/mockAppointmentStore.js';
import { getCaseByAppointmentId } from '../services/mockCaseStore.js';

export default function BookingsScreen() {
  const { user } = useAppState();
  const { t } = useTranslation();

  // Read fresh on every render (cheap, small arrays) rather than through
  // context — appointments are shared/persisted data (see
  // mockAppointmentStore.js), the same pattern AdminScreen already uses for
  // lawyer applications.
  const appointments = user ? getAppointmentsForClient(user.email) : [];

  // Group by the CASE's resolution status, not the appointment's own
  // status — "Active" here means the legal matter is still open
  // (including while a resolution request is pending confirmation);
  // "Past" means the case has been CLOSED by mutual agreement. See
  // mockCaseStore.js for the full resolution lifecycle.
  const active = [];
  const past = [];
  for (const a of appointments) {
    const caseRecord = getCaseByAppointmentId(a.appointmentId);
    if (caseRecord?.status === 'CLOSED') past.push(a);
    else active.push(a);
  }

  return (
    <div className="screen active">
      <div className="section-label" style={{ marginTop: 16 }}>
        {t('bookings.sectionTitle')}
      </div>

      {appointments.length === 0 ? (
        <div className="empty-state">
          <Icon name="calendar" />
          <p>
            {t('bookings.emptyLine1')}
            <br />
            {t('bookings.emptyLine2')}
          </p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <>
              <div className="section-label tight">{t('bookings.activeLabel')}</div>
              {active.map((a) => (
                <BookingCard key={a.appointmentId} appointment={a} />
              ))}
            </>
          )}
          {past.length > 0 && (
            <>
              <div className="section-label">{t('bookings.pastLabel')}</div>
              {past.map((a) => (
                <BookingCard key={a.appointmentId} appointment={a} />
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
