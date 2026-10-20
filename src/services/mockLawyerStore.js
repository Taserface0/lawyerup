// =============================================================================
// Lawyers: the marketplace listing and the dev demo lawyer's credentials.
//
// Lawyer accounts and applications are stored in the server database since
// Phase 2 (users with role 'lawyer' + lawyer_profiles, see
// server/auth/handler.js). Applying, signing in and the admin review all go
// through src/services/authApi.js; passwords are hashed on the server and
// never stored in the browser. This module merges the static seed listing
// (data/lawyers.js) with the APPROVED applications the server publishes
// (public fields only: no email, phone or documents).
// =============================================================================

import { LAWYERS } from '../data/lawyers.js';
import { getCityCoordinates, jitterCoordinates } from '../data/cityCoordinates.js';
import { getReviewsForLawyer } from './mockReviewStore.js';
import { serverData } from './serverData.js';

// The old browser-only application list kept base64-encoded passwords. Remove it.
try {
  localStorage.removeItem('lawyerup_mock_lawyer_applications');
} catch {
  /* storage unavailable */
}

/**
 * Converts every APPROVED application into the shape LawyerCard /
 * LawyerProfileModal / booking already expect (same fields as the static
 * seed data in data/lawyers.js), so approved applications show up
 * side-by-side with the seeded lawyers in the marketplace listing.
 */
export function getApprovedLawyerListings() {
  return serverData()
    .approvedLawyers.map((a) => {
      // The join form only collects a city name, not coordinates — for the
      // location-based "nearby lawyers" feature to work for these too, we
      // approximate a point near that city's known center (same mock-data
      // approach as the static seed list; a real backend would have the
      // lawyer's actual registered address geocoded server-side instead).
      const cityCoords = getCityCoordinates(a.city);
      const approx = cityCoords ? jitterCoordinates(cityCoords, a.id) : null;
      return {
        id: a.id,
        name: a.name,
        cats: a.practiceAreas,
        city: a.city,
        lat: approx?.lat ?? null,
        lng: approx?.lng ?? null,
        langs: a.langs,
        exp: a.yearsOfExperience,
        fee: a.consultationFee,
        rating: 0,
        reviews: 0,
        verified: true,
        barId: a.barCouncilId,
        bio: a.bio,
        courts: a.courts,
        slots: ['10:00 AM', '2:00 PM'],
        revs: [],
      };
    });
}

/**
 * The full marketplace listing: static seed lawyers + approved
 * applications, combined. This is the single source every screen/modal
 * that needs "all bookable lawyers" should use, rather than importing the
 * static LAWYERS array directly — that way a newly-approved lawyer is
 * immediately findable everywhere (listing, profile modal, booking modal),
 * not just in the listing grid.
 */
/**
 * Folds any real submitted reviews (see mockReviewStore.js) into a
 * lawyer's rating/reviews/revs fields. The static seed rating (e.g. 4.9
 * from 112 reviews) is treated as a pre-existing weighted baseline, not
 * something recomputed from the 2-3 sample entries in revs — those were
 * always just illustrative examples, not the actual source of the
 * average, so averaging real new reviews against a weighted baseline
 * (rather than against just the visible samples) is the only way to
 * avoid wildly skewing an established lawyer's rating from one new
 * review. New reviews are appended to revs in the exact {n, r, c} shape
 * the static data already uses, so LawyerProfileModal.jsx's existing
 * `lawyer.revs.map(...)` render needs no changes at all.
 */
function applySubmittedReviews(lawyer) {
  const submitted = getReviewsForLawyer(lawyer.id);
  if (submitted.length === 0) return lawyer;
  const totalReviews = lawyer.reviews + submitted.length;
  const weightedSum = lawyer.rating * lawyer.reviews + submitted.reduce((sum, r) => sum + r.rating, 0);
  const newRating = totalReviews > 0 ? Math.round((weightedSum / totalReviews) * 10) / 10 : lawyer.rating;
  const newRevs = [...lawyer.revs, ...submitted.map((r) => ({ n: r.clientName, r: r.rating, c: r.reviewText }))];
  return { ...lawyer, rating: newRating, reviews: totalReviews, revs: newRevs };
}

// One entry per lawyer id: an approved application replaces the static seed
// entry with the same id (the dev demo lawyer deliberately shares id 1 with
// Adv. Rekha Menon). Without this, approving that account listed the lawyer
// twice — the root cause of the duplicate-key warning that was previously
// patched over with index-based keys in LawyersScreen.
//
// Only verified lawyers are listed: the screen promises "verified lawyers",
// so an unverified advocate must not be listed or bookable.
function mergedMarketplaceLawyers() {
  const byId = new Map();
  for (const lawyer of [...LAWYERS, ...getApprovedLawyerListings()]) byId.set(lawyer.id, lawyer);
  return [...byId.values()].filter((l) => l.verified);
}

export function getAllMarketplaceLawyers() {
  return mergedMarketplaceLawyers().map(applySubmittedReviews);
}

export function findMarketplaceLawyerById(id) {
  const lawyer = mergedMarketplaceLawyers().find((l) => l.id === id);
  return lawyer ? applySubmittedReviews(lawyer) : null;
}

// Dev-only demo lawyer, created by the dev server (server/auth/handler.js,
// DEMO_LAWYER). Shares id 1 with "Adv. Rekha Menon" in data/lawyers.js so its
// bookings and the demo client's history line up; it stays 'submitted', so
// it never adds a second marketplace card for id 1.
export const DEMO_LAWYER_EMAIL = 'demo.lawyer@lawyerup.dev';
export const DEMO_LAWYER_PASSWORD = 'lawyerup123'; // dev-only, not a real credential
