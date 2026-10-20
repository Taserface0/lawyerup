import Icon from '../icons/Icon.jsx';
import { useTranslation } from '../hooks/useTranslation.js';
import { useShowToast } from '../hooks/useToast.js';

/**
 * MOCK ONLY. Clicking either button just shows a placeholder toast — there
 * is no real OAuth wired up. When a backend exists, these become real
 * redirects into Google/Apple's OAuth flow, handled server-side (the
 * frontend should never hold an OAuth client secret).
 */
export default function SocialAuthButtons() {
  const { t } = useTranslation();
  const showToast = useShowToast();

  function handleClick(providerLabel) {
    showToast(t('social.mockToast', { provider: providerLabel }));
  }

  return (
    <>
      <div className="divider-row">
        <span>{t('auth.orDivider')}</span>
      </div>
      <div className="social-auth-row">
        <button className="social-btn" onClick={() => handleClick('Google')}>
          <Icon name="google" /> {t('social.google')}
        </button>
        <button className="social-btn" onClick={() => handleClick('Apple')}>
          <Icon name="apple" /> {t('social.apple')}
        </button>
      </div>
    </>
  );
}
