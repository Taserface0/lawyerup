import { useAppState, useAppDispatch } from '../context/AppContext.jsx';
import { LANGUAGES } from '../i18n/index.js';
import Icon from '../icons/Icon.jsx';
import { useTranslation } from '../hooks/useTranslation.js';

export default function TopBar() {
  const { theme, lang } = useAppState();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();

  function toggleTheme() {
    dispatch({ type: 'SET_THEME', payload: theme === 'light' ? 'dark' : 'light' });
  }

  function cycleLang() {
    const idx = LANGUAGES.findIndex((l) => l.code === lang);
    const next = LANGUAGES[(idx + 1) % LANGUAGES.length];
    dispatch({ type: 'SET_LANG', payload: next.code });
  }

  const currentLabel = LANGUAGES.find((l) => l.code === lang)?.label || LANGUAGES[0].label;

  return (
    <div className="topbar">
      <div className="brand">
        <div className="brand-mark">L</div>
        <div className="brand-name">LawyerUp</div>
      </div>
      <div className="topbar-actions">
        <button type="button" className="icon-btn" onClick={toggleTheme} aria-label={t('a11y.toggleTheme')}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>
        <button type="button" className="lang-pill" onClick={cycleLang} aria-label={t('a11y.changeLanguage')}>
          <span>{currentLabel}</span>
        </button>
      </div>
    </div>
  );
}
