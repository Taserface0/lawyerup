// =============================================================================
// Client feedback/reviews after a closed consultation. Stored in the server
// database since Phase 3 (server/db/conversations.js), which also computes
// every lawyer's published rating (serverData().ratings), so a rating can't
// be changed from the browser.
//
// This is NOT a second review system. The rating/reviews/revs fields on
// lawyer objects remain the ONLY place any screen reads a lawyer's rating
// from — mockLawyerStore.js's applySubmittedReviews() puts the server's
// rating into those same fields, so LawyerCard.jsx and LawyerProfileModal.jsx
// read lawyer.rating/.reviews/.revs exactly as before.
//
// One review per appointment, by that appointment's client, only after its
// case is CLOSED (enforced by the server; the UI also hides the form).
// =============================================================================

import { serverData, patchServerData, mutateInBackground } from './serverData.js';

/**
 * Submits a review for one specific appointment. Returns the review (shown
 * at once; the server then stores it), or null if the rating is missing/out
 * of range or this client already reviewed the appointment.
 *
 * @param {object} params
 * @param {string} params.appointmentId
 * @param {string} params.caseId
 * @param {number} params.lawyerId
 * @param {string} params.clientId - the client's email
 * @param {string} params.clientName - display name shown with the review
 * @param {number} params.rating - 1-5, required
 * @param {string} params.reviewText - optional, may be empty string
 */
export function submitReview({ appointmentId, caseId, lawyerId, clientId, clientName, rating, reviewText }) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return null;
  if (getReviewForAppointment(appointmentId)) return null;
  const review = {
    reviewId: `pending_${Date.now()}`,
    appointmentId,
    caseId,
    lawyerId,
    clientId,
    clientName,
    rating,
    reviewText: reviewText || '',
    createdAt: new Date().toISOString(),
  };
  patchServerData({ myReviews: [...serverData().myReviews, review] });
  mutateInBackground('reviews', { appointmentId, rating, reviewText: review.reviewText });
  return review;
}

/** This client's own review of an appointment, if they left one. */
export function getReviewForAppointment(appointmentId) {
  return serverData().myReviews.find((r) => r.appointmentId === appointmentId) || null;
}

/**
 * A lawyer's published rating with submitted reviews folded in, as computed
 * by the server: { rating, reviews, revs: [{ n, r, c }] }, or null when the
 * lawyer has no submitted reviews yet.
 */
export function getRatingSummaryForLawyer(lawyerId) {
  return serverData().ratings[lawyerId] || null;
}

/** Drops a deleted client's reviews from this browser's copy; the server has anonymised them. */
export function anonymiseReviewsForClient(clientId) {
  patchServerData({ myReviews: serverData().myReviews.filter((r) => r.clientId !== clientId) });
}
