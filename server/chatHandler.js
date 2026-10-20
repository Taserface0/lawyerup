// =============================================================================
// POST /api/chat — the only place the Anthropic API key is used.
//
// Pipeline for one turn:
//   1. sanitize   untrusted history → bounded, alternating, last turn = user
//   2. guard-in   redact PII from every user turn; detect crisis language
//   3. retrieve   BM25 over the curated statute passages (RAG)
//   4. generate   Claude with a cached system prompt + JSON-schema output
//   5. guard-out  refusal handling, JSON validation, citation grounding,
//                 crisis override of urgency
//   6. observe    one structured log line (no message content, no PII)
//
// The model client is injected so tests and evals can run the whole
// pipeline against a fake.
// =============================================================================

import { randomUUID } from 'node:crypto';
import { redactPII, detectCrisis, sanitizeHistory } from '../src/ai/guardrails.js';
import { retrieve } from '../src/ai/retrieval.js';
import { SYSTEM_PROMPT, RESPONSE_SCHEMA, CATEGORIES, buildUserTurn, groundCitations } from '../src/ai/prompt.js';

export const DEFAULT_MODEL = 'claude-opus-5-5';

const SAFE_FALLBACK = {
  en: "I can't answer that one reliably. Please speak to a verified lawyer from the Lawyers tab, or call the NALSA free legal aid helpline on 15100.",
  hi: 'मैं इसका भरोसेमंद जवाब नहीं दे सकता। कृपया लॉयर्स टैब से किसी सत्यापित वकील से बात करें, या NALSA मुफ़्त कानूनी सहायता हेल्पलाइन 15100 पर कॉल करें।',
  hinglish: 'Main iska reliable jawab nahi de sakta. Kripya Lawyers tab se kisi verified lawyer se baat karein, ya NALSA free legal aid helpline 15100 par call karein.',
};

export class ChatRequestError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

/**
 * @param {{ messages: Array<{role:string, content:string}>, lang?: string }} body
 * @param {{ createMessage: (params: object) => Promise<object>, model?: string, log?: (entry: object) => void }} deps
 */
export async function handleChat(body, { createMessage, model = DEFAULT_MODEL, log = defaultLog }) {
  const started = Date.now();
  const requestId = randomUUID();
  const langCode = ['en', 'hi', 'hinglish'].includes(body?.lang) ? body.lang : 'en';

  // 1. sanitize
  let history;
  try {
    history = sanitizeHistory(body?.messages);
  } catch {
    throw new ChatRequestError('invalid-history');
  }

  // 2. guard-in: redact every user turn, not just the latest, so PII typed
  // earlier in the conversation is never re-sent either.
  const redactedKinds = new Set();
  history = history.map((m) => {
    if (m.role !== 'user') return m;
    const { text, redacted } = redactPII(m.content);
    redacted.forEach((k) => redactedKinds.add(k));
    return { ...m, content: text };
  });
  const question = history[history.length - 1].content;
  const crisis = detectCrisis(body.messages[body.messages.length - 1]?.content || question);

  // 3. retrieve: the latest question plus the previous user turn, so a
  // follow-up like "and what if they refuse?" still finds the right law.
  const previousUser = history.slice(0, -1).reverse().find((m) => m.role === 'user');
  const sources = retrieve(`${question} ${previousUser ? previousUser.content : ''}`);
  const retrievedIds = sources.map((s) => s.entry.id);

  // 4. generate
  const messages = [
    ...history.slice(0, -1),
    { role: 'user', content: buildUserTurn({ question, sources, langCode }) },
  ];
  const response = await createMessage({
    model,
    max_tokens: 8000,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: RESPONSE_SCHEMA } },
  });

  // 5. guard-out
  let parsed = null;
  let outcome = 'ok';
  if (response.stop_reason === 'refusal') {
    outcome = 'refusal';
  } else if (response.stop_reason === 'max_tokens') {
    outcome = 'truncated';
  } else {
    const text = (response.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    try {
      parsed = JSON.parse(text);
      if (typeof parsed.reply !== 'string' || !parsed.reply.trim()) throw new Error('empty');
    } catch {
      outcome = 'invalid-json';
      parsed = null;
    }
  }

  const { citations, dropped } = groundCitations(parsed?.citations, retrievedIds);
  const result = {
    reply: parsed?.reply?.trim() || SAFE_FALLBACK[langCode],
    category: CATEGORIES.includes(parsed?.category) ? parsed.category : null,
    urgency: crisis.isEmergency ? 'high' : ['low', 'medium', 'high'].includes(parsed?.urgency) ? parsed.urgency : 'low',
    citations,
    needsLawyer: Boolean(parsed?.needs_lawyer),
    followUps: Array.isArray(parsed?.follow_up_questions) ? parsed.follow_up_questions.slice(0, 2) : [],
    safety: { redacted: [...redactedKinds], emergency: crisis.isEmergency },
  };

  // 6. observe
  const usage = response.usage || {};
  log({
    event: 'chat_turn',
    requestId,
    model: response.model || model,
    outcome,
    stopReason: response.stop_reason,
    latencyMs: Date.now() - started,
    turns: history.length,
    lang: langCode,
    retrieved: retrievedIds,
    cited: citations.map((c) => c.id),
    droppedCitations: dropped,
    redacted: result.safety.redacted,
    crisis: crisis.kinds,
    urgency: result.urgency,
    tokens: {
      input: usage.input_tokens,
      output: usage.output_tokens,
      cacheRead: usage.cache_read_input_tokens,
      cacheWrite: usage.cache_creation_input_tokens,
    },
  });

  return { ...result, requestId };
}

function defaultLog(entry) {
  console.log(JSON.stringify(entry));
}
