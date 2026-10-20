import { useEffect, useState } from 'react';
import Icon from '../icons/Icon.jsx';
import { initials } from '../lib/utils.js';
import { useAppState, useAppDispatch } from '../context/AppContext.jsx';
import { useTranslation } from '../hooks/useTranslation.js';
import {
  getAllLawyerApplications,
  updateLawyerApplicationStatus,
} from '../services/mockLawyerStore.js';
import { deleteClientDataLocally } from '../services/mockAuthStore.js';
import { adminListClients, adminSetKycStatus, adminDeleteClient } from '../services/authApi.js';

const LAWYER_FILTERS = ['all', 'submitted', 'under_review', 'approved', 'rejected'];

export default function AdminScreen() {
  const { user } = useAppState();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();

  const [applications, setApplications] = useState(() => getAllLawyerApplications());
  const [clientAccounts, setClientAccounts] = useState([]); // loaded from the server below
  const [filter, setFilter] = useState('all');
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectionDraft, setRejectionDraft] = useState('');
  const [deletingEmail, setDeletingEmail] = useState(null); // dev-only delete confirmation state

  function refreshApplications() {
    setApplications(getAllLawyerApplications());
  }
  function refreshClients() {
    adminListClients()
      .then(setClientAccounts)
      .catch(() => {});
  }
  useEffect(refreshClients, []);

  function handleStartReview(id) {
    updateLawyerApplicationStatus(id, 'under_review');
    refreshApplications();
  }
  function handleApprove(id) {
    updateLawyerApplicationStatus(id, 'approved');
    refreshApplications();
  }
  function handleReset(id) {
    updateLawyerApplicationStatus(id, 'under_review');
    refreshApplications();
  }
  function openRejectBox(id) {
    setRejectingId(id);
    setRejectionDraft('');
  }
  function confirmReject(id) {
    updateLawyerApplicationStatus(id, 'rejected', rejectionDraft.trim() || t('admin.defaultRejectionReason'));
    setRejectingId(null);
    refreshApplications();
  }

  function handleForceApproveKyc(email) {
    adminSetKycStatus(email, 'approved').then(refreshClients, () => {});
  }
  function handleResetKyc(email) {
    adminSetKycStatus(email, 'pending').then(refreshClients, () => {});
  }

  // --- DEV-ONLY: cascading account deletion ---------------------------------
  // Deletes the account on the server, then this browser's data for it (see
  // deleteClientDataLocally() in mockAuthStore.js: messages -> cases ->
  // appointments, matched to this one email only). Requires an explicit
  // confirmation tap first — there is no single-click delete.
  function requestDeleteAccount(email) {
    setDeletingEmail(email);
  }
  function cancelDeleteAccount() {
    setDeletingEmail(null);
  }
  async function confirmDeleteAccount(email) {
    try {
      await adminDeleteClient(email);
    } catch {
      return;
    }
    deleteClientDataLocally(email);
    setDeletingEmail(null);
    // If an admin happens to be testing this while signed in AS the
    // account they just deleted, sign them out too rather than leaving a
    // "ghost" session pointing at data that no longer exists.
    if (user?.role === 'client' && user.email === email) {
      dispatch({ type: 'LOGOUT' });
    }
    refreshClients();
  }

  const visibleApplications = filter === 'all' ? applications : applications.filter((a) => a.status === filter);

  return (
    <div className="screen active">
      <button
        type="button"
        className="link-btn"
        style={{ display: 'block', margin: '16px 0 10px' }}
        onClick={() => dispatch({ type: 'SET_SCREEN', payload: 'home' })}
      >
        {t('admin.backLink')}
      </button>

      <div className="auth-intro" style={{ textAlign: 'left', marginBottom: 10 }}>
        <h2>{t('admin.title')}</h2>
        <p>{t('admin.subtitle')}</p>
      </div>

      <div className="disclaimer" style={{ marginBottom: 18 }}>
        <Icon name="info" />
        <span>{t('admin.mockDisclaimer')}</span>
      </div>

      <div className="section-label tight">{t('admin.lawyerApplicationsTitle')}</div>
      <div className="filter-row">
        {LAWYER_FILTERS.map((f) => (
          <div key={f} className={`filter-chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {t(`admin.filters.${f}`)}
          </div>
        ))}
      </div>

      {visibleApplications.length === 0 ? (
        <div className="empty-state" style={{ padding: '30px 20px' }}>
          <Icon name="briefcase" />
          <p>{t('admin.noApplications')}</p>
        </div>
      ) : (
        visibleApplications.map((app) => (
          <div className="booking-card" key={app.id} style={{ cursor: 'default' }}>
            <div className="booking-top">
              <b>{app.name}</b>
              <span className={`status-tag status-${app.status}`}>{t(`admin.filters.${app.status}`)}</span>
            </div>
            <div className="lw-tags">
              {app.barCouncilId} · {app.barCouncilState} · {app.city}
            </div>
            <div className="lw-tags">
              {app.practiceAreas.map((slug) => t(`category.${slug}`)).join(' · ')}
            </div>
            <div className="booking-date" style={{ marginBottom: 10 }}>
              {t('admin.submittedLabel')} {new Date(app.submittedAt).toLocaleDateString()}
            </div>

            {rejectingId === app.id ? (
              <>
                <textarea
                  className="field-input"
                  style={{ minHeight: 50, resize: 'none', fontFamily: 'inherit', fontSize: 12.5 }}
                  placeholder={t('admin.rejectionReasonPlaceholder')}
                  value={rejectionDraft}
                  onChange={(e) => setRejectionDraft(e.target.value)}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="book-btn" style={{ marginTop: 0 }} onClick={() => confirmReject(app.id)}>
                    {t('admin.confirmRejectButton')}
                  </button>
                  <button className="book-btn secondary" style={{ marginTop: 0 }} onClick={() => setRejectingId(null)}>
                    {t('bookingDetail.close')}
                  </button>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {app.status === 'submitted' && (
                  <button className="reco-btn" onClick={() => handleStartReview(app.id)}>
                    {t('admin.startReviewButton')}
                  </button>
                )}
                {(app.status === 'submitted' || app.status === 'under_review') && (
                  <>
                    <button className="reco-btn" onClick={() => handleApprove(app.id)}>
                      {t('admin.approveButton')}
                    </button>
                    <button className="reco-btn" style={{ background: 'var(--danger-tint)', color: 'var(--danger)' }} onClick={() => openRejectBox(app.id)}>
                      {t('admin.rejectButton')}
                    </button>
                  </>
                )}
                {(app.status === 'approved' || app.status === 'rejected') && (
                  <button className="reco-btn" onClick={() => handleReset(app.id)}>
                    {t('admin.resetButton')}
                  </button>
                )}
              </div>
            )}
          </div>
        ))
      )}

      <div className="section-label">{t('admin.clientKycTitle')}</div>
      {clientAccounts.length === 0 ? (
        <div className="empty-state" style={{ padding: '30px 20px' }}>
          <Icon name="user" />
          <p>{t('admin.noClients')}</p>
        </div>
      ) : (
        clientAccounts.map((c) => (
          <div className="lawyer-card" key={c.email} style={{ cursor: 'default', flexDirection: 'column', alignItems: 'stretch' }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="avatar">{initials(c.name)}</div>
              <div className="lw-body">
                <div className="lw-name-row">
                  <b>{c.name}</b>
                </div>
                <div className="lw-tags">
                  {c.email} · {c.city}
                </div>
                <div className="lw-meta">
                  <span className={`status-tag status-${c.kycStatus || 'pending'}`}>
                    {t(`account.kyc.${c.kycStatus || 'pending'}`)}
                  </span>
                  {c.kycStatus === 'approved' ? (
                    <button className="reco-btn" onClick={() => handleResetKyc(c.email)}>
                      {t('admin.resetKycButton')}
                    </button>
                  ) : (
                    <button className="reco-btn" onClick={() => handleForceApproveKyc(c.email)}>
                      {t('admin.forceApproveButton')}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* DEV-ONLY: cascading account deletion — never shown in a
                production build (import.meta.env.DEV is false there). */}
            {import.meta.env.DEV &&
              (deletingEmail === c.email ? (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 12, color: 'var(--danger)', margin: '0 0 8px' }}>
                    {t('admin.deleteConfirmBody', { email: c.email })}
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="reco-btn"
                      style={{ background: 'var(--danger-tint)', color: 'var(--danger)' }}
                      onClick={() => confirmDeleteAccount(c.email)}
                    >
                      {t('admin.confirmDeleteButton')}
                    </button>
                    <button className="reco-btn" onClick={cancelDeleteAccount}>
                      {t('bookingDetail.close')}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="link-btn"
                  style={{ color: 'var(--danger)', marginTop: 10, textAlign: 'left' }}
                  onClick={() => requestDeleteAccount(c.email)}
                >
                  {t('admin.deleteAccountButton')}
                </button>
              ))}
          </div>
        ))
      )}
    </div>
  );
}
