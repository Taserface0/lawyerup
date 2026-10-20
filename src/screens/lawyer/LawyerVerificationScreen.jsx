import Icon from '../../icons/Icon.jsx';
import { useAppState, useAppDispatch } from '../../context/AppContext.jsx';
import { useTranslation } from '../../hooks/useTranslation.js';

const STATUS_ICON = { submitted: 'receipt', under_review: 'receipt', approved: 'checkBig', rejected: 'alert' };
const STATUS_CLASS = { submitted: 'review', under_review: 'pending', approved: 'approved', rejected: 'rejected' };

export default function LawyerVerificationScreen() {
  const { user } = useAppState();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();

  // Re-fetch fresh in case an admin approved/rejected since login — `user`
  // in context is just the snapshot from sign-in time.
  // The server-backed profile; AppContext refreshes it on load (e.g. after an admin approval).
  const profile = user;
  const status = profile.status || 'submitted';

  function applyAgain() {
    dispatch({ type: 'LOGOUT' });
    dispatch({ type: 'SET_SCREEN', payload: 'profile' });
  }

  return (
    <div className="screen active">
      <div className="section-label" style={{ marginTop: 16 }}>
        {t('lawyerStatus.applicationStatusTitle')}
      </div>

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
    </div>
  );
}
