// =============================================================================
// MOCK ONLY — lawyer applications, stored in localStorage exactly like the
// client accounts in mockAuthStore.js, but as a separate "table" since a
// lawyer application is a genuinely different shape (bar council details,
// documents, an admin-reviewed status) from a client account.
//
// Same security caveat as mockAuthStore.js applies: passwords are base64
// "obfuscated," not hashed. See the warning in that file — it applies here
// too. A real backend replaces this whole file with a `lawyers` table,
// real document storage (S3/GCS with signed URLs), and admin actions that
// go through authenticated backend endpoints, not client-side localStorage
// writes anyone could edit in dev tools.
// =============================================================================

import { LAWYERS } from '../data/lawyers.js';
import { getCityCoordinates, jitterCoordinates } from '../data/cityCoordinates.js';
import { getReviewsForLawyer } from './mockReviewStore.js';

const APPLICATIONS_KEY = 'lawyerup_mock_lawyer_applications';

function obfuscatePasswordForPrototypeOnly(password) {
  try {
    return btoa(unescape(encodeURIComponent(password)));
  } catch {
    return password;
  }
}

function readApplications() {
  try {
    const raw = localStorage.getItem(APPLICATIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeApplications(apps) {
  localStorage.setItem(APPLICATIONS_KEY, JSON.stringify(apps));
}

function toSafeProfile(app) {
  const { passwordObfuscated, ...safe } = app; // eslint-disable-line no-unused-vars
  return safe;
}

export function lawyerEmailIsRegistered(email) {
  const normalized = email.trim().toLowerCase();
  return readApplications().some((a) => a.email.toLowerCase() === normalized);
}

/**
 * Creates a new lawyer application with status 'submitted'. Throws
 * Error('email-in-use') if the email is already used by another
 * application. Returns the safe profile (no password) with role:'lawyer'.
 */
export function submitLawyerApplication({
  firstName,
  lastName,
  phone,
  email,
  city,
  password,
  barCouncilId,
  barCouncilState,
  yearsOfExperience,
  practiceAreas,
  consultationFee,
  courts,
  langs,
  bio,
  documents,
}) {
  const apps = readApplications();
  const normalized = email.trim().toLowerCase();
  if (apps.some((a) => a.email.toLowerCase() === normalized)) {
    throw new Error('email-in-use');
  }
  const application = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    role: 'lawyer',
    firstName,
    lastName,
    name: `${firstName} ${lastName}`.trim(),
    phone,
    email: email.trim(),
    city,
    passwordObfuscated: obfuscatePasswordForPrototypeOnly(password),
    barCouncilId,
    barCouncilState,
    yearsOfExperience,
    practiceAreas, // array of category slugs
    consultationFee,
    courts, // array of court name strings
    langs, // plain string, e.g. "English, Hindi"
    bio,
    documents, // { barCertificate: 'filename.pdf', idProof: 'filename.jpg' }
    status: 'submitted', // submitted | under_review | approved | rejected
    rejectionReason: null,
    submittedAt: new Date().toISOString(),
  };
  apps.push(application);
  writeApplications(apps);
  return toSafeProfile(application);
}

/**
 * Returns the safe profile (including current status) if email+password
 * match a registered lawyer application, otherwise null.
 */
export function verifyLawyerCredentials(email, password) {
  const normalized = email.trim().toLowerCase();
  const app = readApplications().find((a) => a.email.toLowerCase() === normalized);
  if (!app) return null;
  const matches = app.passwordObfuscated === obfuscatePasswordForPrototypeOnly(password);
  return matches ? toSafeProfile(app) : null;
}

/** Re-reads and returns the latest safe profile for a given application id. */
export function getLawyerApplicationById(id) {
  const app = readApplications().find((a) => a.id === id);
  return app ? toSafeProfile(app) : null;
}

/** Admin: full application list (no password), for the review page. */
export function getAllLawyerApplications() {
  return readApplications().map(toSafeProfile);
}

/** Admin: move an application to a new status, optionally with a reason. */
export function updateLawyerApplicationStatus(id, status, rejectionReason = null) {
  const apps = readApplications();
  const idx = apps.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  apps[idx] = { ...apps[idx], status, rejectionReason: status === 'rejected' ? rejectionReason : null };
  writeApplications(apps);
  return toSafeProfile(apps[idx]);
}

/**
 * Converts every APPROVED application into the shape LawyerCard /
 * LawyerProfileModal / booking already expect (same fields as the static
 * seed data in data/lawyers.js), so approved applications show up
 * side-by-side with the seeded lawyers in the marketplace listing.
 */
export function getApprovedLawyerListings() {
  return readApplications()
    .filter((a) => a.status === 'approved')
    .map((a) => {
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

// =============================================================================
// DEV-ONLY: lets a developer log in as a lawyer to test the appointment/case
// side of the app, since the 8 static entries in data/lawyers.js are pure
// marketplace display data — they were never wired to the lawyer
// application/credential system, so nothing (including "Adv. Rekha Menon")
// has a password to log in with. There is also no separate "role switcher"
// anywhere in this app; signing in as a lawyer always goes through the real
// LawyerLoginFlow.jsx form. This function just pre-fills one seeded
// application via that same real flow's storage, the same way
// mockAuthStore.js already seeds a demo CLIENT account.
//
// This is called only from AppContext.jsx, and only when import.meta.env.DEV
// is true (Vite's built-in flag — false in a real `vite build` production
// bundle), so it never ships or runs in production. It does not add a new
// login mechanism, weaken verifyLawyerCredentials(), or bypass the real
// LawyerLoginFlow — you still sign in with an email + password through the
// normal form, exactly like any other lawyer account.
//
// id:1 deliberately matches the static "Adv. Rekha Menon" entry in
// data/lawyers.js — the demo CLIENT account's pre-seeded consultation
// (see data/demoUser.js) was booked against lawyerId:1, so logging in as
// this seeded lawyer immediately shows that same appointment/case/chat,
// letting you test both sides of one real case without booking a new one
// first. Status is deliberately 'submitted', NOT 'approved': if it were
// approved, getApprovedLawyerListings() would add a SECOND marketplace
// card also using id:1, colliding with the real static entry's id (a
// React duplicate-key bug). Leaving it unapproved means it never appears
// in the marketplace at all — it exists purely as a sign-in-able account.
export const DEMO_LAWYER_EMAIL = 'demo.lawyer@lawyerup.dev';
export const DEMO_LAWYER_PASSWORD = 'lawyerup123'; // dev-only, not a real credential

export function seedDemoLawyerAccountIfMissing() {
  if (lawyerEmailIsRegistered(DEMO_LAWYER_EMAIL)) return;
  const apps = readApplications();
  apps.push({
    id: 1, // matches data/lawyers.js's Adv. Rekha Menon — see note above
    role: 'lawyer',
    firstName: 'Rekha',
    lastName: 'Menon',
    name: 'Adv. Rekha Menon',
    phone: '9900011122',
    email: DEMO_LAWYER_EMAIL,
    city: 'Bengaluru',
    passwordObfuscated: obfuscatePasswordForPrototypeOnly(DEMO_LAWYER_PASSWORD),
    barCouncilId: 'KAR/2011/4521',
    barCouncilState: 'Karnataka',
    yearsOfExperience: 14,
    practiceAreas: ['criminal'],
    consultationFee: 1200,
    courts: ['Bengaluru City Civil Court', 'Karnataka High Court'],
    langs: 'English, Kannada, Hindi',
    bio: 'Practices criminal defence and bail matters across Karnataka district courts and the Karnataka High Court.',
    documents: { barCertificate: 'dev-seed.pdf', idProof: 'dev-seed.pdf' },
    status: 'submitted', // deliberately not 'approved' — see note above
    rejectionReason: null,
    submittedAt: new Date().toISOString(),
  });
  writeApplications(apps);
}
