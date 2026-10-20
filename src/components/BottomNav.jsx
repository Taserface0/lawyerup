import { useEffect, useState } from 'react';
import { useAppState, useAppDispatch } from '../context/AppContext.jsx';
import { useTranslation } from '../hooks/useTranslation.js';
import Icon from '../icons/Icon.jsx';
import { getAppointmentsForClient, getAppointmentsForLawyer } from '../services/mockAppointmentStore.js';
import { getCaseByAppointmentId } from '../services/mockCaseStore.js';
import { getUnreadCountForCase, MESSAGES_STORAGE_KEY } from '../services/mockMessageStore.js';

// Default nav: shown when signed out, or signed in as a client.
// "Find an Advocate" moved off the bottom nav in favor of a first-class
// Messages destination — lawyer discovery itself is untouched, still
// reachable from Home (see HomeScreen.jsx) and still uses the exact same
// 'lawyers' screen key/component, just no longer as a nav-tab shortcut.
const CLIENT_NAV_ITEMS = [
  { screen: 'home', icon: 'home', key: 'nav.home' },
  { screen: 'chat', icon: 'chat', key: 'nav.chat' },
  { screen: 'messages', icon: 'mail', key: 'nav.messages' },
  { screen: 'bookings', icon: 'calendar', key: 'nav.bookings' },
  { screen: 'profile', icon: 'user', key: 'nav.profile' },
];

// Lawyers get their own dashboard instead — no "Find an Advocate," no
// client "Ask AI"/"Bookings" concepts. Settings moved into Profile (see
// LawyerProfileScreen.jsx) rather than staying a separate tab — it's
// still registered in App.jsx as a drill-down screen, just no longer
// reachable directly from the nav bar.
const LAWYER_NAV_ITEMS = [
  { screen: 'lawyerAppointments', icon: 'calendar', key: 'nav.appointments' },
  { screen: 'messages', icon: 'mail', key: 'nav.messages' },
  { screen: 'lawyerClients', icon: 'user', key: 'nav.clients' },
  { screen: 'lawyerVerification', icon: 'shield', key: 'nav.verification' },
  { screen: 'lawyerProfile', icon: 'briefcase', key: 'nav.profile' },
];

// Same aggregation MessagesScreen.jsx already does per-row (appointments
// -> case -> getUnreadCountForCase), just summed here instead of listed.
// No new store, no new counter — this reads the exact same data through
// the exact same existing function. Deliberately does NOT factor in case
// status/CLIENT_REQUESTED_RESOLUTION at all — resolution requests are a
// separate concept from unread messages and must never inflate this number.
function getTotalUnreadCount(user) {
  if (!user) return 0;
  const viewerRole = user.role === 'lawyer' ? 'lawyer' : 'client';
  const appointments = viewerRole === 'lawyer' ? getAppointmentsForLawyer(user.id) : getAppointmentsForClient(user.email);
  return appointments.reduce((total, appt) => {
    const caseRecord = getCaseByAppointmentId(appt.appointmentId);
    if (!caseRecord) return total;
    return total + getUnreadCountForCase(caseRecord.caseId, viewerRole);
  }, 0);
}

function formatBadgeCount(n) {
  return n > 99 ? '99+' : String(n);
}

export default function BottomNav() {
  const { screen, activeCaseOrigin, user } = useAppState();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  // Bumped on a MESSAGES_STORAGE_KEY storage event (see the effect below)
  // purely to force a re-render — getTotalUnreadCount() re-derives fresh
  // from localStorage on every render rather than being cached in state,
  // so a re-render is all that's needed to pick up a message sent/read in
  // another tab. Same pattern already used by ConsultationScreen and the
  // list screens; not a new reactivity mechanism.
  const [, setRefreshTick] = useState(0);

  useEffect(() => {
    function handleStorageEvent(event) {
      if (event.key === MESSAGES_STORAGE_KEY) {
        setRefreshTick((tick) => tick + 1);
      }
    }
    window.addEventListener('storage', handleStorageEvent);
    return () => window.removeEventListener('storage', handleStorageEvent);
  }, []);

  const items = user?.role === 'lawyer' ? LAWYER_NAV_ITEMS : CLIENT_NAV_ITEMS;
  // ConsultationScreen is a drill-down screen, not a nav tab — while it's
  // open, highlight whichever tab actually navigated into it (see
  // activeCaseOrigin in AppContext.jsx) instead of highlighting nothing.
  // Falls back to `screen` itself for every normal nav-tab screen,
  // unchanged from before.
  const highlightedScreen = screen === 'consultation' ? activeCaseOrigin : screen;
  const unreadCount = getTotalUnreadCount(user);

  return (
    <div className="bottom-nav">
      {items.map((item) => (
        <button
          key={item.screen}
          className={`nav-item ${highlightedScreen === item.screen ? 'active' : ''}`}
          onClick={() => dispatch({ type: 'SET_SCREEN', payload: item.screen })}
        >
          <span className="nav-icon-wrap">
            <Icon name={item.icon} />
            {item.screen === 'messages' && unreadCount > 0 && (
              <span className="nav-badge">{formatBadgeCount(unreadCount)}</span>
            )}
          </span>
          <span>{t(item.key)}</span>
        </button>
      ))}
    </div>
  );
}
