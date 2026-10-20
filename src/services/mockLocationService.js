// =============================================================================
// LOCATION ABSTRACTION LAYER.
//
// This is the ONLY file in the project allowed to reference
// `navigator.geolocation`. Every screen/component calls `requestCurrentLocation()`
// from here, never the browser API directly — that's the whole point: when
// this project is later wrapped in Capacitor, this function's *body* gets
// replaced with a call to `@capacitor/geolocation`'s `Geolocation.getCurrentPosition()`
// (which has a near-identical permission → position → error shape), and the
// return value contract below stays the same, so nothing calling this file
// has to change.
//
// This module NEVER:
//   - requests location on its own (only when a screen explicitly calls it,
//     itself only in response to the user tapping "Use my current location")
//   - polls or watches position continuously (no watchPosition — one-shot only)
//   - returns raw coordinates for storage in an Appointment/Case — callers
//     are expected to resolve coordinates to a city label and discard the
//     raw lat/lng before persisting anything (see mockAppointmentStore.js)
// =============================================================================

import { haversineDistanceKm } from '../lib/haversine.js';
import { CITY_COORDINATES } from '../data/cityCoordinates.js';

/**
 * @typedef {Object} LocationResult
 * @property {'granted'} status
 * @property {number} lat
 * @property {number} lng
 */
/**
 * @typedef {Object} LocationError
 * @property {'denied'|'unavailable'|'timeout'|'unsupported'} status
 * @property {string} message
 */

const GEOLOCATION_OPTIONS = {
  enableHighAccuracy: false, // city-level accuracy is enough for "nearby lawyers"
  timeout: 10000,
  maximumAge: 60000,
};

/**
 * One-shot current-location request. Only ever called after the user
 * explicitly taps "Use my current location" — never automatically.
 *
 * @returns {Promise<LocationResult|LocationError>} never throws; always
 *   resolves so callers can branch on `.status` without try/catch.
 */
export function requestCurrentLocation() {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ status: 'unsupported', message: 'Location is not supported on this device/browser.' });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          status: 'granted',
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => {
        // GeolocationPositionError codes: 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
        if (error.code === 1) {
          resolve({ status: 'denied', message: 'Location permission was denied.' });
        } else if (error.code === 3) {
          resolve({ status: 'timeout', message: 'Location request timed out.' });
        } else {
          resolve({ status: 'unavailable', message: 'Location is currently unavailable on this device.' });
        }
      },
      GEOLOCATION_OPTIONS
    );
  });
}

/**
 * Resolves raw coordinates to the nearest known city NAME only — this is
 * the privacy boundary. Screens should call this immediately after
 * requestCurrentLocation() succeeds and then only ever pass the resulting
 * city string (never the raw lat/lng) into anything that gets persisted
 * (see mockAppointmentStore.js — Appointment/Case records store a city
 * string, never coordinates).
 */
export function resolveNearestCity(lat, lng) {
  let nearestCity = null;
  let nearestDistance = Infinity;
  for (const [city, coords] of Object.entries(CITY_COORDINATES)) {
    const distance = haversineDistanceKm(lat, lng, coords.lat, coords.lng);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestCity = city;
    }
  }
  return nearestCity;
}
