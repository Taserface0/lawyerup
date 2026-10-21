// =============================================================================
// Case-specific consultation messages between a client and their lawyer.
// Stored in the server database since Phase 3 (server/db/conversations.js);
// this module reads the browser's copy in serverData.js, which holds only
// the messages of this visitor's own cases. New messages and read receipts
// reach the other person through the live-update stream (see
// connectLiveUpdates() in serverData.js), on any device.
//
// THIS IS NOT THE AI "KNOW YOUR RIGHTS" CHATBOT. That feature (src/hooks/
// useChat.js, src/lib/claudeApi.js) is a separate, unrelated chat.
//
// Every message is tagged with a caseId and nothing else links two
// messages together — there is no "conversation between client X and
// lawyer Y" as a standalone entity anywhere in this codebase. A client and
// lawyer with three separate cases have three separate, non-overlapping
// message threads. This is intentional and load-bearing for the product
// requirement that different legal matters must never mix.
// =============================================================================

import { serverData, patchServerData, mutateInBackground } from './serverData.js';

// Screens listen for this key in `storage` events; kept for compatibility.
export const MESSAGES_STORAGE_KEY = 'lawyerup_mock_messages';

const oldestFirst = (a, b) => new Date(a.createdAt) - new Date(b.createdAt);

/**
 * Sends a message. It shows up in the thread at once; the server then stores
 * it (only the case's client or lawyer may post, never on a CLOSED case).
 *
 * @param {string} caseId
 * @param {string} senderId - client email or lawyer id, whichever is sending
 * @param {'client'|'lawyer'} senderRole
 * @param {string} text
 */
export function sendMessage({ caseId, senderId, senderRole, text }) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('empty-message');
  const message = {
    id: `pending_${Date.now()}_${Math.floor(Math.random() * 10000)}`, // replaced by the server's copy on the next refresh
    caseId,
    senderId,
    senderRole,
    text: trimmed,
    createdAt: new Date().toISOString(),
    readAt: null,
  };
  patchServerData({ messages: [...serverData().messages, message] });
  mutateInBackground('messages', { caseId, text: trimmed });
  return message;
}

export function getMessagesForCase(caseId) {
  return serverData()
    .messages.filter((m) => m.caseId === caseId)
    .sort(oldestFirst);
}

/**
 * Marks every message NOT sent by `viewerRole` as read, for the unread-badge
 * feature. Called when a participant opens a case's chat screen. Only talks
 * to the server when something was actually unread.
 */
export function markCaseMessagesRead(caseId, viewerRole) {
  let changed = false;
  const now = new Date().toISOString();
  const messages = serverData().messages.map((m) => {
    if (m.caseId === caseId && m.senderRole !== viewerRole && !m.readAt) {
      changed = true;
      return { ...m, readAt: now };
    }
    return m;
  });
  if (changed) {
    patchServerData({ messages });
    mutateInBackground('messages/read', { caseId });
  }
  return changed;
}

/** Count of unread messages in a case, from the given viewer's perspective. */
export function getUnreadCountForCase(caseId, viewerRole) {
  return serverData().messages.filter((m) => m.caseId === caseId && m.senderRole !== viewerRole && !m.readAt).length;
}

/**
 * Drops one case's messages from the browser's copy after the server deleted
 * the account they belonged to (the server already deleted the rows). Used by
 * mockAuthStore.js's deleteClientDataLocally().
 */
export function deleteMessagesForCase(caseId) {
  patchServerData({ messages: serverData().messages.filter((m) => m.caseId !== caseId) });
}
