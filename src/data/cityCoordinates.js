// =============================================================================
// Approximate city-center coordinates for mock/demo purposes only. Good
// enough for sorting/filtering a small demo lawyer list by distance; not
// precise enough (and not intended) for any real geospatial product need.
// =============================================================================
export const CITY_COORDINATES = {
  Bengaluru: { lat: 12.9716, lng: 77.5946 },
  Mumbai: { lat: 19.076, lng: 72.8777 },
  Chennai: { lat: 13.0827, lng: 80.2707 },
  Delhi: { lat: 28.7041, lng: 77.1025 },
  Pune: { lat: 18.5204, lng: 73.8567 },
  Kochi: { lat: 9.9312, lng: 76.2673 },
  Ahmedabad: { lat: 23.0225, lng: 72.5714 },
  Hyderabad: { lat: 17.385, lng: 78.4867 },
  Kolkata: { lat: 22.5726, lng: 88.3639 },
  Jaipur: { lat: 26.9124, lng: 75.7873 },
};

export const CITY_LIST = Object.keys(CITY_COORDINATES);

export function getCityCoordinates(cityName) {
  return CITY_COORDINATES[cityName] || null;
}

/** Small deterministic jitter so lawyers in the same city aren't at the exact same point. */
export function jitterCoordinates({ lat, lng }, seed = 0) {
  const offset = ((seed % 7) - 3) * 0.01; // roughly +/- 3km of spread
  return { lat: lat + offset, lng: lng - offset };
}
