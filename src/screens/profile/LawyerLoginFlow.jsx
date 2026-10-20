import { useState } from 'react';
import { useAppDispatch } from '../../context/AppContext.jsx';
import { useShowToast } from '../../hooks/useToast.js';
import { useTranslation } from '../../hooks/useTranslation.js';
import { isValidEmail } from '../../lib/utils.js';
import { DEMO_LAWYER_EMAIL, DEMO_LAWYER_PASSWORD } from '../../services/mockLawyerStore.js';
import { signIn } from '../../services/authApi.js';

export default function LawyerLoginFlow() {
  const dispatch = useAppDispatch();
  const showToast = useShowToast();
  const { t } = useTranslation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const errors = {};
    if (!email.trim()) errors.email = t('auth.errors.emailRequired');
    else if (!isValidEmail(email)) errors.email = t('auth.errors.emailInvalid');
    if (!password) errors.password = t('auth.errors.passwordRequired');
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0 || submitting) return;

    let profile;
    setSubmitting(true);
    try {
      profile = await signIn(email, password, 'lawyer');
    } catch (err) {
      showToast(t(err.message === 'invalid-credentials' ? 'toast.loginFailed' : 'toast.serverUnavailable'));
      return;
    } finally {
      setSubmitting(false);
    }
    dispatch({ type: 'SET_USER', payload: profile });
    dispatch({ type: 'SET_SCREEN', payload: 'lawyerAppointments' });
    showToast(t('toast.welcomeBackToast', { name: profile.firstName || profile.name.split(' ')[0] }));
  }

  return (
    <>
      <div className="auth-intro">
        <h2>{t('lawyerAuth.signInTitle')}</h2>
        <p>{t('lawyerAuth.signInSubtitle')}</p>
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

        <button className="book-btn" type="submit" disabled={submitting}>
          {t('auth.signInButton')}
        </button>
      </form>

      {/* DEV-ONLY hint, matching the demo lawyer the dev server seeds
          (DEMO_LAWYER in server/auth/handler.js) — never rendered in a
          production build (import.meta.env.DEV is false there). */}
      {import.meta.env.DEV && (
        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--ink-faint)', marginTop: 16 }}>
          {t('lawyerAuth.demoTip', { email: DEMO_LAWYER_EMAIL, password: DEMO_LAWYER_PASSWORD })}
        </p>
      )}
    </>
  );
}
