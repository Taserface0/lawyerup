import { useEffect, useState } from 'react';
import Icon from '../icons/Icon.jsx';
import { useTranslation } from '../hooks/useTranslation.js';

/**
 * MOCK ONLY. Collects consent, then simulates a brief automated identity
 * check (pending -> approved) with no real document collection or real
 * verification — see the project README for what a real KYC step would
 * need (a licensed KYC/AML provider, encrypted document storage, and a
 * compliance review process this mock does not attempt to model).
 *
 * @param {(kycStatus: 'approved') => void} onApproved - called once the
 *   mock check completes; the parent then finalizes account creation.
 */
export default function KycConsentStep({ onApproved }) {
  const { t } = useTranslation();
  const [consentChecked, setConsentChecked] = useState(false);
  const [phase, setPhase] = useState('consent'); // consent | pending | approved

  useEffect(() => {
    if (phase !== 'pending') return;
    const timer = setTimeout(() => setPhase('approved'), 1600);
    return () => clearTimeout(timer);
  }, [phase]);

  if (phase === 'consent') {
    return (
      <>
        <div className="auth-icon-badge" style={{ marginTop: 8 }}>
          <Icon name="shield" />
        </div>
        <div className="auth-intro">
          <h2>{t('kyc.consentTitle')}</h2>
          <p>{t('kyc.consentSubtitle')}</p>
        </div>

        <div className="disclaimer" style={{ marginBottom: 6 }}>
          <Icon name="info" />
          <span>{t('kyc.mockNotice')}</span>
        </div>

        <label className="consent-row">
          <input type="checkbox" checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} />
          <span>{t('kyc.consentText')}</span>
        </label>

        <button className="book-btn" disabled={!consentChecked} onClick={() => setPhase('pending')}>
          {t('kyc.giveConsentButton')}
        </button>
      </>
    );
  }

  if (phase === 'pending') {
    return (
      <div className="status-badge-lg pending">
        <div className="ring">
          <div className="typing">
            <span />
            <span />
            <span />
          </div>
        </div>
        <h2 className="display" style={{ fontSize: 17, margin: 0 }}>
          {t('kyc.pendingTitle')}
        </h2>
        <p style={{ color: 'var(--ink-soft)', fontSize: 13, margin: 0 }}>{t('kyc.pendingSubtitle')}</p>
      </div>
    );
  }

  // phase === 'approved'
  return (
    <>
      <div className="status-badge-lg approved">
        <div className="ring">
          <Icon name="checkBig" />
        </div>
        <h2 className="display" style={{ fontSize: 17, margin: 0 }}>
          {t('kyc.approvedTitle')}
        </h2>
        <p style={{ color: 'var(--ink-soft)', fontSize: 13, margin: 0 }}>{t('kyc.approvedSubtitle')}</p>
      </div>
      <button className="book-btn" onClick={() => onApproved('approved')}>
        {t('kyc.continueButton')}
      </button>
    </>
  );
}
