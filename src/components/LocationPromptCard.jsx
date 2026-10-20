import { useState } from 'react';
import Icon from '../icons/Icon.jsx';
import { useAppDispatch } from '../context/AppContext.jsx';
import { useTranslation } from '../hooks/useTranslation.js';
import { requestCurrentLocation, resolveNearestCity } from '../services/mockLocationService.js';
import { CITY_LIST } from '../data/cityCoordinates.js';

/**
 * Only ever rendered when the client has chosen "in-person" AND hasn't
 * resolved a location yet — see LawyersScreen.jsx. Requests location ONLY
 * when the person taps "Use my current location" below; never on mount,
 * never automatically, never polled/watched afterward (one-shot).
 */
export default function LocationPromptCard() {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const [phase, setPhase] = useState('idle'); // idle | requesting | error | manual_picker
  const [errorStatus, setErrorStatus] = useState(null); // 'denied' | 'unavailable' | 'timeout' | 'unsupported'

  async function handleUseCurrentLocation() {
    setPhase('requesting');
    const result = await requestCurrentLocation();
    if (result.status === 'granted') {
      const city = resolveNearestCity(result.lat, result.lng);
      dispatch({ type: 'SET_LOCATION_QUERY', payload: { source: 'gps', city, lat: result.lat, lng: result.lng } });
      return;
    }
    // Denied/unavailable/timeout/unsupported: never block booking — show
    // why, and let manual city selection continue immediately.
    setErrorStatus(result.status);
    setPhase('error');
  }

  function handleSelectCity(city) {
    dispatch({ type: 'SET_LOCATION_QUERY', payload: { source: 'manual', city } });
  }

  if (phase === 'manual_picker' || phase === 'error') {
    return (
      <div className="location-card">
        <div className="location-card-head">
          <Icon name="pin" />
          <div>
            <b>{t('location.selectCityTitle')}</b>
          </div>
        </div>
        {phase === 'error' && (
          <div className="disclaimer" style={{ margin: '10px 0' }}>
            <Icon name="info" />
            <span>{t(`location.errors.${errorStatus}`)}</span>
          </div>
        )}
        <div className="quick-chips">
          {CITY_LIST.map((city) => (
            <div className="chip" key={city} onClick={() => handleSelectCity(city)}>
              {city}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="location-card">
      <div className="location-card-head">
        <Icon name="pin" />
        <div>
          <b>{t('location.findNearbyTitle')}</b>
          <p>{t('location.findNearbySubtitle')}</p>
        </div>
      </div>
      <button className="book-btn" onClick={handleUseCurrentLocation} disabled={phase === 'requesting'}>
        {phase === 'requesting' ? t('location.requesting') : t('location.useCurrentLocation')}
      </button>
      <button className="book-btn secondary" style={{ marginTop: 8 }} onClick={() => setPhase('manual_picker')}>
        {t('location.selectCityManually')}
      </button>
    </div>
  );
}
