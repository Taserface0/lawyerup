import { useEffect, useRef, useState } from 'react';
import Icon from '../icons/Icon.jsx';
import { initials } from '../lib/utils.js';
import { useAppState, useAppDispatch } from '../context/AppContext.jsx';
import { useTranslation } from '../hooks/useTranslation.js';
import { useShowToast } from '../hooks/useToast.js';
import {
  getCaseById,
  CASES_STORAGE_KEY,
  requestCaseResolution,
  keepCaseActive,
  confirmCaseResolution,
} from '../services/mockCaseStore.js';
import { getAppointmentById } from '../services/mockAppointmentStore.js';
import { getClientAccountByEmail } from '../services/mockAuthStore.js';
import { getMessagesForCase, sendMessage, markCaseMessagesRead, MESSAGES_STORAGE_KEY } from '../services/mockMessageStore.js';
import { submitReview, getReviewForAppointment } from '../services/mockReviewStore.js';

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function ConsultationScreen() {
  const { activeCaseId, activeCaseOrigin, user, dataVersion } = useAppState();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const showToast = useShowToast();
  const bottomMarkerRef = useRef(null);
  // Ref for the review-form card only — Request/Review Resolution now
  // render their full interactive flow directly in the sticky bar (see
  // below), so they no longer need a "scroll to" target. The review form
  // (star picker + textarea) is inherently too large to compact into a
  // strip, so it stays in the normal scrollable content and the sticky
  // bar still just scrolls to it.
  const reviewFormCardRef = useRef(null);

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [draft, setDraft] = useState('');
  const [requestConfirmOpen, setRequestConfirmOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  // Case-actions popover state — purely UI (which view of the popover is
  // showing), not a resolution-workflow state of its own. The actual
  // resolution transitions still go through requestConfirmOpen/
  // closeConfirmOpen/the existing handlers below; this just decides
  // whether the popover is open at all, and (for the lawyer's two-choice
  // decision) whether the Confirm/Keep-Active buttons are revealed yet.
  const [caseActionsMenuOpen, setCaseActionsMenuOpen] = useState(false);
  const [reviewDecisionOpen, setReviewDecisionOpen] = useState(false);
  const [reviewDraftRating, setReviewDraftRating] = useState(null); // required, no silent default — null until the client actually taps a star
  const [reviewDraftText, setReviewDraftText] = useState('');
  // Bumped whenever a CASES_STORAGE_KEY storage event fires (see the
  // effect below), purely to force a re-render — caseRecord/appointment
  // are derived fresh from localStorage on every render (not cached in
  // state), so a re-render is all that's needed to pick up a status
  // change made in another tab. The value itself is never read anywhere.
  const [, setRefreshTick] = useState(0);

  const viewerRole = user?.role === 'lawyer' ? 'lawyer' : 'client';
  const caseRecord = activeCaseId ? getCaseById(activeCaseId) : null;
  const appointment = caseRecord ? getAppointmentById(caseRecord.appointmentId) : null;

  // Informs the client when the lawyer chose "Keep Case Active" — the
  // status quietly reverts to ACTIVE, which is otherwise easy to miss
  // (unlike closing, which visibly swaps in a whole different banner and
  // hides the chat input). Fires only on that specific transition, only
  // for the client, and never on first mount (prevStatus starts equal to
  // the current status, so there's nothing to "detect" yet).
  const prevStatusRef = useRef(caseRecord?.status);
  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    if (prevStatus === 'CLIENT_REQUESTED_RESOLUTION' && caseRecord?.status === 'ACTIVE' && viewerRole === 'client') {
      showToast(t('consultation.keptActiveNotice'));
    }
    prevStatusRef.current = caseRecord?.status;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRecord?.status]);

  function loadMessages() {
    if (!caseRecord) return;
    try {
      setMessages(getMessagesForCase(caseRecord.caseId));
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    loadMessages();
    if (caseRecord) markCaseMessagesRead(caseRecord.caseId, viewerRole);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCaseId]);

  // Live updates: the other person's messages (and read receipts) arrive
  // through the server's live-update stream, which reloads the data and bumps
  // dataVersion. Re-read the thread, and since it is open on screen, mark
  // what just arrived as read (a no-op when nothing is unread).
  useEffect(() => {
    if (!caseRecord) return;
    loadMessages();
    markCaseMessagesRead(caseRecord.caseId, viewerRole);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion]);

  // Cross-tab live update. This component's own sendMessage/resolution
  // handlers already refresh the UI in the tab that made the change —
  // this listener is for the OTHER tab, e.g. the lawyer sends a message
  // or confirms/declines a resolution request while the client already
  // has this exact case's chat open here. The browser's `storage` event
  // fires only on OTHER same-origin tabs when localStorage changes
  // (never on the tab that wrote it, so this cannot re-trigger itself or
  // loop), which is exactly the "someone else changed the data" signal
  // needed — no backend, no websockets, no polling. Two keys matter here:
  //
  //   MESSAGES_STORAGE_KEY -> re-read this case's messages. Re-reading
  //   via loadMessages()/getMessagesForCase() rather than patching state
  //   means no duplicate-message risk (state is fully replaced each time,
  //   not appended to) and no cross-case leakage (getMessagesForCase
  //   always filters to this exact caseRecord.caseId).
  //
  //   CASES_STORAGE_KEY -> force a re-render (see setRefreshTick below)
  //   so caseRecord/appointment, which are derived fresh from
  //   localStorage on every render rather than cached in state, pick up
  //   a status change made in another tab.
  useEffect(() => {
    if (!caseRecord) return undefined;

    function handleStorageEvent(event) {
      if (event.key === MESSAGES_STORAGE_KEY) {
        loadMessages();
        markCaseMessagesRead(caseRecord.caseId, viewerRole);
      } else if (event.key === CASES_STORAGE_KEY) {
        // Another tab changed this (or some other) case's status — e.g.
        // the lawyer confirmed/declined a resolution request while the
        // client already has this exact case open here. Force a
        // re-render so caseRecord is re-derived from localStorage; no
        // local state to patch, getCaseById() already scopes to this
        // caseId so an unrelated case's status change can't leak in here.
        setRefreshTick((tick) => tick + 1);
      }
    }

    window.addEventListener('storage', handleStorageEvent);
    return () => window.removeEventListener('storage', handleStorageEvent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCaseId]);

  useEffect(() => {
    bottomMarkerRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages, loading]);

  function handleSend() {
    if (!draft.trim() || !caseRecord || !user || caseRecord.status === 'CLOSED') return;
    try {
      sendMessage({
        caseId: caseRecord.caseId,
        senderId: viewerRole === 'lawyer' ? user.id : user.email,
        senderRole: viewerRole,
        text: draft,
      });
      setDraft('');
      loadMessages();
    } catch {
      setLoadError(true);
    }
  }

  // --- Case resolution workflow -------------------------------------------
  // See services/mockCaseStore.js for the full lifecycle and why each
  // transition is its own narrow function rather than a generic setter.
  // Unchanged apart from also closing the case-actions popover once the
  // interaction is actually complete.
  function confirmRequestResolution() {
    if (!caseRecord) return;
    requestCaseResolution(caseRecord.caseId);
    setRequestConfirmOpen(false);
    setCaseActionsMenuOpen(false);
    setRefreshTick((tick) => tick + 1);
  }
  function handleKeepActive() {
    if (!caseRecord) return;
    keepCaseActive(caseRecord.caseId);
    setReviewDecisionOpen(false);
    setCaseActionsMenuOpen(false);
    setRefreshTick((tick) => tick + 1);
  }
  function confirmCloseCase() {
    if (!caseRecord) return;
    confirmCaseResolution(caseRecord.caseId);
    setCloseConfirmOpen(false);
    setReviewDecisionOpen(false);
    setCaseActionsMenuOpen(false);
    setRefreshTick((tick) => tick + 1);
  }

  // --- Client feedback/review, only reachable once the case is CLOSED ---
  function handleSubmitReview() {
    if (!reviewDraftRating || !caseRecord || !appointment || !user) return; // rating is required — button is also disabled until a star is picked
    submitReview({
      appointmentId: appointment.appointmentId,
      caseId: caseRecord.caseId,
      lawyerId: caseRecord.lawyerId,
      clientId: user.email,
      clientName: user.name,
      rating: reviewDraftRating,
      reviewText: reviewDraftText,
    });
    setRefreshTick((tick) => tick + 1); // re-render picks up getReviewForAppointment() below, switching to the thank-you state
  }

  function goBack() {
    dispatch({ type: 'SET_ACTIVE_CASE', payload: null });
    dispatch({ type: 'SET_ACTIVE_CASE_ORIGIN', payload: null });
    // Return to wherever this consultation was actually opened FROM
    // (see activeCaseOrigin in AppContext.jsx / BottomNav.jsx), falling
    // back to the old hardcoded default only for a legacy/edge case where
    // no origin was recorded (e.g. state restored without one).
    dispatch({ type: 'SET_SCREEN', payload: activeCaseOrigin || (viewerRole === 'lawyer' ? 'lawyerAppointments' : 'bookings') });
  }

  if (!caseRecord || !appointment) {
    return (
      <div className="screen active">
        <button className="link-btn" style={{ display: 'block', margin: '16px 0' }} onClick={goBack}>
          {t('consultation.backLink')}
        </button>
        <div className="empty-state">
          <Icon name="calendar" />
          <p>{t('consultation.notFound')}</p>
        </div>
      </div>
    );
  }

  let counterpartName;
  if (viewerRole === 'client') {
    counterpartName = caseRecord.lawyerName;
  } else {
    const clientAccount = getClientAccountByEmail(caseRecord.clientId);
    counterpartName = clientAccount?.name || caseRecord.clientId;
  }

  const caseStatusKey = caseRecord.status.toLowerCase();
  const typeLabel = appointment.consultationType === 'in_person' ? t('consultation.inPerson') : t('consultation.online');

  // Computed once, reused by both the review section below and the sticky
  // action bar's own eligibility check — same existing function, same
  // existing rule (one review per appointment), not duplicated logic.
  const existingReview =
    caseRecord.status === 'CLOSED' && viewerRole === 'client' ? getReviewForAppointment(appointment.appointmentId) : null;

  // Which actions exist for this state/role — same conditions as before,
  // just no longer driving a sticky bar for the resolution ones. Rate
  // Consultation is unchanged: it still shows in the sticky bar and still
  // scrolls to the (unmodified) review form below.
  const showRequestResolutionAction = caseRecord.status === 'ACTIVE' && viewerRole === 'client';
  const showReviewResolutionAction = caseRecord.status === 'CLIENT_REQUESTED_RESOLUTION' && viewerRole === 'lawyer';
  const showRateConsultationAction = caseRecord.status === 'CLOSED' && viewerRole === 'client' && !existingReview;
  const hasCaseActions = showRequestResolutionAction || showReviewResolutionAction;

  function scrollToReviewForm() {
    reviewFormCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function toggleCaseActionsMenu() {
    setCaseActionsMenuOpen((open) => !open);
    setReviewDecisionOpen(false); // start fresh each time the menu is (re)opened
  }

  function handleCaseActionsKeyDown(e) {
    if (e.key === 'Escape') {
      setCaseActionsMenuOpen(false);
      setReviewDecisionOpen(false);
    }
  }

  return (
    <div className="screen active chat-screen">
      <button className="link-btn" style={{ display: 'block', margin: '16px 0 10px' }} onClick={goBack}>
        {t('consultation.backLink')}
      </button>

      <div className="section-label tight">{t('consultation.title')}</div>
      <div className="profile-card" style={{ marginBottom: 16 }}>
        {hasCaseActions && (
          <>
            <button
              type="button"
              className="case-actions-btn"
              aria-label={t('consultation.caseActionsLabel')}
              aria-haspopup="true"
              aria-expanded={caseActionsMenuOpen}
              onClick={toggleCaseActionsMenu}
              onKeyDown={handleCaseActionsKeyDown}
            >
              <Icon name="dots" />
            </button>

            {caseActionsMenuOpen && (
              <div className="case-actions-popover" onKeyDown={handleCaseActionsKeyDown}>
                {showRequestResolutionAction &&
                  (requestConfirmOpen ? (
                    <div className="case-actions-confirm">
                      <p>{t('consultation.requestResolutionConfirmTitle')}</p>
                      <p className="hint">{t('consultation.requestResolutionHint')}</p>
                      <div className="case-actions-confirm-buttons">
                        <button className="book-btn compact secondary" onClick={() => setRequestConfirmOpen(false)}>
                          {t('consultation.cancelButton')}
                        </button>
                        <button className="book-btn compact" onClick={confirmRequestResolution}>
                          {t('consultation.requestResolutionButton')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="menu-row" onClick={() => setRequestConfirmOpen(true)}>
                      <div className="menu-row-left">
                        <Icon name="checkBig" />
                        <span>{t('consultation.requestResolutionButton')}</span>
                      </div>
                    </div>
                  ))}

                {showReviewResolutionAction &&
                  (closeConfirmOpen ? (
                    <div className="case-actions-confirm">
                      <p style={{ color: 'var(--danger)' }}>{t('consultation.confirmResolutionConfirmTitle')}</p>
                      <div className="case-actions-confirm-buttons">
                        <button className="book-btn compact secondary" onClick={() => setCloseConfirmOpen(false)}>
                          {t('consultation.cancelButton')}
                        </button>
                        <button className="book-btn compact" style={{ background: 'var(--danger)' }} onClick={confirmCloseCase}>
                          {t('consultation.confirmResolutionConfirmButton')}
                        </button>
                      </div>
                    </div>
                  ) : reviewDecisionOpen ? (
                    <div className="case-actions-confirm-buttons" style={{ padding: '4px 6px' }}>
                      <button className="book-btn compact secondary" onClick={handleKeepActive}>
                        {t('consultation.keepActiveButton')}
                      </button>
                      <button className="book-btn compact" onClick={() => setCloseConfirmOpen(true)}>
                        {t('consultation.confirmResolutionButton')}
                      </button>
                    </div>
                  ) : (
                    <div className="menu-row" onClick={() => setReviewDecisionOpen(true)}>
                      <div className="menu-row-left">
                        <Icon name="info" />
                        <span>{t('consultation.reviewResolutionButton')}</span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </>
        )}

        <div className="profile-head">
          <div className="avatar">{initials(counterpartName)}</div>
          <div>
            <h2>{counterpartName}</h2>
            <p>{t(`category.${caseRecord.categorySlug}`)}</p>
          </div>
        </div>
        <div className="detail-row">
          <span>{t('consultation.caseLabel')}</span>
          <span className="mono">#{String(caseRecord.caseNumber).padStart(3, '0')}</span>
        </div>
        <div className="detail-row">
          <span>{t('bookingDetail.date')}</span>
          <span>
            {appointment.date} · {appointment.time}
          </span>
        </div>
        <div className="detail-row">
          <span>{t('consultation.typeLabel')}</span>
          <span>{typeLabel}</span>
        </div>
        {appointment.consultationType === 'in_person' && appointment.city && (
          <div className="detail-row">
            <span>{t('location.cityLabel')}</span>
            <span>{appointment.city}</span>
          </div>
        )}
        <div className="detail-row">
          <span>{t('consultation.statusLabel')}</span>
          <span>
            <span className={`status-tag status-${caseStatusKey}`}>{t(`consultation.caseStatus.${caseStatusKey}`)}</span>
          </span>
        </div>
      </div>

      {/* Case actions (Request/Review resolution) now live in the compact
          "⋯" popover in the header above — discoverable on demand rather
          than a persistent banner competing with the chat below. */}
      {caseRecord.status === 'CLIENT_REQUESTED_RESOLUTION' && viewerRole === 'client' && (
        <div className="status-badge-lg pending" style={{ marginBottom: 16 }}>
          <div className="ring">
            <Icon name="receipt" />
          </div>
          <h2 className="display" style={{ fontSize: 16, margin: 0 }}>
            {t('consultation.waitingForLawyerTitle')}
          </h2>
          <p style={{ color: 'var(--ink-soft)', fontSize: 13, margin: 0 }}>{t('consultation.waitingForLawyerSubtitle')}</p>
        </div>
      )}

      {caseRecord.status === 'CLOSED' && (
        <div className="status-badge-lg approved" style={{ marginBottom: 16 }}>
          <div className="ring">
            <Icon name="checkBig" />
          </div>
          <h2 className="display" style={{ fontSize: 16, margin: 0 }}>
            {t('consultation.closedTitle')}
          </h2>
          <p style={{ color: 'var(--ink-soft)', fontSize: 13, margin: 0 }}>
            {viewerRole === 'client' ? t('consultation.closedClientNotice') : t('consultation.closedLawyerNotice')}
          </p>
        </div>
      )}

      {caseRecord.status === 'CLOSED' && viewerRole === 'client' && (() => {
        // Only reachable once the case is CLOSED — the block above already
        // gates on that, and there is no other render path into this one,
        // so ACTIVE/CLIENT_REQUESTED_RESOLUTION cases never show a review
        // form. existingReview (computed once above, shared with the
        // sticky action bar) is the data-layer source of truth for
        // "already reviewed," not just local component state, so a second
        // visit to this same case (even after a refresh) correctly shows
        // the thank-you state instead of an empty form again.
        if (existingReview) {
          return (
            <div className="location-card" style={{ marginBottom: 16 }}>
              <div className="location-card-head">
                <Icon name="checkBig" />
                <div>
                  <b>{t('feedback.thankYouTitle')}</b>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 2, marginBottom: existingReview.reviewText ? 8 : 0 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Icon
                    key={n}
                    name="star"
                    style={{ fill: 'currentColor', stroke: 'none', color: n <= existingReview.rating ? 'var(--gold)' : 'var(--border)' }}
                  />
                ))}
              </div>
              {existingReview.reviewText && (
                <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>{existingReview.reviewText}</p>
              )}
            </div>
          );
        }
        return (
          <div className="location-card" style={{ marginBottom: 16 }} ref={reviewFormCardRef}>
            <div className="location-card-head">
              <Icon name="star" />
              <div>
                <b>{t('feedback.title', { lawyerName: caseRecord.lawyerName })}</b>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={t(n === 1 ? 'feedback.starLabelSingular' : 'feedback.starLabelPlural', { count: n })}
                  aria-pressed={reviewDraftRating === n}
                  onClick={() => setReviewDraftRating(n)}
                  style={{ background: 'none', border: 'none', padding: 2, margin: 0, cursor: 'pointer', lineHeight: 0 }}
                >
                  <Icon
                    name="star"
                    style={{
                      width: 24,
                      height: 24,
                      fill: 'currentColor',
                      stroke: 'none',
                      color: n <= (reviewDraftRating || 0) ? 'var(--gold)' : 'var(--border)',
                    }}
                  />
                </button>
              ))}
            </div>
            <label className="field-label" htmlFor="feedback-review-text">
              {t('feedback.reviewLabel')}
            </label>
            <textarea
              id="feedback-review-text"
              name="feedback"
              className="field-input"
              style={{ minHeight: 70, resize: 'none' }}
              placeholder={t('feedback.reviewPlaceholder')}
              value={reviewDraftText}
              onChange={(e) => setReviewDraftText(e.target.value)}
            />
            <button className="book-btn" disabled={!reviewDraftRating} onClick={handleSubmitReview}>
              {t('feedback.submitButton')}
            </button>
          </div>
        );
      })()}

      <div className="section-label tight">{t('consultation.chatTitle')}</div>
      <div className="disclaimer" style={{ marginBottom: 14 }}>
        <Icon name="info" />
        <span>{t('consultation.chatMockNotice')}</span>
      </div>

      <div>
        {loading ? (
          <div className="msg assistant">
            <div className="bubble">
              <div className="typing">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        ) : loadError ? (
          <div className="empty-state">
            <Icon name="alert" />
            <p>{t('consultation.chatError')}</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="empty-state">
            <Icon name="chat" />
            <p>{t('consultation.chatEmpty')}</p>
          </div>
        ) : (
          messages.map((m) => (
            <div className={`msg ${m.senderRole === viewerRole ? 'user' : 'assistant'}`} key={m.id}>
              <div className="bubble">
                {m.text}
                <div className="msg-meta">
                  {formatTime(m.createdAt)}
                  {m.senderRole === viewerRole && (
                    <span className="msg-read-state">{m.readAt ? t('consultation.readState') : t('consultation.sentState')}</span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={bottomMarkerRef} />
      </div>

      {/* Sticky architecture kept for Rate Consultation only — a star
          picker + textarea is too large to compact into the case-actions
          popover, so this still scrolls to the (unmodified) review form.
          Request/Review Resolution no longer use this bar at all — see
          the case-actions popover in the header above. */}
      {showRateConsultationAction && (
        <div className="consultation-action-bar">
          <button className="book-btn" onClick={scrollToReviewForm}>
            {t('consultation.rateConsultationButton')}
          </button>
        </div>
      )}

      {caseRecord.status !== 'CLOSED' && (
        <div className="chat-input-wrap">
          <div className="chat-input">
            <input
              type="text"
              placeholder={t('consultation.messagePlaceholder')}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            />
            <button onClick={handleSend} disabled={!draft.trim()}>
              <Icon name="send" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
