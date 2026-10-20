import { useEffect } from 'react';
import Icon from '../icons/Icon.jsx';
import CategoryGrid from '../components/CategoryGrid.jsx';
import RightsCards from '../components/RightsCards.jsx';
import { useAppDispatch, useAppState } from '../context/AppContext.jsx';
import { WELCOME_SEEN_KEY } from '../modals/WelcomeAuthModal.jsx';
import { useChat } from '../hooks/useChat.js';
import { useTranslation } from '../hooks/useTranslation.js';

export default function HomeScreen() {
  const dispatch = useAppDispatch();
  const { sendMessage } = useChat();
  const { t } = useTranslation();
  const { user, modal } = useAppState();

  // Signed-out visitors get the sign-in / sign-up popup once per browser
  // session; "Later" lets them carry on without an account.
  useEffect(() => {
    if (user || modal.type) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem(WELCOME_SEEN_KEY) === '1';
      sessionStorage.setItem(WELCOME_SEEN_KEY, '1');
    } catch {
      /* storage blocked: still show it once for this page load */
    }
    if (!seen) dispatch({ type: 'OPEN_MODAL', payload: { type: 'welcomeAuth', payload: null } });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function goToChat() {
    dispatch({ type: 'SET_SCREEN', payload: 'chat' });
  }

  function goSOS() {
    dispatch({ type: 'SET_SCREEN', payload: 'chat' });
    sendMessage(t('home.sosMessage'));
  }

  return (
    <div className="screen active">
      <div className="hero">
        <div className="eyebrow">{t('home.eyebrow')}</div>
        <h1>
          {t('home.title1')}
          <br />
          {t('home.title2')}
        </h1>
        <p>{t('home.subtitle')}</p>

        <button className="sos-btn" onClick={goSOS}>
          <div className="ring">
            <Icon name="alert" />
          </div>
          <div className="txt">
            <b>{t('home.sosTitle')}</b>
            <span>{t('home.sosSubtitle')}</span>
          </div>
        </button>

        <div className="search-bar" onClick={goToChat}>
          <Icon name="search" />
          <span>{t('home.search')}</span>
        </div>

        <div className="path-row">
          <div className="path-card primary" onClick={goToChat}>
            <Icon name="chat" />
            <b>{t('home.talkTitle')}</b>
            <span>{t('home.talkSubtitle')}</span>
          </div>
          <div className="path-card" onClick={() => dispatch({ type: 'SET_SCREEN', payload: 'lawyers' })}>
            <Icon name="briefcase" />
            <b>{t('home.findTitle')}</b>
            <span>{t('home.findSubtitle')}</span>
          </div>
        </div>
      </div>

      <div className="section-label">{t('home.sectionCategories')}</div>
      <CategoryGrid />

      <div className="section-label">{t('home.sectionRights')}</div>
      <RightsCards />
    </div>
  );
}
