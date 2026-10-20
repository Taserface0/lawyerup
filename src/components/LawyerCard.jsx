import Icon from '../icons/Icon.jsx';
import { initials } from '../lib/utils.js';
import { useAppDispatch } from '../context/AppContext.jsx';
import { useTranslation } from '../hooks/useTranslation.js';
import { formatDistanceKm } from '../lib/haversine.js';

export default function LawyerCard({ lawyer, distanceKm }) {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();

  function open() {
    dispatch({ type: 'OPEN_MODAL', payload: { type: 'lawyerProfile', payload: { lawyerId: lawyer.id } } });
  }

  return (
    <div className="lawyer-card" onClick={open}>
      <div className="avatar">{initials(lawyer.name)}</div>
      <div className="lw-body">
        <div className="lw-name-row">
          <b>{lawyer.name}</b>
          {lawyer.verified && (
            <span className="verified-badge">
              <Icon name="check" /> {t('lawyerCard.verified')}
            </span>
          )}
        </div>
        <div className="lw-tags">
          {lawyer.cats.map((c) => t(`category.${c}`)).join(' · ')} &nbsp;·&nbsp; {lawyer.city}
          {typeof distanceKm === 'number' && <> &nbsp;·&nbsp; {formatDistanceKm(distanceKm)} {t('location.away')}</>}
        </div>
        <div className="lw-meta">
          <div className="lw-rating">
            <Icon name="star" />{' '}
            {lawyer.reviews > 0 ? (
              <>
                {lawyer.rating} <span>({lawyer.reviews})</span>
              </>
            ) : (
              t('lawyerCard.newLawyer')
            )}
          </div>
          <div className="lw-fee mono">&#8377;{lawyer.fee}</div>
        </div>
      </div>
    </div>
  );
}
