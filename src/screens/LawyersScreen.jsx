import { CATEGORIES } from '../data/categories.js';
import Icon from '../icons/Icon.jsx';
import LawyerCard from '../components/LawyerCard.jsx';
import LocationPromptCard from '../components/LocationPromptCard.jsx';
import { useAppState, useAppDispatch } from '../context/AppContext.jsx';
import { useTranslation } from '../hooks/useTranslation.js';
import { getAllMarketplaceLawyers } from '../services/mockLawyerStore.js';
import { haversineDistanceKm } from '../lib/haversine.js';

const FILTER_SLUGS = ['all', ...CATEGORIES.map((c) => c.slug)];

export default function LawyersScreen() {
  const { filterCat, consultationType, locationQuery } = useAppState();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();

  // Re-read on every render (cheap, small arrays) so a lawyer approved via
  // the admin page shows up the moment this screen is next visited —
  // static seed lawyers + any approved applications, combined.
  const allLawyers = getAllMarketplaceLawyers();
  let list = filterCat === 'all' ? allLawyers : allLawyers.filter((l) => l.cats.includes(filterCat));

  const isInPerson = consultationType === 'in_person';
  const needsLocationPrompt = isInPerson && !locationQuery;

  if (isInPerson && locationQuery) {
    if (locationQuery.lat != null) {
      // GPS-resolved: sort every lawyer with known coordinates by distance.
      list = list
        .filter((l) => l.lat != null && l.lng != null)
        .map((l) => ({ ...l, distanceKm: haversineDistanceKm(locationQuery.lat, locationQuery.lng, l.lat, l.lng) }))
        .sort((a, b) => a.distanceKm - b.distanceKm);
    } else {
      // Manually-picked city: no coordinates to sort by, so filter to an
      // exact city match instead — honest about the lower precision of a
      // typed-in city vs. a resolved GPS point.
      list = list.filter((l) => l.city === locationQuery.city);
    }
  }

  return (
    <div className="screen active">
      <button
        className="link-btn"
        style={{ display: 'block', margin: '16px 0 10px' }}
        onClick={() => dispatch({ type: 'SET_SCREEN', payload: 'home' })}
      >
        {t('consultation.backLink')}
      </button>

      <div className="section-label tight">
        {t('lawyers.sectionTitle')}
      </div>

      <div className="seg-control" style={{ width: '100%', marginBottom: 14 }}>
        <div
          className={`seg-btn ${consultationType === 'online' ? 'active' : ''}`}
          style={{ flex: 1, justifyContent: 'center' }}
          onClick={() => dispatch({ type: 'SET_CONSULTATION_TYPE', payload: 'online' })}
        >
          <Icon name="chat" /> {t('consultation.online')}
        </div>
        <div
          className={`seg-btn ${isInPerson ? 'active' : ''}`}
          style={{ flex: 1, justifyContent: 'center' }}
          onClick={() => dispatch({ type: 'SET_CONSULTATION_TYPE', payload: 'in_person' })}
        >
          <Icon name="pin" /> {t('consultation.inPerson')}
        </div>
      </div>

      {needsLocationPrompt && <LocationPromptCard />}

      {isInPerson && locationQuery && (
        <div className="location-resolved-pill">
          <span>
            <Icon name="pin" style={{ width: 13, height: 13, display: 'inline', verticalAlign: '-2px' }} />{' '}
            {t('location.nearbyIn', { city: locationQuery.city })}
          </span>
          <button onClick={() => dispatch({ type: 'SET_LOCATION_QUERY', payload: null })}>{t('location.change')}</button>
        </div>
      )}

      <div className="filter-row">
        {FILTER_SLUGS.map((slug) => (
          <div
            key={slug}
            className={`filter-chip ${filterCat === slug ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_FILTER_CAT', payload: slug })}
          >
            {t(`category.${slug}`)}
          </div>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="empty-state">
          <Icon name="briefcase" />
          <p>{t(isInPerson && locationQuery ? 'location.noNearbyLawyers' : 'lawyers.emptyState')}</p>
        </div>
      ) : (
        <div>
          {list.map((l) => (
            <LawyerCard key={l.id} lawyer={l} distanceKm={l.distanceKm} />
          ))}
        </div>
      )}
    </div>
  );
}
