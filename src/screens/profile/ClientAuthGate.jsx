import { useState } from 'react';
import LoginFlow from './LoginFlow.jsx';
import RegisterFlow from './RegisterFlow.jsx';
import { useTranslation } from '../../hooks/useTranslation.js';

export default function ClientAuthGate({ onBack }) {
  const [mode, setMode] = useState('login'); // login | signup
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
        <div className={`auth-tab ${mode === 'signup' ? 'active' : ''}`} onClick={() => setMode('signup')}>
          {t('auth.createAccountTab')}
        </div>
      </div>

      {mode === 'login' ? <LoginFlow /> : <RegisterFlow />}
    </>
  );
}
