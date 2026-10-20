// =============================================================================
// MOCK ONLY — client feedback/reviews after a closed consultation.
//
// This is NOT a second review system. The existing rating/reviews/revs
// fields on lawyer objects (originally just static flavor data in
// data/lawyers.js) remain the ONLY place any screen reads a lawyer's
// rating from — mockLawyerStore.js's getAllMarketplaceLawyers() and
// findMarketplaceLawyerById() fold real submitted reviews (from this
// file) into those same three fields before returning a lawyer object, so
// LawyerCard.jsx and LawyerProfileModal.jsx need zero changes to display
// real feedback — they already read lawyer.rating/.reviews/.revs exactly
// as before. See mockLawyerStore.js's applySubmittedReviews().
//
// One review per appointment (enforced here, not just hidden in the UI —
// see submitReview()'s duplicate check). A review is tied to a specific
// completed appointment/case, not the lawyer relationship in general — a
// client who books the same lawyer again for a new matter gets a fresh,
// independent chance to review that new appointment once IT closes.
//
// Same global-localStorage-key pattern as every other mock store here. A
// real backend replaces this with a `reviews` table with a unique
// constraint on appointment_id, and recomputes the lawyer's aggregate
// rating server-side (likely via a trigger or a scheduled job) rather
// than on every read the way this prototype does.
// =============================================================================

const REVIEWS_STORAGE_KEY = 'lawyerup_mock_reviews';

function readReviews() {
  try {
    const raw = localStorage.getItem(REVIEWS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeReviews(list) {
  localStorage.setItem(REVIEWS_STORAGE_KEY, JSON.stringify(list));
}

/**
 * Submits a review for one specific appointment. Returns the created
 * review, or null if either the rating is missing/out of range or a
 * review already exists for this appointmentId (one review per
 * appointment/case — the UI is expected to hide the form once a review
 * exists, but this is the data-layer backstop for that same rule, the
 * same pattern used throughout this project's other stores).
 *
 * @param {object} params
 * @param {string} params.appointmentId
 * @param {string} params.caseId
 * @param {number} params.lawyerId
 * @param {string} params.clientId - the client's email
 * @param {string} params.clientName - display name, stored in the
 *   review's own record (not looked up live later) so the lawyer's
 *   review list keeps showing the reviewer's name as it was at review
 *   time, matching how the existing static revs entries work
 * @param {number} params.rating - 1-5, required
 * @param {string} params.reviewText - optional, may be empty string
 */
export function submitReview({ appointmentId, caseId, lawyerId, clientId, clientName, rating, reviewText }) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return null;
  const reviews = readReviews();
  const alreadyReviewed = reviews.some((r) => r.appointmentId === appointmentId);
  if (alreadyReviewed) return null;
  const review = {
    reviewId: `rev_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    appointmentId,
    caseId,
    lawyerId,
    clientId,
    clientName,
    rating,
    reviewText: reviewText || '',
    createdAt: new Date().toISOString(),
  };
  reviews.push(review);
  writeReviews(reviews);
  return review;
}

export function getReviewForAppointment(appointmentId) {
  return readReviews().find((r) => r.appointmentId === appointmentId) || null;
}

export function getReviewsForLawyer(lawyerId) {
  return readReviews().filter((r) => r.lawyerId === lawyerId);
}

/**
 * Erasure (DPDP Act s.12): a deleted client's reviews are anonymised rather
 * than removed, so the lawyer's published rating does not silently change,
 * while the name and free-text (which may identify the client) are erased.
 */
export function anonymiseReviewsForClient(clientId) {
  const reviews = readReviews();
  let changed = false;
  const updated = reviews.map((r) => {
    if (r.clientId !== clientId) return r;
    changed = true;
    return { ...r, clientId: null, clientName: 'Former client', reviewText: '' };
  });
  if (changed) writeReviews(updated);
}
