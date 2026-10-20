import { useState } from 'react';
import Icon from '../../icons/Icon.jsx';
import { initials } from '../../lib/utils.js';
import { useAppState, useAppDispatch } from '../../context/AppContext.jsx';
import { useShowToast } from '../../hooks/useToast.js';
import { useTranslation } from '../../hooks/useTranslation.js';
import { getLawyerApplicationById } from '../../services/mockLawyerStore.js';

const STATUS_ICON = { submitted: 'receipt', under_review: 'receipt', approved: 'checkBig', rejected: 'alert' };
const STATUS_CLASS = { submitted: 'review', under_review: 'pending', approved: 'approved', rejected: 'rejected' };

export default function LawyerStatusView() {
  const { user } = useAppState();
  const dispatch = useAppDispatch();
  const showToast = useShowToast();
  const { t } = useTranslation();

  // Re-fetch fresh in case an admin approved/rejected this application
  // after the lawyer originally signed in — `user` in context is just the
  // snapshot from login time.
  const [profile] = useState(() => getLawyerApplicationById(user.id) || user);

  function logout() {
    dispatch({ type: 'LOGOUT' });
    showToast(t('toast.signedOut'));
  }

  function applyAgain() {
    dispatch({ type: 'LOGOUT' });
  }

  const status = profile.status || 'submitted';

  return (
    <>
      <div className="section-label" style={{ marginTop: 16 }}>
        {t('lawyerStatus.sectionTitle')}
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
          <Icon name="briefcase" />
          <span className="mono">{profile.barCouncilId}</span>
        </div>
      </div>

      <div className="section-label">{t('lawyerStatus.applicationStatusTitle')}</div>
      <div className={`status-badge-lg ${STATUS_CLASS[status]}`}>
        <div className="ring">
          <Icon name={STATUS_ICON[status]} />
        </div>
        <h2 className="display" style={{ fontSize: 16, margin: 0 }}>
          {t(`lawyerStatus.status.${status}.title`)}
        </h2>
        <p style={{ color: 'var(--ink-soft)', fontSize: 13, margin: 0 }}>{t(`lawyerStatus.status.${status}.subtitle`)}</p>
        {status === 'rejected' && profile.rejectionReason && (
          <p style={{ color: 'var(--danger)', fontSize: 12.5, margin: '4px 0 0' }}>
            {t('lawyerStatus.rejectionReasonLabel')} {profile.rejectionReason}
          </p>
        )}
      </div>

      {status === 'rejected' && (
        <button className="book-btn" onClick={applyAgain} style={{ marginTop: 14 }}>
          {t('lawyerStatus.applyAgainButton')}
        </button>
      )}

      <button className="logout-btn" onClick={logout} style={{ marginTop: 14 }}>
        {t('account.signOut')}
      </button>
    </>
  );
}
