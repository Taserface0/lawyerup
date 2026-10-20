import { useState } from 'react';
import LawyerLoginFlow from './LawyerLoginFlow.jsx';
import LawyerJoinFlow from './LawyerJoinFlow.jsx';
import { useTranslation } from '../../hooks/useTranslation.js';

export default function LawyerAuthGate({ onBack }) {
  const [mode, setMode] = useState('login'); // login | join
  const { t } = useTranslation();

  return (
    <>
      <button type="button" className="link-btn" style={{ display: 'block', margin: '16px 0 6px' }} onClick={onBack}>
        {t('roleGate.backLink')}
      </button>

      <div className="auth-tabs">
        <div className={`auth-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>
          {t('auth.signInTab')}
        </div>
        <div className={`auth-tab ${mode === 'join' ? 'active' : ''}`} onClick={() => setMode('join')}>
          {t('lawyerAuth.joinTab')}
        </div>
      </div>

      {mode === 'login' ? <LawyerLoginFlow /> : <LawyerJoinFlow />}
    </>
  );
}
