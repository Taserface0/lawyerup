import { useEffect, useState } from 'react';
import LoginFlow from '../screens/profile/LoginFlow.jsx';
import RegisterFlow from '../screens/profile/RegisterFlow.jsx';
import { useAppDispatch, useAppState } from '../context/AppContext.jsx';
import { useTranslation } from '../hooks/useTranslation.js';

// Shown once per browser session when a signed-out visitor lands on Home.
// Reuses the client sign-in / sign-up flows from the Profile tab; lawyers are
// pointed to the Profile tab, which has their own join flow. "Later" (or a tap
// outside the sheet) simply closes it: the AI chat and lawyer browsing work
// without an account.
export const WELCOME_SEEN_KEY = 'lawyerup_welcome_seen';

export default function WelcomeAuthModal() {
  const [mode, setMode] = useState('login'); // login | signup
  const { user } = useAppState();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();

  // Close once the visitor has signed in or created an account.
  useEffect(() => {
    if (user) dispatch({ type: 'CLOSE_MODAL' });
  }, [user, dispatch]);

  const close = () => dispatch({ type: 'CLOSE_MODAL' });

  return (
    <>
      <button type="button" className="modal-close" onClick={close} aria-label={t('welcome.later')}>
        &#10005;
      </button>

      <div className="welcome-head">
        <h2>{t('welcome.title')}</h2>
        <p>{t('welcome.subtitle')}</p>
      </div>

      <div className="auth-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'login'}
          className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
          onClick={() => setMode('login')}
        >
          {t('auth.signInTab')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'signup'}
          className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
          onClick={() => setMode('signup')}
        >
          {t('auth.createAccountTab')}
        </button>
      </div>

      {mode === 'login' ? <LoginFlow /> : <RegisterFlow />}

      <div className="welcome-foot">
        <button type="button" className="welcome-later" onClick={close}>
          {t('welcome.later')}
        </button>
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            close();
            dispatch({ type: 'SET_SCREEN', payload: 'profile' });
          }}
        >
          {t('welcome.lawyerLink')}
        </button>
      </div>
    </>
  );
}
