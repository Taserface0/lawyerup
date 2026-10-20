// Browser client for the "Know Your Rights" assistant.
//
// The browser never talks to api.anthropic.com and never sees an API key.
// It posts the conversation to our own /api/chat endpoint (server/http.js),
// which redacts personal data, retrieves the relevant Indian-law passages,
// calls Claude, and checks the answer's citations before replying.

const ENDPOINT = '/api/chat';

const DEFAULT_NO_KEY_FALLBACK = {
  reply:
    "The AI assistant isn't connected yet. Set GEMINI_API_KEY (free) or ANTHROPIC_API_KEY in .env and restart the dev server to enable live answers.",
  category: null,
  urgency: 'low',
};

/**
 * Sends the running chat history and returns the assistant's structured
 * answer: { reply, category, urgency, citations, needsLawyer, followUps, safety }.
 *
 * @param {Array<{role: 'user'|'assistant', content: string}>} chatHistory
 * @param {object} [options]
 * @param {string} [options.langCode] - active UI language ('en'|'hi'|'hinglish')
 * @param {object} [options.noKeyFallback] - localized answer to show when the
 *   server has no API key configured (HTTP 503)
 * @throws {Error} on network or upstream failure — callers show a fallback
 */
export async function askLegalAssistant(chatHistory, options = {}) {
  const { langCode = 'en', noKeyFallback = DEFAULT_NO_KEY_FALLBACK } = options;

  const messages = chatHistory
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: m.content }));

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, lang: langCode }),
  });

  if (response.status === 503) return noKeyFallback;
  if (!response.ok) {
    const err = new Error(`chat-api-${response.status}`);
    err.busy = response.status === 429; // AI provider overloaded or our rate limit
    // The dev server explains upstream failures (bad model name, rejected
    // key, quota); production responses never include a detail.
    if (import.meta.env.DEV) {
      try {
        err.detail = (await response.json()).detail;
      } catch {
        /* no JSON body */
      }
    }
    throw err;
  }
  return response.json();
}
