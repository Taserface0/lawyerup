// =============================================================================
// Lexical retriever (BM25) over the curated knowledge base.
//
// Why BM25 and not embeddings: the corpus is ~30 short passages and the
// queries mix English, Hindi and Hinglish. A keyword index with hand-written
// multilingual aliases is fully deterministic (easy to unit-test and eval),
// needs no vector database or embedding API, and runs in both the browser
// and Node. When the corpus grows past a few hundred passages, swap
// `retrieve()` for a hybrid (BM25 + embeddings) retriever behind the same
// signature — nothing else changes.
// =============================================================================

import { KNOWLEDGE_BASE } from './knowledge.js';

const K1 = 1.4;
const B = 0.75;
const KEYWORD_WEIGHT = 3; // keywords are curated, so a hit there counts more than one in body text
const PHRASE_BONUS = 2.5; // multi-word keyword found verbatim in the query

const STOPWORDS = new Set(
  'a an the is are was were be to of in on for and or my me i it this that with at by from what can do does how my mujhe mera meri mere hai hain ka ki ke ko se ne kya aur ya bhi'.split(' ')
);

// Light suffix stripping for Latin-script words so "blackmailing",
// "blackmailed" and "blackmail" meet in the index. Devanagari is left as-is
// (Hindi variants are covered by the curated keyword aliases instead).
function stem(token) {
  if (!/^[a-z]+$/.test(token) || token.length <= 4) return token;
  return token.replace(/(ings|ing|ed|es|s)$/, '') || token;
}

export function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFC')
    .split(/[^\p{L}\p{N}\p{M}]+/u)
    .filter((t) => t && !STOPWORDS.has(t))
    .map(stem);
}

function buildIndex(corpus) {
  const docs = corpus.map((entry) => {
    const tf = new Map();
    const add = (text, weight) => {
      for (const tok of tokenize(text)) tf.set(tok, (tf.get(tok) || 0) + weight);
    };
    add(entry.title, 2);
    add(entry.text, 1);
    add(`${entry.law} ${entry.section} ${entry.formerly || ''}`, 1);
    add(entry.keywords.join(' '), KEYWORD_WEIGHT);
    const length = [...tf.values()].reduce((a, b) => a + b, 0);
    const phrases = entry.keywords.filter((k) => k.includes(' ')).map((k) => k.toLowerCase());
    return { entry, tf, length, phrases };
  });
  const df = new Map();
  for (const d of docs) for (const tok of d.tf.keys()) df.set(tok, (df.get(tok) || 0) + 1);
  const avgLength = docs.reduce((a, d) => a + d.length, 0) / docs.length;
  return { docs, df, avgLength, n: docs.length };
}

const DEFAULT_INDEX = buildIndex(KNOWLEDGE_BASE);

/**
 * Returns the top-k passages for a query, best first, with their scores.
 * Weak matches are dropped so an off-topic question ("write me a poem")
 * retrieves nothing instead of noise.
 */
export function retrieve(query, { k = 4, minScore = 4, relativeCutoff = 0.3, index = DEFAULT_INDEX } = {}) {
  const terms = [...new Set(tokenize(query))];
  const lowered = (query || '').toLowerCase();
  if (terms.length === 0) return [];

  const scored = index.docs.map((d) => {
    let score = 0;
    for (const term of terms) {
      const f = d.tf.get(term);
      if (!f) continue;
      const df = index.df.get(term);
      const idf = Math.log(1 + (index.n - df + 0.5) / (df + 0.5));
      score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.length) / index.avgLength)));
    }
    for (const phrase of d.phrases) if (lowered.includes(phrase)) score += PHRASE_BONUS;
    return { entry: d.entry, score };
  });

  // Two cut-offs, both tuned on evals/cases.json: an absolute floor so
  // off-topic chatter retrieves nothing, and a relative one so a strong match
  // is not padded out with barely-related passages.
  const best = Math.max(0, ...scored.map((s) => s.score));
  return scored
    .filter((s) => s.score >= minScore && s.score >= best * relativeCutoff)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export { buildIndex };
