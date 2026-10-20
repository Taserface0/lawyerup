import { describe, it, expect } from 'vitest';
import { retrieve, tokenize } from '../src/ai/retrieval.js';
import { KNOWLEDGE_BASE } from '../src/ai/knowledge.js';

const topIds = (q, k = 3) => retrieve(q, { k }).map((r) => r.entry.id);

describe('knowledge base', () => {
  it('has unique ids and complete entries', () => {
    const ids = KNOWLEDGE_BASE.map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const k of KNOWLEDGE_BASE) {
      expect(k.law && k.section && k.title && k.text && k.keywords.length).toBeTruthy();
    }
  });
});

describe('retrieve', () => {
  it.each([
    ['The traffic police took my keys, what are my rights?', 'mva-206'],
    ['My landlord is evicting me without notice', 'tpa-106'],
    ['Someone is blackmailing me online', 'bns-308'],
    ['Police arrested my brother and did not say why', 'bnss-47'],
    ['पुलिस ने मुझे गिरफ्तार किया', 'bnss-47'],
    ['mera makaan malik ghar khali karwa raha hai', 'tpa-106'],
    ['police FIR nahi likh rahe', 'bnss-173'],
    ['I lost money in a UPI fraud', 'cyber-1930'],
    ['my cheque bounced', 'ni-138'],
    ['I cannot afford a lawyer', 'lsa-12'],
  ])('%s → %s', (query, expected) => {
    expect(topIds(query)).toContain(expected);
  });

  it('returns nothing for off-topic questions', () => {
    expect(retrieve('what is the weather in Goa today')).toEqual([]);
    expect(retrieve('')).toEqual([]);
  });

  it('tokenizes Devanagari with combining marks intact', () => {
    expect(tokenize('गिरफ्तारी हुई')).toEqual(['गिरफ्तारी', 'हुई']);
  });
});
