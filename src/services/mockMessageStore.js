// =============================================================================
// MOCK ONLY — case-specific consultation messages.
//
// THIS IS NOT THE AI "KNOW YOUR RIGHTS" CHATBOT. That feature (src/hooks/
// useChat.js, src/lib/claudeApi.js) is a separate, unrelated chat with
// Claude and is untouched by this file. This store is for real (mocked)
// human-to-human messages between a specific client and a specific lawyer,
// scoped to one Case.
//
// Every message is tagged with a caseId and nothing else links two
// messages together — there is no "conversation between client X and
// lawyer Y" as a standalone entity anywhere in this codebase. A client and
// lawyer with three separate cases have three separate, non-overlapping
// message threads. This is intentional and load-bearing for the product
// requirement that different legal matters must never mix.
//
// Same global-localStorage-key pattern as the other mock stores. A real
// backend replaces this with a `messages` table plus a real-time transport
// (websockets or similar) — this file is explicitly NOT that. Sending a
// message here just writes to localStorage; the window `storage` event
// (wired up in ConsultationScreen.jsx) is what lets an ALREADY-OPEN chat in
// a different browser tab notice the write and re-read, purely as a
// same-origin, same-device convenience for local multi-tab testing. It
// does not deliver messages across different devices/browsers, does not
// work if the tab is closed, and is not a substitute for real real-time
// messaging infrastructure.
// =============================================================================

export const MESSAGES_STORAGE_KEY = 'lawyerup_mock_messages';

function readAllMessages() {
  try {
    const raw = localStorage.getItem(MESSAGES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAllMessages(list) {
  localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(list));
}

/**
 * @param {string} caseId
 * @param {string} senderId - client email or lawyer id, whichever is sending
 * @param {'client'|'lawyer'} senderRole
 * @param {string} text
 */
export function sendMessage({ caseId, senderId, senderRole, text }) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('empty-message');
  const messages = readAllMessages();
  const message = {
    id: `msg_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    caseId,
    senderId,
    senderRole,
    text: trimmed,
    createdAt: new Date().toISOString(),
    readAt: null,
  };
  messages.push(message);
  writeAllMessages(messages);
  return message;
}

export function getMessagesForCase(caseId) {
  return readAllMessages()
    .filter((m) => m.caseId === caseId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

/**
 * Marks every message NOT sent by `viewerRole` as read, for the unread-badge
 * feature. Called when a participant opens a case's chat screen.
 */
export function markCaseMessagesRead(caseId, viewerRole) {
  const messages = readAllMessages();
  let changed = false;
  const updated = messages.map((m) => {
    if (m.caseId === caseId && m.senderRole !== viewerRole && !m.readAt) {
      changed = true;
      return { ...m, readAt: new Date().toISOString() };
    }
    return m;
  });
  if (changed) writeAllMessages(updated);
  return changed;
}

/** Count of unread messages in a case, from the given viewer's perspective. */
export function getUnreadCountForCase(caseId, viewerRole) {
  return readAllMessages().filter((m) => m.caseId === caseId && m.senderRole !== viewerRole && !m.readAt).length;
}

/**
 * DEV-ONLY: deletes every message belonging to one case. Used by the
 * cascading account-deletion tool in AdminScreen.jsx (see
 * mockAuthStore.js's deleteClientDataLocally()) — always call this
 * BEFORE deleting the case itself, so no message is ever left referencing
 * a caseId that no longer exists.
 */
export function deleteMessagesForCase(caseId) {
  const messages = readAllMessages();
  const remaining = messages.filter((m) => m.caseId !== caseId);
  writeAllMessages(remaining);
}
