import { describe, it, expect, vi } from 'vitest';
import { suggestedReplacementModel, toGeminiSchema, toGeminiRequest, fromGeminiResponse, createGeminiMessageFn } from '../server/geminiClient.js';
import { resolveProvider, describeSetup } from '../server/provider.js';
import { parseDotEnv } from '../server/env.js';
import { handleChat } from '../server/chatHandler.js';
import { RESPONSE_SCHEMA } from '../src/ai/prompt.js';

describe('resolveProvider', () => {
  it('uses the explicit AI_PROVIDER', () => {
    const p = resolveProvider({ AI_PROVIDER: 'Gemini', GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' });
    expect(p).toMatchObject({ name: 'gemini', apiKey: 'g', model: 'gemini-flash-lite-latest' });
  });
  it('falls back to whichever key is present', () => {
    expect(resolveProvider({ GEMINI_API_KEY: 'g' }).name).toBe('gemini');
    expect(resolveProvider({ ANTHROPIC_API_KEY: 'a' }).name).toBe('anthropic');
    expect(resolveProvider({}).name).toBeNull();
  });
  it('accepts both Gemini key formats and trims copy-paste whitespace', () => {
    expect(resolveProvider({ GEMINI_API_KEY: '  AQ.Ab8_example-key  ' }).apiKey).toBe('AQ.Ab8_example-key');
    expect(resolveProvider({ GEMINI_API_KEY: '"AIzaExampleKey"' }).apiKey).toBe('AIzaExampleKey');
  });
  it('honours model overrides', () => {
    expect(resolveProvider({ GEMINI_API_KEY: 'g', GEMINI_MODEL: 'gemini-2.5-flash-lite' }).model).toBe('gemini-2.5-flash-lite');
  });
  it('ignores an invalid Gemini model name instead of failing every request', () => {
    const p = resolveProvider({ GEMINI_API_KEY: 'g', GEMINI_MODEL: 'gemini' });
    expect(p.model).toBe('gemini-flash-lite-latest');
    expect(p.warning).toMatch(/not a Gemini model id/);
    expect(resolveProvider({ GEMINI_API_KEY: 'g', GEMINI_MODEL: 'models/gemini-2.5-pro' }).model).toBe('gemini-2.5-pro');
  });
  it('explains common setup mistakes without printing the key', () => {
    const misplaced = describeSetup({}, { exampleEnv: { GEMINI_API_KEY: 'AQ.secret' }, hasDotEnv: false }).join('\n');
    expect(misplaced).toMatch(/\.env\.example/);
    expect(misplaced).not.toContain('AQ.secret');
    expect(describeSetup({}, { hasDotEnv: false }).join('\n')).toMatch(/no \.env file/);
    expect(describeSetup({ GEMINI_API_KEY: 'AQ.secret' }).join('\n')).toMatch(/connected: gemini \(gemini-flash-lite-latest\)/);
  });
  it('rejects an unknown provider name', () => {
    expect(() => resolveProvider({ AI_PROVIDER: 'openai' })).toThrow(/Unknown AI_PROVIDER/);
  });
});

describe('parseDotEnv', () => {
  it('reads keys, quotes, comments and Windows line endings', () => {
    const env = parseDotEnv('# c\r\nAI_PROVIDER=gemini\r\nGEMINI_API_KEY="abc 123"\r\nPORT=8080 # port\r\nEMPTY=\r\n');
    expect(env).toEqual({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'abc 123', PORT: '8080', EMPTY: '' });
  });
});

describe('Gemini adapter', () => {
  it('converts the response schema to Gemini’s OpenAPI subset', () => {
    const s = toGeminiSchema(RESPONSE_SCHEMA);
    expect(s.type).toBe('OBJECT');
    expect(s.additionalProperties).toBeUndefined();
    expect(s.properties.citations).toEqual({ type: 'ARRAY', items: { type: 'STRING' } });
    expect(s.properties.urgency.enum).toEqual(['low', 'medium', 'high']);
  });

  it('maps system, roles and JSON output', () => {
    const body = toGeminiRequest({
      max_tokens: 100,
      system: [{ type: 'text', text: 'SYS', cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }, { role: 'user', content: 'q' }],
      output_config: { format: { type: 'json_schema', schema: RESPONSE_SCHEMA } },
    });
    expect(body.systemInstruction.parts[0].text).toBe('SYS');
    expect(body.contents.map((c) => c.role)).toEqual(['user', 'model', 'user']);
    expect(body.generationConfig).toMatchObject({ maxOutputTokens: 100, responseMimeType: 'application/json' });
  });

  it('maps finish reasons and usage', () => {
    const ok = fromGeminiResponse({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'thinking', thought: true }, { text: '{"a":1}' }] } }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 2 },
      modelVersion: 'gemini-2.5-flash',
    });
    expect(ok).toMatchObject({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"a":1}' }], usage: { input_tokens: 10, output_tokens: 7 } });
    expect(fromGeminiResponse({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }] }).stop_reason).toBe('max_tokens');
    expect(fromGeminiResponse({ candidates: [{ finishReason: 'SAFETY' }] }).stop_reason).toBe('refusal');
    expect(fromGeminiResponse({ promptFeedback: { blockReason: 'SAFETY' } }).stop_reason).toBe('refusal');
  });

  it('switches once to the model Google suggests when one is retired', async () => {
    const retired = 'Gemini API 404: This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash for the latest features.';
    expect(suggestedReplacementModel(retired)).toBe('gemini-3.8-flash');
    expect(suggestedReplacementModel('Please use models/gemini-9-pro.')).toBe('gemini-9-pro');
    const urls = [];
    const fetchImpl = vi.fn(async (url) => {
      urls.push(url);
      if (url.includes('gemini-2.5-flash')) return { ok: false, status: 404, json: async () => ({ error: { message: retired.replace('Gemini API 404: ', '') } }) };
      return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{}' }] } }] }) };
    });
    const call = createGeminiMessageFn('k', { model: 'gemini-2.5-flash', fallbackModels: [], fetchImpl, log: () => {}, sleep: async () => {} });
    const first = await call({ messages: [{ role: 'user', content: 'x' }], max_tokens: 10 });
    await call({ messages: [{ role: 'user', content: 'y' }], max_tokens: 10 });
    expect(first.model).toBe('gemini-3.8-flash');
    expect(urls.map((u) => u.match(/models\/([^:]+)/)[1])).toEqual(['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-3.8-flash']);
  });

  it('throws with the HTTP status on API errors', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({ error: { message: 'quota' } }) }));
    const call = createGeminiMessageFn('k', { fetchImpl, sleep: async () => {}, log: () => {} });
    await expect(call({ messages: [{ role: 'user', content: 'x' }], max_tokens: 10 })).rejects.toMatchObject({ status: 429 });
    // 2 attempts on each of: main model + the non-duplicate fallback
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  const OK = { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{}' }] } }] }) };
  const fail = (status, message = '') => ({ ok: false, status, json: async () => ({ error: { message } }) });
  const modelOf = (url) => url.match(/models\/([^:]+)/)[1];

  it('retries an overloaded model, then falls back to the next one', async () => {
    const calls = [];
    const fetchImpl = vi.fn(async (url) => {
      calls.push(modelOf(url));
      return modelOf(url) === 'gemini-3.8-flash' ? fail(503, 'This model is currently experiencing high demand.') : OK;
    });
    const call = createGeminiMessageFn('k', { model: 'gemini-3.8-flash', fetchImpl, sleep: async () => {}, log: () => {} });
    const out = await call({ messages: [{ role: 'user', content: 'x' }], max_tokens: 10 });
    expect(calls).toEqual(['gemini-3.8-flash', 'gemini-3.8-flash', 'gemini-flash-latest']);
    expect(out.model).toBe('gemini-flash-latest');
  });

  it('does not retry a rejected key', async () => {
    const fetchImpl = vi.fn(async () => fail(401, 'API key not valid.'));
    const call = createGeminiMessageFn('k', { fetchImpl, sleep: async () => {} });
    await expect(call({ messages: [{ role: 'user', content: 'x' }], max_tokens: 10 })).rejects.toMatchObject({ status: 401 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('sends a low thinking level, and drops it if the model rejects it', async () => {
    const bodies = [];
    const fetchImpl = vi.fn(async (url, init) => {
      const body = JSON.parse(init.body);
      bodies.push(body.generationConfig.thinkingConfig);
      return body.generationConfig.thinkingConfig ? fail(400, 'Thinking level is not supported for this model.') : OK;
    });
    const call = createGeminiMessageFn('k', { fetchImpl, sleep: async () => {} });
    await call({ messages: [{ role: 'user', content: 'x' }], max_tokens: 10 });
    await call({ messages: [{ role: 'user', content: 'y' }], max_tokens: 10 });
    expect(bodies).toEqual([{ thinkingLevel: 'low' }, undefined, undefined]);
  });

  it('runs the full chat pipeline with guardrails and citation grounding', async () => {
    let sent;
    const fetchImpl = vi.fn(async (url, init) => {
      sent = { url, headers: init.headers, body: JSON.parse(init.body) };
      const answer = { reply: 'You must be produced before a magistrate within 24 hours.', category: 'arrest', urgency: 'medium', citations: ['bnss-58', 'made-up-id'], needs_lawyer: true, follow_up_questions: [] };
      return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(answer) }] } }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } }) };
    });
    const out = await handleChat(
      { messages: [{ role: 'user', content: 'Police arrested my brother, how long can they keep him? My Aadhaar is 2345 6789 0123' }], lang: 'en' },
      { createMessage: createGeminiMessageFn('test-key', { fetchImpl }), model: 'gemini-3.8-flash', log: () => {} },
    );
    expect(sent.url).toContain('gemini-flash-lite-latest:generateContent');
    expect(sent.headers['x-goog-api-key']).toBe('test-key');
    expect(JSON.stringify(sent.body)).not.toContain('2345 6789 0123');
    expect(JSON.stringify(out.citations)).toContain('bnss-58');
    expect(JSON.stringify(out.citations)).not.toContain('made-up-id');
    expect(out.safety.redacted).toContain('aadhaar');
  });
});
