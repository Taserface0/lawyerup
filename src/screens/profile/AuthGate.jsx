import { useState } from 'react';
import Icon from '../../icons/Icon.jsx';
import ClientAuthGate from './ClientAuthGate.jsx';
import LawyerAuthGate from './LawyerAuthGate.jsx';
import { useAppDispatch } from '../../context/AppContext.jsx';
import { useTranslation } from '../../hooks/useTranslation.js';
import { ADMIN_ENABLED } from '../../lib/featureFlags.js';

export default function AuthGate() {
  const [role, setRole] = useState(null); // null | 'client' | 'lawyer'
  const dispatch = useAppDispatch();
  const { t } = useTranslation();

  if (role === 'client') return <ClientAuthGate onBack={() => setRole(null)} />;
  if (role === 'lawyer') return <LawyerAuthGate onBack={() => setRole(null)} />;

  return (
    <>
      <div className="auth-intro" style={{ marginTop: 16 }}>
        <h2>{t('roleGate.heading')}</h2>
        <p>{t('roleGate.subheading')}</p>
      </div>

      <div className="path-row" style={{ flexDirection: 'column' }}>
        <div className="path-card primary" role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setRole('client')} onClick={() => setRole('client')} style={{ width: '100%', flex: '0 0 auto' }}>
          <Icon name="user" />
          <b>{t('roleGate.clientTitle')}</b>
          <span>{t('roleGate.clientSubtitle')}</span>
        </div>
        <div className="path-card" role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setRole('lawyer')} onClick={() => setRole('lawyer')} style={{ width: '100%', flex: '0 0 auto' }}>
          <Icon name="briefcase" />
          <b>{t('roleGate.lawyerTitle')}</b>
          <span>{t('roleGate.lawyerSubtitle')}</span>
        </div>
      </div>

      <button
        type="button"
        className="link-btn"
        style={{ display: 'block', margin: '26px auto 0' }}
        onClick={() => dispatch({ type: 'SET_SCREEN', payload: 'legal' })}
      >
        {t('account.legalLink')}
      </button>
      {ADMIN_ENABLED && (
        <button
          type="button"
          className="link-btn"
          style={{ display: 'block', margin: '14px auto 0', color: 'var(--ink-faint)' }}
          onClick={() => dispatch({ type: 'SET_SCREEN', payload: 'admin' })}
        >
          {t('roleGate.adminLink')}
        </button>
      )}
    </>
  );
}
