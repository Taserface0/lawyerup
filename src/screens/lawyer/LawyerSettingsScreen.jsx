import Icon from '../../icons/Icon.jsx';
import { useAppState, useAppDispatch } from '../../context/AppContext.jsx';
import { useShowToast } from '../../hooks/useToast.js';
import { useTranslation } from '../../hooks/useTranslation.js';

export default function LawyerSettingsScreen() {
  const { theme } = useAppState();
  const dispatch = useAppDispatch();
  const showToast = useShowToast();
  const { t } = useTranslation();

  function logout() {
    dispatch({ type: 'LOGOUT' });
    dispatch({ type: 'SET_SCREEN', payload: 'profile' });
    showToast(t('toast.signedOut'));
  }

  return (
    <div className="screen active">
      <button
        className="link-btn"
        style={{ display: 'block', margin: '16px 0 10px' }}
        onClick={() => dispatch({ type: 'SET_SCREEN', payload: 'lawyerProfile' })}
      >
        {t('consultation.backLink')}
      </button>
      <div className="section-label tight">
        {t('account.preferences')}
      </div>
      <div className="theme-row">
        <div className="theme-row-left">
          <Icon name="sun" />
          <span>{t('account.appearance')}</span>
        </div>
        <div className="seg-control">
          <div className={`seg-btn ${theme === 'light' ? 'active' : ''}`} onClick={() => dispatch({ type: 'SET_THEME', payload: 'light' })}>
            <Icon name="sun" /> {t('account.light')}
          </div>
          <div className={`seg-btn ${theme === 'dark' ? 'active' : ''}`} onClick={() => dispatch({ type: 'SET_THEME', payload: 'dark' })}>
            <Icon name="moon" /> {t('account.dark')}
          </div>
        </div>
      </div>

      <div className="menu-row" role="button" tabIndex={0} style={{ marginTop: 14 }} onClick={() => dispatch({ type: 'SET_SCREEN', payload: 'legal' })}>
        <div className="menu-row-left">
          <Icon name="shield" />
          <span>{t('account.legalLink')}</span>
        </div>
        <Icon name="chevron" />
      </div>
      <button className="logout-btn" onClick={logout} style={{ marginTop: 20 }}>
        {t('account.signOut')}
      </button>
    </div>
  );
}
