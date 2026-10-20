import { useEffect, useState } from 'react';
import Icon from '../../icons/Icon.jsx';
import { initials } from '../../lib/utils.js';
import { useAppState, useAppDispatch } from '../../context/AppContext.jsx';
import { useTranslation } from '../../hooks/useTranslation.js';
import { getAppointmentsForLawyer } from '../../services/mockAppointmentStore.js';
import { getCaseByAppointmentId, CASES_STORAGE_KEY } from '../../services/mockCaseStore.js';
import { getClientAccountByEmail } from '../../services/mockAuthStore.js';

function deriveClients(appointments) {
  const byClientId = new Map();
  for (const appt of appointments) {
    if (!byClientId.has(appt.clientId)) {
      byClientId.set(appt.clientId, { clientId: appt.clientId, appointmentCount: 0, lastCategorySlug: appt.categorySlug, lastAppointment: appt });
    }
    const entry = byClientId.get(appt.clientId);
    entry.appointmentCount += 1;
    // appointments already come sorted newest-first from getAppointmentsForLawyer
    if (new Date(appt.createdAt) > new Date(entry.lastAppointment.createdAt)) {
      entry.lastAppointment = appt;
      entry.lastCategorySlug = appt.categorySlug;
    }
  }
  return Array.from(byClientId.values());
}

export default function LawyerClientsScreen() {
  const { user } = useAppState();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  // Same cross-tab pattern as LawyerAppointmentsScreen.jsx — see that
  // file's comment for the full reasoning. Scoped to case-status changes
  // only; this screen's own read logic below is untouched otherwise.
  const [, setRefreshTick] = useState(0);

  useEffect(() => {
    function handleStorageEvent(event) {
      if (event.key === CASES_STORAGE_KEY) {
        setRefreshTick((tick) => tick + 1);
      }
    }
    window.addEventListener('storage', handleStorageEvent);
    return () => window.removeEventListener('storage', handleStorageEvent);
  }, []);

  const appointments = user ? getAppointmentsForLawyer(user.id) : [];
  const clients = deriveClients(appointments);

  function openMostRecentCase(clientEntry) {
    const caseRecord = getCaseByAppointmentId(clientEntry.lastAppointment.appointmentId);
    if (!caseRecord) return;
    dispatch({ type: 'SET_ACTIVE_CASE_ORIGIN', payload: 'lawyerClients' });
    dispatch({ type: 'SET_ACTIVE_CASE', payload: caseRecord.caseId });
    dispatch({ type: 'SET_SCREEN', payload: 'consultation' });
  }

  return (
    <div className="screen active">
      <div className="section-label" style={{ marginTop: 16 }}>
        {t('lawyerDashboard.clientsTitle')}
      </div>

      {clients.length === 0 ? (
        <div className="empty-state">
          <Icon name="user" />
          <p>{t('lawyerDashboard.noClients')}</p>
        </div>
      ) : (
        clients.map((c) => {
          const clientAccount = getClientAccountByEmail(c.clientId);
          const name = clientAccount?.name || c.clientId;
          const caseRecord = getCaseByAppointmentId(c.lastAppointment.appointmentId);
          const needsResolution = caseRecord?.status === 'CLIENT_REQUESTED_RESOLUTION';
          return (
            <div className={`lawyer-card ${needsResolution ? 'needs-resolution' : ''}`} key={c.clientId} onClick={() => openMostRecentCase(c)}>
              <div className="avatar">{initials(name)}</div>
              <div className="lw-body">
                <div className="lw-name-row">
                  <b>{name}</b>
                </div>
                <div className="lw-tags">
                  {t(`category.${c.lastCategorySlug}`)}
                  {needsResolution && (
                    <span className="resolution-badge">{t('consultation.caseStatus.client_requested_resolution')}</span>
                  )}
                </div>
                <div className="lw-meta">
                  <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                    {t('lawyerDashboard.appointmentsCount', { count: c.appointmentCount })}
                  </span>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
