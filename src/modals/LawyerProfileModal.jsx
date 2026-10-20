import { useState } from 'react';
import { findMarketplaceLawyerById } from '../services/mockLawyerStore.js';
import Icon from '../icons/Icon.jsx';
import { initials } from '../lib/utils.js';
import { useAppState, useAppDispatch } from '../context/AppContext.jsx';
import { useShowToast } from '../hooks/useToast.js';
import { useTranslation } from '../hooks/useTranslation.js';
import { getAvailableSlotsForClient, groupSlotsByDate, formatSlotDateLabel } from '../services/mockAvailabilityStore.js';

export default function LawyerProfileModal({ lawyerId }) {
  const { user, consultationType: globalConsultationType, locationQuery } = useAppState();
  const dispatch = useAppDispatch();
  const showToast = useShowToast();
  const { t } = useTranslation();
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [consultationType, setConsultationType] = useState(globalConsultationType);

  const lawyer = findMarketplaceLawyerById(lawyerId);
  if (!lawyer) return null;

  // The client can only ever pick from slots the lawyer has actually
  // published as AVAILABLE, for the specific consultation type currently
  // selected — see services/mockAvailabilityStore.js. Switching the
  // Online/In-person toggle re-queries and clears whatever was selected,
  // since a slot picked under one type is meaningless under the other.
  const availableSlots = getAvailableSlotsForClient(lawyer.id, consultationType);
  const slotGroups = groupSlotsByDate(availableSlots);

  function dateGroupLabel(dateISO) {
    const label = formatSlotDateLabel(dateISO);
    if (label.type === 'today') return t('availability.today');
    if (label.type === 'tomorrow') return t('availability.tomorrow');
    return label.label;
  }

  function chooseConsultationType(type) {
    setConsultationType(type);
    setSelectedSlot(null);
    dispatch({ type: 'SET_CONSULTATION_TYPE', payload: type });
  }

  function handleContinue() {
    if (!selectedSlot) return;
    if (!user) {
      dispatch({ type: 'CLOSE_MODAL' });
      dispatch({ type: 'SET_SCREEN', payload: 'profile' });
      showToast(t('toast.signInRequired'));
      return;
    }
    if (user.role !== 'client') {
      showToast(t('toast.lawyerCannotBook'));
      return;
    }
    // City for an in-person appointment: prefer whatever the client already
    // resolved on the Lawyers list (GPS-derived or manually picked); if they
    // jumped straight into this profile without going through that flow,
    // fall back to the lawyer's own practicing city — either way, only a
    // city NAME is ever passed forward, never coordinates.
    const city = consultationType === 'in_person' ? locationQuery?.city || lawyer.city : null;
    dispatch({
      type: 'OPEN_MODAL',
      payload: { type: 'booking', payload: { lawyerId, slotId: selectedSlot.id, slotLabel: selectedSlot.startTime, consultationType, city } },
    });
  }

  return (
    <>
      <button className="modal-close" onClick={() => dispatch({ type: 'CLOSE_MODAL' })}>
        &#10005;
      </button>

      <div className="profile-head">
        <div className="avatar">{initials(lawyer.name)}</div>
        <div>
          <h2>
            {lawyer.name}{' '}
            {lawyer.verified && (
              <span className="verified-badge">
                <Icon name="check" /> {t('lawyerCard.verified')}
              </span>
            )}
          </h2>
          <p>{lawyer.cats.map((c) => t(`category.${c}`)).join(' · ')}</p>
          <p>
            {lawyer.city} · {lawyer.langs}
          </p>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat-box">
          <b>{lawyer.exp} yrs</b>
          <span>{t('lawyerProfile.experience')}</span>
        </div>
        <div className="stat-box">
          <b>{lawyer.reviews > 0 ? <>{lawyer.rating} &#9733;</> : t('lawyerCard.newLawyer')}</b>
          <span>
            {lawyer.reviews} {t('lawyerProfile.reviewsSuffix')}
          </span>
        </div>
        <div className="stat-box">
          <b className="mono">&#8377;{lawyer.fee}</b>
          <span>{t('lawyerProfile.perSession')}</span>
        </div>
      </div>

      <div className="bio-text">
        {lawyer.bio}
        <br />
        <br />
        <b>{t('lawyerProfile.practicesIn')}</b> {lawyer.courts.join(', ')}
        <br />
        <b>{t('lawyerProfile.barCouncilId')}</b> <span className="mono">{lawyer.barId}</span>
      </div>

      <div className="section-label tight">{t('consultation.chooseType')}</div>
      <div className="seg-control" style={{ width: '100%', marginBottom: 18 }}>
        <div
          className={`seg-btn ${consultationType === 'online' ? 'active' : ''}`}
          style={{ flex: 1, justifyContent: 'center' }}
          onClick={() => chooseConsultationType('online')}
        >
          <Icon name="chat" /> {t('consultation.online')}
        </div>
        <div
          className={`seg-btn ${consultationType === 'in_person' ? 'active' : ''}`}
          style={{ flex: 1, justifyContent: 'center' }}
          onClick={() => chooseConsultationType('in_person')}
        >
          <Icon name="pin" /> {t('consultation.inPerson')}
        </div>
      </div>

      <div className="section-label tight">{t('lawyerProfile.availableSlots')}</div>
      {slotGroups.length === 0 ? (
        <div className="empty-state" style={{ padding: '30px 20px' }}>
          <Icon name="calendar" />
          <p>{t('availability.noneForType')}</p>
        </div>
      ) : (
        slotGroups.map((group) => (
          <div key={group.date} style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-faint)', margin: '0 0 8px' }}>
              {dateGroupLabel(group.date)}
            </p>
            <div className="slot-grid">
              {group.slots.map((s) => (
                <div
                  key={s.id}
                  className={`slot ${selectedSlot?.id === s.id ? 'selected' : ''}`}
                  onClick={() => setSelectedSlot(s)}
                >
                  {s.startTime}
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      <div className="section-label tight">{t('lawyerProfile.clientReviews')}</div>
      {lawyer.revs.map((r, index) => (
        <div className="review" key={`${r.n}-${index}`}>
          <div className="review-top">
            <b>{r.n}</b>
            <span className="stars">
              {Array.from({ length: r.r }).map((_, i) => (
                <Icon name="star" key={i} />
              ))}
            </span>
          </div>
          <p>{r.c}</p>
        </div>
      ))}

      <button className="book-btn" disabled={!selectedSlot} onClick={handleContinue}>
        {selectedSlot ? t('lawyerProfile.continueToBook', { slot: selectedSlot.startTime }) : t('lawyerProfile.selectSlot')}
      </button>
    </>
  );
}
