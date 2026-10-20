import Icon from '../../icons/Icon.jsx';
import { initials } from '../../lib/utils.js';
import { useAppState, useAppDispatch } from '../../context/AppContext.jsx';
import { useTranslation } from '../../hooks/useTranslation.js';

export default function LawyerProfileScreen() {
  const { user } = useAppState();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();

  // The server-backed profile; AppContext refreshes it on load (e.g. after an admin approval).
  const profile = user;

  return (
    <div className="screen active">
      <div className="section-label" style={{ marginTop: 16 }}>
        {t('lawyerDashboard.profileSectionTitle')}
      </div>

      <div className="menu-row" onClick={() => dispatch({ type: 'SET_SCREEN', payload: 'lawyerAvailability' })}>
        <div className="menu-row-left">
          <Icon name="calendar" />
          <span>{t('availability.manageLink')}</span>
        </div>
        <Icon name="chevron" />
      </div>

      <div className="menu-row" onClick={() => dispatch({ type: 'SET_SCREEN', payload: 'lawyerSettings' })}>
        <div className="menu-row-left">
          <Icon name="sun" />
          <span>{t('nav.settings')}</span>
        </div>
        <Icon name="chevron" />
      </div>

      <div className="profile-card">
        <div className="profile-head">
          <div className="avatar">{initials(profile.name)}</div>
          <div>
            <h2>{profile.name}</h2>
            <p>{profile.city}</p>
          </div>
        </div>
        <div className="profile-line">
          <Icon name="phone" />
          <span>+91 {profile.phone}</span>
        </div>
        <div className="profile-line">
          <Icon name="mail" />
          <span>{profile.email}</span>
        </div>
        <div className="profile-line">
          <Icon name="briefcase" />
          <span className="mono">
            {profile.barCouncilId} · {profile.barCouncilState}
          </span>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat-box">
          <b>{profile.yearsOfExperience} yrs</b>
          <span>{t('lawyerJoin.experienceLabel')}</span>
        </div>
        <div className="stat-box">
          <b className="mono">&#8377;{profile.consultationFee}</b>
          <span>{t('lawyerProfile.perSession')}</span>
        </div>
      </div>

      <div className="section-label tight">{t('lawyerJoin.practiceAreasLabel')}</div>
      <div className="quick-chips" style={{ marginBottom: 16 }}>
        {(profile.practiceAreas || []).map((slug) => (
          <div className="chip" key={slug}>
            {t(`category.${slug}`)}
          </div>
        ))}
      </div>

      <div className="bio-text">
        {profile.bio}
        {profile.courts && profile.courts.length > 0 && (
          <>
            <br />
            <br />
            <b>{t('lawyerProfile.practicesIn')}</b> {profile.courts.join(', ')}
          </>
        )}
        <br />
        <b>{t('lawyerJoin.languagesLabel')}:</b> {profile.langs}
      </div>
    </div>
  );
}
