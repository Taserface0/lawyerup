import { useState } from 'react';
import Icon from '../../icons/Icon.jsx';
import { initials } from '../../lib/utils.js';
import BookingCard from '../../components/BookingCard.jsx';
import { useAppState, useAppDispatch } from '../../context/AppContext.jsx';
import { useShowToast } from '../../hooks/useToast.js';
import { useTranslation } from '../../hooks/useTranslation.js';
import { getClientAccountByEmail, deleteClientAccountCompletely } from '../../services/mockAuthStore.js';
import { getAppointmentsForClient } from '../../services/mockAppointmentStore.js';

export default function AccountView() {
  const { user, theme } = useAppState();
  const dispatch = useAppDispatch();
  const showToast = useShowToast();
  const { t } = useTranslation();

  // Re-fetch fresh in case an admin force-approved KYC after login — user
  // in context is just the snapshot from sign-in time.
  const [profile] = useState(() => getClientAccountByEmail(user.email) || user);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Appointments moved to the persistent mockAppointmentStore in Phase 1
  // (see AppContext.jsx) — `bookings` no longer exists on context state at
  // all, which is what made this undefined. Read the same way
  // BookingsScreen.jsx already does. Array.isArray guards against the
  // (currently theoretical) case of the store returning something
  // unexpected, the same defensive style already used around localStorage
  // reads elsewhere in the services layer.
  const appointments = getAppointmentsForClient(user.email);
  const recent = Array.isArray(appointments) ? appointments.slice(0, 3) : [];

  function logout() {
    dispatch({ type: 'LOGOUT' });
    showToast(t('toast.signedOut'));
  }

  // Right to erasure (DPDP Act, 2023 s.12): clients can delete their own
  // account and data. Previously only the dev-only admin screen could.
  function deleteAccount() {
    deleteClientAccountCompletely(user.email);
    dispatch({ type: 'LOGOUT' });
    showToast(t('toast.accountDeleted'));
  }

  return (
    <>
      <div className="section-label" style={{ marginTop: 16 }}>
        {t('account.sectionTitle')}
      </div>
      <div className="profile-card">
        <div className="profile-head">
          <div className="avatar">{initials(profile.name)}</div>
          <div>
            <h2>{profile.name}</h2>
            <p>{profile.city}</p>
          </div>
        </div>
        <div className="profile-line">
          <Icon name="phone" />
          <span>+91 {profile.phone}</span>
        </div>
        <div className="profile-line">
          <Icon name="mail" />
          <span>{profile.email}</span>
        </div>
        <div className="profile-line">
          <Icon name="pin" />
          <span>{profile.city}</span>
        </div>
        <div className="profile-line">
          <Icon name="shield" />
          <span>
            {t('account.kycLabel')}{' '}
            <span className={`status-tag status-${profile.kycStatus || 'pending'}`}>
              {t(`account.kyc.${profile.kycStatus || 'pending'}`)}
            </span>
          </span>
        </div>
      </div>

      <div className="section-label">
        <span>{t('account.historyTitle')}</span>
        <span className="link" onClick={() => dispatch({ type: 'SET_SCREEN', payload: 'bookings' })}>
          {t('account.viewAll')}
        </span>
      </div>
      {recent.length ? (
        <div>
          {recent.map((a) => (
            <BookingCard key={a.appointmentId} appointment={a} />
          ))}
        </div>
      ) : (
        <div className="empty-state" style={{ padding: '30px 20px' }}>
          <Icon name="receipt" />
          <p>{t('account.noAppointments')}</p>
        </div>
      )}

      <div className="section-label">{t('account.preferences')}</div>
      <div className="theme-row">
        <div className="theme-row-left">
          <Icon name="sun" />
          <span>{t('account.appearance')}</span>
        </div>
        <div className="seg-control">
          <div className={`seg-btn ${theme === 'light' ? 'active' : ''}`} onClick={() => dispatch({ type: 'SET_THEME', payload: 'light' })}>
            <Icon name="sun" /> {t('account.light')}
          </div>
          <div className={`seg-btn ${theme === 'dark' ? 'active' : ''}`} onClick={() => dispatch({ type: 'SET_THEME', payload: 'dark' })}>
            <Icon name="moon" /> {t('account.dark')}
          </div>
        </div>
      </div>

      <div className="menu-row" role="button" tabIndex={0} onClick={() => dispatch({ type: 'SET_SCREEN', payload: 'legal' })}>
        <div className="menu-row-left">
          <Icon name="shield" />
          <span>{t('account.legalLink')}</span>
        </div>
        <Icon name="chevron" />
      </div>
      <button className="logout-btn" onClick={logout}>
        {t('account.signOut')}
      </button>
      {confirmingDelete ? (
        <div className="profile-card" style={{ marginTop: 14 }}>
          <p style={{ fontSize: 12.5, color: 'var(--danger)', margin: '0 0 10px' }}>{t('account.deleteConfirmBody')}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="book-btn compact" style={{ background: 'var(--danger)' }} onClick={deleteAccount}>
              {t('account.deleteConfirmButton')}
            </button>
            <button className="book-btn compact secondary" onClick={() => setConfirmingDelete(false)}>
              {t('account.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="link-btn"
          style={{ display: 'block', margin: '14px auto 24px', color: 'var(--danger)' }}
          onClick={() => setConfirmingDelete(true)}
        >
          {t('account.deleteAccount')}
        </button>
      )}
    </>
  );
}
