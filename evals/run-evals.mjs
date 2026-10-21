// =============================================================================
// Eval harness for the Know Your Rights assistant.
//
//   npm run eval            offline: retrieval + guardrails only (free, CI-safe)
//   npm run eval -- --live  full pipeline against the real model (uses the
//                           provider and key from .env; ~28 requests)
//
// Each case in cases.json states what a good answer must do. Offline mode
// checks the deterministic parts (did we retrieve the right law, flag the
// emergency, redact the PII). Live mode additionally checks the model's
// answer: category, urgency floor, grounded citations, required helplines,
// reply language, banned phrases, and length. Results are written to
// evals/results/<timestamp>.json so runs can be compared over time.
// =============================================================================

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { retrieve } from '../src/ai/retrieval.js';
import { detectCrisis, redactPII } from '../src/ai/guardrails.js';

const live = process.argv.includes('--live');
const cases = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8'));
const URGENCY = { low: 0, medium: 1, high: 2 };

async function main() {
  let handleChat;
  let ai = null;
  if (live) {
    const { loadDotEnv } = await import('../server/env.js');
    const { createModelClient } = await import('../server/provider.js');
    loadDotEnv(new URL('../.env', import.meta.url));
    ai = await createModelClient(process.env);
    if (!ai) {
      console.error('--live needs GEMINI_API_KEY or ANTHROPIC_API_KEY, or AI_PROVIDER=ollama (environment or .env).');
      process.exit(1);
    }
    ({ handleChat } = await import('../server/chatHandler.js'));
  }

  const results = [];
  for (const c of cases) {
    const e = c.expect;
    const checks = [];
    const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });

    const retrievedIds = retrieve(c.q).map((r) => r.entry.id);
    if (e.retrieve) {
      if (e.retrieve.length === 0) check('retrieves nothing', retrievedIds.length === 0, retrievedIds.join(','));
      else check('retrieval recall', e.retrieve.every((id) => retrievedIds.includes(id)), retrievedIds.join(','));
    }
    if ('emergency' in e) check('crisis detection', detectCrisis(c.q).isEmergency === e.emergency);
    if (e.redacted) check('PII redaction', e.redacted.every((k) => redactPII(c.q).redacted.includes(k)));

    if (live) {
      const started = Date.now();
      let out;
      try {
        out = await handleChat({ messages: [{ role: 'user', content: c.q }], lang: c.lang }, { createMessage: ai.createMessage, model: ai.model, log: () => {} });
      } catch (err) {
        check('request succeeded', false, err.message);
      }
      if (out) {
        const reply = out.reply.toLowerCase();
        const cited = out.citations.map((x) => x.id);
        if (e.category) check('category', out.category === e.category, out.category);
        if (e.urgency_min) check('urgency floor', URGENCY[out.urgency] >= URGENCY[e.urgency_min], out.urgency);
        if (e.cite_any) check('grounded citation', cited.some((id) => e.cite_any.includes(id)), cited.join(','));
        if ('max_citations' in e) check('no citations', cited.length <= e.max_citations, cited.join(','));
        for (const m of e.must_mention || []) check(`mentions ${m}`, reply.includes(m.toLowerCase()));
        for (const m of e.must_not_mention || []) check(`avoids "${m}"`, !reply.includes(m.toLowerCase()));
        if (e.script === 'devanagari') check('replies in Hindi', /[ऀ-ॿ]/.test(out.reply));
        check('under 180 words', out.reply.split(/\s+/).length <= 180, `${out.reply.split(/\s+/).length} words`);
        results.latencies = [...(results.latencies || []), Date.now() - started];
      }
    }

    const passed = checks.every((x) => x.ok);
    results.push({ id: c.id, lang: c.lang, passed, checks });
    const failed = checks.filter((x) => !x.ok).map((x) => `${x.name}${x.detail ? ` (${x.detail})` : ''}`);
    console.log(`${passed ? 'PASS' : 'FAIL'}  ${c.id.padEnd(22)} ${failed.join('; ')}`);
  }

  const totalChecks = results.flatMap((r) => r.checks);
  const summary = {
    mode: live ? 'live' : 'offline',
    model: live ? `${ai.name}/${ai.model}` : null,
    cases: results.length,
    casesPassed: results.filter((r) => r.passed).length,
    checks: totalChecks.length,
    checksPassed: totalChecks.filter((x) => x.ok).length,
    p50LatencyMs: results.latencies ? results.latencies.sort((a, b) => a - b)[Math.floor(results.latencies.length / 2)] : null,
  };
  console.log(`\n${summary.mode}: ${summary.casesPassed}/${summary.cases} cases, ${summary.checksPassed}/${summary.checks} checks passed`);

  mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
  const file = new URL(`./results/${new Date().toISOString().replace(/[:.]/g, '-')}-${summary.mode}.json`, import.meta.url);
  writeFileSync(file, JSON.stringify({ summary, results }, null, 2));
  if (summary.casesPassed < summary.cases && !live) process.exit(1);
}

main();
