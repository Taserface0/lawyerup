// =============================================================================
// Deterministic guardrails that run BEFORE and AFTER the model.
//
// These are plain functions with no model calls, so they are cheap, fully
// unit-tested, and still work when the AI is down. They complement (never
// replace) the instructions in the system prompt — defence in depth.
//
// Shared by the browser (instant emergency banner) and the server proxy
// (PII redaction before anything leaves our infrastructure).
// =============================================================================

// ---------------------------------------------------------------- PII
// Order matters: more specific patterns first so a card number is not
// half-eaten by the phone pattern.
const PII_PATTERNS = [
  { type: 'card', re: /\b(?:\d[ -]?){13,19}\b/g, check: luhnValid },
  { type: 'aadhaar', re: /\b[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}\b/g },
  { type: 'pan', re: /\b[A-Z]{5}\d{4}[A-Z]\b/gi },
  { type: 'email', re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g },
  { type: 'phone', re: /(?:\+?91[ -]?)?\b[6-9]\d{9}\b/g },
  { type: 'ifsc', re: /\b[A-Z]{4}0[A-Z0-9]{6}\b/gi },
];

function luhnValid(raw) {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Replaces personal identifiers with typed placeholders such as [AADHAAR].
 * Returns the cleaned text and which kinds were found (never the values).
 */
export function redactPII(text) {
  let out = text || '';
  const found = new Set();
  for (const { type, re, check } of PII_PATTERNS) {
    out = out.replace(re, (match) => {
      if (check && !check(match)) return match;
      found.add(type);
      return `[${type.toUpperCase()}]`;
    });
  }
  return { text: out, redacted: [...found] };
}

// ------------------------------------------------------------- crisis
// High-recall phrase lists across English, Hindi and Hinglish. A false
// positive only shows a helpline card; a false negative could hide one, so
// these err on the side of firing.
const CRISIS_PATTERNS = {
  selfHarm: [
    /\b(kill|hurt|harm)\s+myself\b/i, /\bsuicid/i, /\bend (my|it all)\b/i, /\bwant to die\b/i,
    /\bmar(na)? jaana?\b/i, /\bkhudkushi\b/i, /\baatmahatya\b/i, /आत्महत्या/, /मर जा/, /खुदकुशी/,
  ],
  violence: [
    /\b(beating|beats|hitting|attacking) me\b/i, /\bhe (will|is going to) kill\b/i, /\bkill me\b/i,
    /\bmaar(ta|ti|te|) (hai|rahe|raha|rahi)\b/i, /\bjaan se maar/i, /\bacid\b/i, /\bkidnap/i, /\babduct/i,
    /मार(ता|ती|ते) (है|हैं)/, /जान से मार/, /अपहरण/,
  ],
  sexualViolence: [/\brap(e|ed)\b/i, /\bmolest/i, /\bsexual(ly)? assault/i, /बलात्कार/, /छेड़छाड़/],
  child: [/\bchild (abuse|marriage|labour|labor)\b/i, /\bbaal vivah\b/i, /बाल विवाह/],
  custodyAbuse: [/\b(police|cops?) (beat|beating|tortur)/i, /\bcustod(y|ial) (torture|violence|death)\b/i],
};

/**
 * Returns { isEmergency, kinds } for a user message. Pure and synchronous so
 * the UI can show helplines before the model has even answered.
 */
export function detectCrisis(text) {
  const kinds = Object.entries(CRISIS_PATTERNS)
    .filter(([, patterns]) => patterns.some((re) => re.test(text || '')))
    .map(([kind]) => kind);
  return { isEmergency: kinds.length > 0, kinds };
}

// ----------------------------------------------------- input hygiene
export const MAX_MESSAGE_CHARS = 2000;
export const MAX_HISTORY_TURNS = 12;

/**
 * Validates and trims a chat history coming from an untrusted client:
 * only user/assistant roles, string content, bounded length, alternating
 * roles starting with a user turn, last message from the user.
 */
export function sanitizeHistory(history) {
  if (!Array.isArray(history)) throw new Error('invalid-history');
  const cleaned = history
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS).trim() }))
    .filter((m) => m.content);

  // Merge consecutive same-role turns (e.g. a failed request left two user
  // messages in a row) so the API's alternation rule always holds.
  const merged = [];
  for (const m of cleaned) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content += `\n\n${m.content}`;
    else merged.push({ ...m });
  }
  while (merged.length && merged[0].role !== 'user') merged.shift();
  const windowed = merged.slice(-MAX_HISTORY_TURNS);
  while (windowed.length && windowed[0].role !== 'user') windowed.shift();
  if (!windowed.length || windowed[windowed.length - 1].role !== 'user') throw new Error('invalid-history');
  return windowed;
}
