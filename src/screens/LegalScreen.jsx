import Icon from '../icons/Icon.jsx';
import { useAppState, useAppDispatch } from '../context/AppContext.jsx';
import { useTranslation } from '../hooks/useTranslation.js';

// Plain-language summaries of the privacy notice, terms of use and AI
// disclaimer, in every UI language. The full drafts live in docs/legal/.
const SECTIONS = [
  { icon: 'shield', title: 'legal.privacyTitle', body: 'legal.privacyBody' },
  { icon: 'briefcase', title: 'legal.termsTitle', body: 'legal.termsBody' },
  { icon: 'chat', title: 'legal.aiTitle', body: 'legal.aiBody' },
];

export default function LegalScreen() {
  const { user } = useAppState();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const backScreen = user?.role === 'lawyer' ? 'lawyerSettings' : 'profile';

  return (
    <div className="screen active">
      <button
        type="button"
        className="link-btn"
        style={{ display: 'block', margin: '16px 0 10px' }}
        onClick={() => dispatch({ type: 'SET_SCREEN', payload: backScreen })}
      >
        {t('consultation.backLink')}
      </button>
      <div className="section-label tight">{t('legal.title')}</div>
      <div className="disclaimer" style={{ marginBottom: 16 }}>
        <Icon name="info" />
        <span>{t('legal.draftNotice')}</span>
      </div>
      {SECTIONS.map((section) => (
        <div className="profile-card" key={section.title} style={{ marginBottom: 12 }}>
          <div className="menu-row-left" style={{ marginBottom: 8 }}>
            <Icon name={section.icon} />
            <b>{t(section.title)}</b>
          </div>
          <p className="bio-text" style={{ margin: 0 }}>
            {t(section.body)}
          </p>
        </div>
      ))}
      <p style={{ fontSize: 12, color: 'var(--ink-faint)', margin: '8px 0 24px' }}>{t('legal.grievance')}</p>
    </div>
  );
}
