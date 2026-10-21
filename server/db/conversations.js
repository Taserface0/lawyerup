// Repository for consultation messages and reviews. Records come back in the
// shapes the UI's stores use. Who may call what is decided in
// server/data/handler.js.

import { randomUUID } from 'node:crypto';
import { LAWYERS } from '../../src/data/lawyers.js';

const toMessage = (row) =>
  row && {
    id: row.id,
    caseId: row.case_id,
    senderId: row.sender_id,
    senderRole: row.sender_role,
    text: row.text,
    createdAt: row.created_at,
    readAt: row.read_at,
  };

const toReview = (row) =>
  row && {
    reviewId: row.review_id,
    appointmentId: row.appointment_id,
    caseId: row.case_id,
    lawyerId: row.lawyer_id,
    clientId: row.client_id,
    clientName: row.client_name,
    rating: row.rating,
    reviewText: row.review_text,
    createdAt: row.created_at,
  };

/**
 * A lawyer's published rating once submitted reviews are folded in. The
 * static listing's rating and count are a weighted baseline (approved
 * applicants start at 0 from 0), exactly as src/services/mockLawyerStore.js
 * applySubmittedReviews() always computed it in the browser.
 */
export function foldReviews(base, submitted) {
  const totalReviews = base.reviews + submitted.length;
  const weightedSum = base.rating * base.reviews + submitted.reduce((sum, r) => sum + r.rating, 0);
  const rating = totalReviews > 0 ? Math.round((weightedSum / totalReviews) * 10) / 10 : base.rating;
  return { rating, reviews: totalReviews };
}

export function createConversationRepository(db, { now = Date.now } = {}) {
  const q = {
    insertMessage: db.prepare('INSERT INTO messages (id, case_id, sender_id, sender_role, text, created_at, read_at) VALUES (?, ?, ?, ?, ?, ?, NULL)'),
    messageById: db.prepare('SELECT * FROM messages WHERE id = ?'),
    messagesForClient: db.prepare(
      'SELECT messages.* FROM messages JOIN cases ON cases.case_id = messages.case_id WHERE cases.client_user_id = ? ORDER BY messages.created_at, messages.rowid'
    ),
    messagesForLawyer: db.prepare(
      'SELECT messages.* FROM messages JOIN cases ON cases.case_id = messages.case_id WHERE cases.lawyer_id = ? ORDER BY messages.created_at, messages.rowid'
    ),
    markRead: db.prepare('UPDATE messages SET read_at = ? WHERE case_id = ? AND sender_role != ? AND read_at IS NULL'),

    insertReview: db.prepare(
      `INSERT INTO reviews (review_id, appointment_id, case_id, lawyer_id, client_user_id, client_id, client_name, rating, review_text, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ),
    reviewById: db.prepare('SELECT * FROM reviews WHERE review_id = ?'),
    reviewsForClient: db.prepare('SELECT * FROM reviews WHERE client_user_id = ? ORDER BY created_at'),
    allReviews: db.prepare('SELECT * FROM reviews ORDER BY created_at, rowid'),
    anonymise: db.prepare("UPDATE reviews SET client_user_id = NULL, client_id = NULL, client_name = 'Former client', review_text = '' WHERE client_user_id = ?"),
    approvedProfile: db.prepare("SELECT lawyer_id FROM lawyer_profiles WHERE lawyer_id = ? AND status = 'approved'"),
  };

  return {
    // ---- messages ----------------------------------------------------
    addMessage({ caseId, senderId, senderRole, text }) {
      const id = `msg_${randomUUID()}`;
      q.insertMessage.run(id, caseId, String(senderId), senderRole, text, new Date(now()).toISOString());
      return toMessage(q.messageById.get(id));
    },
    messagesForClient: (userId) => q.messagesForClient.all(userId).map(toMessage),
    messagesForLawyer: (lawyerId) => q.messagesForLawyer.all(lawyerId).map(toMessage),
    /** Marks the other side's messages in this case as read by `viewerRole`. Returns how many changed. */
    markRead: (caseId, viewerRole) => q.markRead.run(new Date(now()).toISOString(), caseId, viewerRole).changes,

    // ---- reviews -----------------------------------------------------
    /** Throws Error 'already-reviewed' (code) for a second review of the same appointment. */
    addReview({ appointmentId, caseId, lawyerId, client, rating, reviewText }) {
      const id = `rev_${randomUUID()}`;
      try {
        q.insertReview.run(id, appointmentId, caseId, lawyerId, client.id, client.email, client.name, rating, reviewText, new Date(now()).toISOString());
      } catch (err) {
        if (/UNIQUE/i.test(err.message)) throw Object.assign(new Error('already-reviewed'), { code: 'already-reviewed' });
        throw err;
      }
      return toReview(q.reviewById.get(id));
    },
    reviewsForClient: (userId) => q.reviewsForClient.all(userId).map(toReview),

    /**
     * Published rating for every lawyer with at least one submitted review:
     * { [lawyerId]: { rating, reviews, revs: [{ n, r, c }] } }, where revs are
     * the submitted reviews in the {n, r, c} shape the static samples use.
     * A static listing entry is the baseline unless an approved application
     * has replaced that id (as in the marketplace merge).
     */
    ratingSummaries() {
      const byLawyer = new Map();
      for (const row of q.allReviews.all()) {
        if (!byLawyer.has(row.lawyer_id)) byLawyer.set(row.lawyer_id, []);
        byLawyer.get(row.lawyer_id).push(row);
      }
      const summaries = {};
      for (const [lawyerId, rows] of byLawyer) {
        const listed = LAWYERS.find((l) => l.id === lawyerId);
        const base = listed && !q.approvedProfile.get(lawyerId) ? { rating: listed.rating, reviews: listed.reviews } : { rating: 0, reviews: 0 };
        summaries[lawyerId] = {
          ...foldReviews(base, rows),
          revs: rows.map((r) => ({ n: r.client_name, r: r.rating, c: r.review_text })),
        };
      }
      return summaries;
    },

    /** Right to erasure: keep the rating, drop who wrote it and what they wrote. */
    anonymiseReviewsForClient: (userId) => q.anonymise.run(userId).changes,
  };
}
