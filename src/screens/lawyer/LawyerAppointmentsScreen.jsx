import { useEffect, useState } from 'react';
import Icon from '../../icons/Icon.jsx';
import { useAppState, useAppDispatch } from '../../context/AppContext.jsx';
import { useTranslation } from '../../hooks/useTranslation.js';
import { getAppointmentsForLawyer } from '../../services/mockAppointmentStore.js';
import { getCaseByAppointmentId, CASES_STORAGE_KEY } from '../../services/mockCaseStore.js';
import { getClientAccountByEmail } from '../../services/mockAuthStore.js';
import { getUnreadCountForCase } from '../../services/mockMessageStore.js';

function AppointmentRow({ appt, onOpen, t }) {
  const clientAccount = getClientAccountByEmail(appt.clientId);
  const clientName = clientAccount?.name || appt.clientId;
  const statusKey = appt.status.toLowerCase();
  const caseRecord = getCaseByAppointmentId(appt.appointmentId);
  const unreadCount = caseRecord ? getUnreadCountForCase(caseRecord.caseId, 'lawyer') : 0;
  // Resolution-request indicator: a case can only ever be in ONE status at
  // a time, so deriving this directly from caseRecord.status — rather
  // than a separate "notifications" list — means there's structurally no
  // way to end up with two indicators for the same pending request. This
  // is completely separate from unreadCount above (message-based) and
  // never touches it — a resolution request is not a chat message and
  // does not create one. See mockCaseStore.js's requestCaseResolution().
  const needsResolution = caseRecord?.status === 'CLIENT_REQUESTED_RESOLUTION';
  const typeLabel = appt.consultationType === 'in_person' ? t('consultation.inPerson') : t('consultation.online');

  return (
    <div className={`booking-card ${needsResolution ? 'needs-resolution' : ''}`} onClick={() => onOpen(appt.appointmentId)}>
      <div className="booking-top">
        <b>{clientName}</b>
        <span className={`status-tag status-${statusKey}`}>{t(`status.${statusKey}`)}</span>
      </div>
      <div className="lw-tags">
        {t(`category.${appt.categorySlug}`)} · {typeLabel}
        {appt.consultationType === 'in_person' && appt.city && <> · {appt.city}</>}
        {unreadCount > 0 && (
          <span className="unread-dot-badge">{t('consultation.unreadCount', { count: unreadCount })}</span>
        )}
        {needsResolution && (
          <span className="resolution-badge">{t('consultation.caseStatus.client_requested_resolution')}</span>
        )}
      </div>
      <div className="booking-date">
        {appt.date} · {appt.time}
      </div>
    </div>
  );
}

export default function LawyerAppointmentsScreen() {
  const { user } = useAppState();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  // Bumped on a cross-tab case-status change (see the effect below) purely
  // to force a re-render — appointments/case lookups below are all
  // derived fresh from localStorage on every render, not cached in state,
  // so a re-render is all that's needed to pick up a status change made
  // in another tab (e.g. the client requesting resolution from their own
  // tab while the lawyer already has this list open here).
  const [, setRefreshTick] = useState(0);

  useEffect(() => {
    function handleStorageEvent(event) {
      // Scoped to case-status changes only — this list screen's existing
      // unread-MESSAGE badges (getUnreadCountForCase above) are untouched
      // and unchanged by this listener; extending their own cross-tab
      // liveness on this screen is a separate concern not part of this
      // fix. See mockCaseStore.js / ConsultationScreen.jsx for the same
      // storage-event pattern this reuses.
      if (event.key === CASES_STORAGE_KEY) {
        setRefreshTick((tick) => tick + 1);
      }
    }
    window.addEventListener('storage', handleStorageEvent);
    return () => window.removeEventListener('storage', handleStorageEvent);
  }, []);

  const appointments = user ? getAppointmentsForLawyer(user.id) : [];

  // Same Active/Past grouping logic as BookingsScreen.jsx, mirrored for
  // the lawyer's side of the same case data.
  const active = [];
  const past = [];
  for (const appt of appointments) {
    const caseRecord = getCaseByAppointmentId(appt.appointmentId);
    if (caseRecord?.status === 'CLOSED') past.push(appt);
    else active.push(appt);
  }

  function openConsultation(appointmentId) {
    const caseRecord = getCaseByAppointmentId(appointmentId);
    if (!caseRecord) return;
    dispatch({ type: 'SET_ACTIVE_CASE_ORIGIN', payload: 'lawyerAppointments' });
    dispatch({ type: 'SET_ACTIVE_CASE', payload: caseRecord.caseId });
    dispatch({ type: 'SET_SCREEN', payload: 'consultation' });
  }

  return (
    <div className="screen active">
      <div className="section-label" style={{ marginTop: 16 }}>
        {t('lawyerDashboard.appointmentsTitle')}
      </div>

      {appointments.length === 0 ? (
        <div className="empty-state">
          <Icon name="calendar" />
          <p>{t('lawyerDashboard.noAppointments')}</p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <>
              <div className="section-label tight">{t('lawyerDashboard.activeLabel')}</div>
              {active.map((appt) => (
                <AppointmentRow key={appt.appointmentId} appt={appt} onOpen={openConsultation} t={t} />
              ))}
            </>
          )}
          {past.length > 0 && (
            <>
              <div className="section-label">{t('lawyerDashboard.pastLabel')}</div>
              {past.map((appt) => (
                <AppointmentRow key={appt.appointmentId} appt={appt} onOpen={openConsultation} t={t} />
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
