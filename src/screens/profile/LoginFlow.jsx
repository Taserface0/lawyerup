import { useState } from 'react';
import SocialAuthButtons from '../../components/SocialAuthButtons.jsx';
import { useAppDispatch } from '../../context/AppContext.jsx';
import { useShowToast } from '../../hooks/useToast.js';
import { useTranslation } from '../../hooks/useTranslation.js';
import { isValidEmail } from '../../lib/utils.js';
import { verifyMockCredentials, DEMO_EMAIL, DEMO_PASSWORD } from '../../services/mockAuthStore.js';
import { seedDemoConsultationsIfMissing } from '../../data/demoUser.js';

export default function LoginFlow() {
  const dispatch = useAppDispatch();
  const showToast = useShowToast();
  const { t } = useTranslation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  function handleSubmit(e) {
    e.preventDefault();
    const errors = {};
    if (!email.trim()) errors.email = t('auth.errors.emailRequired');
    else if (!isValidEmail(email)) errors.email = t('auth.errors.emailInvalid');
    if (!password) errors.password = t('auth.errors.passwordRequired');
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const profile = verifyMockCredentials(email, password);
    if (!profile) {
      showToast(t('toast.loginFailed'));
      return;
    }

    dispatch({ type: 'SET_USER', payload: profile });
    if (profile.email.toLowerCase() === DEMO_EMAIL.toLowerCase()) {
      seedDemoConsultationsIfMissing(profile.email);
    }
    showToast(t('toast.welcomeBackToast', { name: profile.firstName || profile.name.split(' ')[0] }));
  }

  function handleForgotPassword() {
    showToast(t('auth.forgotPasswordMock'));
  }

  return (
    <>
      <div className="auth-intro">
        <h2>{t('auth.welcomeBack')}</h2>
        <p>{t('auth.introSubtitle')}</p>
      </div>

      <form onSubmit={handleSubmit}>
        <label className="field-label">{t('auth.emailLabel')}</label>
        <input
          className="field-input"
          type="email"
          placeholder={t('auth.emailPlaceholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {fieldErrors.email && <p className="field-error">{fieldErrors.email}</p>}

        <label className="field-label">{t('auth.passwordLabel')}</label>
        <input
          className="field-input"
          type="password"
          placeholder={t('auth.passwordPlaceholder')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {fieldErrors.password && <p className="field-error">{fieldErrors.password}</p>}

        <button
          type="button"
          className="link-btn"
          style={{ display: 'block', marginBottom: 16 }}
          onClick={handleForgotPassword}
        >
          {t('auth.forgotPasswordLink')}
        </button>

        <button className="book-btn" type="submit">
          {t('auth.signInButton')}
        </button>
      </form>

      <SocialAuthButtons />

      <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--ink-faint)', marginTop: 16 }}>
        {t('auth.demoTip', { email: DEMO_EMAIL, password: DEMO_PASSWORD })}
      </p>
    </>
  );
}
