import { useEffect, useState } from 'react';
import Icon from '../icons/Icon.jsx';
import { useAppState, useAppDispatch } from '../context/AppContext.jsx';
import { useTranslation } from '../hooks/useTranslation.js';
import { getAppointmentsForClient, getAppointmentsForLawyer } from '../services/mockAppointmentStore.js';
import { getCaseByAppointmentId, CASES_STORAGE_KEY } from '../services/mockCaseStore.js';
import { getMessagesForCase, getUnreadCountForCase, MESSAGES_STORAGE_KEY } from '../services/mockMessageStore.js';
import { getClientAccountByEmail } from '../services/mockAuthStore.js';

// This screen introduces NO new storage and NO new derivation logic — for
// either role, it's a different VIEW over the exact same case/message/
// appointment data BookingsScreen.jsx / LawyerAppointmentsScreen.jsx
// already read, just sorted by recent activity and labeled for a
// conversation-first context. getUnreadCountForCase() and the
// CLIENT_REQUESTED_RESOLUTION status check are the same functions/fields
// every other screen already uses — only the viewerRole passed to
// getUnreadCountForCase() and which name gets displayed (the OTHER
// participant's) differ by role.
export default function MessagesScreen() {
  const { user } = useAppState();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const [, setRefreshTick] = useState(0);

  // Same cross-tab pattern already established on the lawyer list screens
  // and ConsultationScreen — reacting to both keys here means a message
  // arriving, or a resolution request being made/withdrawn in another
  // tab, updates this list without needing a manual refresh.
  useEffect(() => {
    function handleStorageEvent(event) {
      if (event.key === CASES_STORAGE_KEY || event.key === MESSAGES_STORAGE_KEY) {
        setRefreshTick((tick) => tick + 1);
      }
    }
    window.addEventListener('storage', handleStorageEvent);
    return () => window.removeEventListener('storage', handleStorageEvent);
  }, []);

  const viewerRole = user?.role === 'lawyer' ? 'lawyer' : 'client';
  const appointments = !user ? [] : viewerRole === 'lawyer' ? getAppointmentsForLawyer(user.id) : getAppointmentsForClient(user.email);

  const conversations = appointments
    .map((appt) => {
      const caseRecord = getCaseByAppointmentId(appt.appointmentId);
      if (!caseRecord) return null;
      const messages = getMessagesForCase(caseRecord.caseId);
      const latest = messages.length ? messages[messages.length - 1] : null;
      // The OTHER participant's name — a client's Messages list shows the
      // lawyer's name (already on the appointment record); a lawyer's
      // list shows the client's name (looked up the same way
      // LawyerAppointmentsScreen.jsx already does).
      const counterpartName =
        viewerRole === 'lawyer' ? getClientAccountByEmail(appt.clientId)?.name || appt.clientId : appt.lawyerName;
      return {
        appointment: appt,
        caseRecord,
        counterpartName,
        latestMessage: latest,
        unreadCount: getUnreadCountForCase(caseRecord.caseId, viewerRole),
        needsResolution: caseRecord.status === 'CLIENT_REQUESTED_RESOLUTION',
        activityAt: latest ? latest.createdAt : caseRecord.createdAt,
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.activityAt) - new Date(a.activityAt));

  function openConversation(caseId) {
    dispatch({ type: 'SET_ACTIVE_CASE_ORIGIN', payload: 'messages' });
    dispatch({ type: 'SET_ACTIVE_CASE', payload: caseId });
    dispatch({ type: 'SET_SCREEN', payload: 'consultation' });
  }

  function formatTime(iso) {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  return (
    <div className="screen active">
      <div className="section-label" style={{ marginTop: 16 }}>
        {t('messages.title')}
      </div>

      {conversations.length === 0 ? (
        <div className="empty-state">
          <Icon name="mail" />
          <p>
            {t('messages.emptyLine1')}
            <br />
            {t('messages.emptyLine2')}
          </p>
        </div>
      ) : (
        conversations.map(({ appointment, caseRecord, counterpartName, latestMessage, unreadCount, needsResolution }) => (
          <div
            className={`booking-card ${needsResolution ? 'needs-resolution' : ''}`}
            key={caseRecord.caseId}
            onClick={() => openConversation(caseRecord.caseId)}
          >
            <div className="booking-top">
              <b>{counterpartName}</b>
              {latestMessage && <span className="booking-date">{formatTime(latestMessage.createdAt)}</span>}
            </div>
            <div className="lw-tags">
              {t(`category.${appointment.categorySlug}`)}
              {unreadCount > 0 && (
                <span className="unread-dot-badge">{t('consultation.unreadCount', { count: unreadCount })}</span>
              )}
              {needsResolution && (
                <span className="resolution-badge">{t('consultation.caseStatus.client_requested_resolution')}</span>
              )}
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '6px 0 0', fontWeight: unreadCount > 0 ? 600 : 400 }}>
              {latestMessage ? latestMessage.text : t('messages.noMessagesYet')}
            </p>
          </div>
        ))
      )}
    </div>
  );
}
