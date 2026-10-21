import { describe, it, expect, vi } from 'vitest';
import { toOllamaRequest, fromOllamaResponse, createOllamaMessageFn, checkOllamaSetup, DEFAULT_OLLAMA_MODEL, DEFAULT_OLLAMA_URL } from '../server/ollamaClient.js';
import { resolveProvider, isConfigured, describeSetup, createModelClient, checkProviderSetup } from '../server/provider.js';
import { handleChat } from '../server/chatHandler.js';
import { RESPONSE_SCHEMA } from '../src/ai/prompt.js';

const PARAMS = {
  max_tokens: 800,
  system: [{ type: 'text', text: 'You are the assistant.' }],
  messages: [{ role: 'user', content: 'Police arrested my brother' }],
  output_config: { format: { type: 'json_schema', schema: RESPONSE_SCHEMA } },
};
const ollamaReply = (content, extra = {}) => ({ ok: true, json: async () => ({ model: 'qwen2.5:3b', message: { role: 'assistant', content }, done_reason: 'stop', prompt_eval_count: 900, eval_count: 120, ...extra }) });
const ANSWER = JSON.stringify({ reply: 'He must be told the grounds of arrest.', category: 'criminal', urgency: 'medium', citations: ['bnss-47'], needs_lawyer: true, follow_up_questions: [] });

describe('Ollama provider settings', () => {
  it('is chosen only on request, needs no key, and has sensible defaults', () => {
    expect(resolveProvider({}).name).toBeNull(); // never picked automatically
    const p = resolveProvider({ AI_PROVIDER: 'ollama' });
    expect(p).toMatchObject({ name: 'ollama', keyless: true, model: DEFAULT_OLLAMA_MODEL, url: DEFAULT_OLLAMA_URL, timeoutMs: 120000 });
    expect(isConfigured(p)).toBe(true);
    expect(resolveProvider({ AI_PROVIDER: 'ollama' }).maxTokens).toBe(1024);
    expect(resolveProvider({ AI_PROVIDER: 'ollama', OLLAMA_MODEL: 'qwen2.5:7b', OLLAMA_URL: 'http://192.168.1.5:11434', OLLAMA_TIMEOUT_MS: '300000', OLLAMA_MAX_TOKENS: '2048' })).toMatchObject({
      maxTokens: 2048,
      model: 'qwen2.5:7b',
      url: 'http://192.168.1.5:11434',
      timeoutMs: 300000,
    });
    expect(describeSetup({ AI_PROVIDER: 'ollama' }, { hasDotEnv: false })).toEqual([`[ai] Assistant: ollama (${DEFAULT_OLLAMA_MODEL} at ${DEFAULT_OLLAMA_URL}), running on this computer.`]);
  });

  it('builds a model client without any API key', async () => {
    const client = await createModelClient({ AI_PROVIDER: 'ollama' });
    expect(client).toMatchObject({ name: 'ollama', model: DEFAULT_OLLAMA_MODEL });
    expect(typeof client.createMessage).toBe('function');
  });
});

describe('Ollama adapter', () => {
  it('sends the system prompt as a system message, the schema in `format`, and max_tokens as num_predict', () => {
    const body = toOllamaRequest(PARAMS, 'qwen2.5:3b');
    expect(body).toMatchObject({ model: 'qwen2.5:3b', stream: false, format: RESPONSE_SCHEMA, options: { num_predict: 800 } });
    // The handler's 8000-token cloud budget is capped for local models (default 1024).
    expect(toOllamaRequest({ ...PARAMS, max_tokens: 8000 }, 'qwen2.5:3b').options.num_predict).toBe(1024);
    expect(toOllamaRequest({ ...PARAMS, max_tokens: 8000 }, 'qwen2.5:3b', { maxTokens: 2048 }).options.num_predict).toBe(2048);
    expect(body.messages).toEqual([
      { role: 'system', content: 'You are the assistant.' },
      { role: 'user', content: 'Police arrested my brother' },
    ]);
  });

  it('reads the answer, usage and truncation, and strips <think> blocks', () => {
    const out = fromOllamaResponse({ model: 'qwen2.5:3b', message: { content: `<think>hmm</think>\n${ANSWER}` }, done_reason: 'stop', prompt_eval_count: 900, eval_count: 120 }, 'x');
    expect(out).toMatchObject({ model: 'qwen2.5:3b', stop_reason: 'end_turn', content: [{ type: 'text', text: ANSWER }], usage: { input_tokens: 900, output_tokens: 120 } });
    expect(fromOllamaResponse({ message: { content: '{"reply": "cut' }, done_reason: 'length' }, 'x').stop_reason).toBe('max_tokens');
    expect(fromOllamaResponse({}, 'x').content).toEqual([]);
  });

  it('posts to /api/chat and runs the full pipeline with citation grounding', async () => {
    const fetchImpl = vi.fn(async () => ollamaReply(ANSWER));
    const createMessage = createOllamaMessageFn({ url: 'http://127.0.0.1:11434/', model: 'qwen2.5:3b', fetchImpl });
    const result = await handleChat({ messages: [{ role: 'user', content: 'Police arrested my brother without telling him why' }], lang: 'en' }, { createMessage, model: 'qwen2.5:3b', log: () => {} });
    expect(fetchImpl.mock.calls[0][0]).toBe('http://127.0.0.1:11434/api/chat');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).format).toEqual(RESPONSE_SCHEMA);
    expect(result).toMatchObject({ reply: 'He must be told the grounds of arrest.', category: 'criminal', urgency: 'medium' });
    expect(result.citations.map((c) => c.id)).toEqual(['bnss-47']);
  });

  it('falls back to the safe answer when the local model returns broken JSON', async () => {
    const createMessage = createOllamaMessageFn({ fetchImpl: async () => ollamaReply('Sure! Here is some advice: {not json') });
    const logs = [];
    const result = await handleChat({ messages: [{ role: 'user', content: 'My landlord kept my deposit' }], lang: 'en' }, { createMessage, model: 'qwen2.5:3b', log: (e) => logs.push(e) });
    expect(result.reply).toMatch(/15100/);
    expect(result.citations).toEqual([]);
    expect(logs[0].outcome).toBe('invalid-json');
  });

  it('explains how to start Ollama when it is not running, and how to pull a missing model', async () => {
    const down = createOllamaMessageFn({ fetchImpl: async () => Promise.reject(new TypeError('fetch failed')) });
    await expect(down(PARAMS)).rejects.toMatchObject({ status: 502, message: expect.stringMatching(/Ollama not reachable at http:\/\/127\.0\.0\.1:11434.*ollama serve.*ollama pull qwen2\.5:3b/) });

    const missing = createOllamaMessageFn({ fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({ error: "model 'qwen2.5:3b' not found" }) }) });
    await expect(missing(PARAMS)).rejects.toMatchObject({ status: 404, message: expect.stringMatching(/not found.*ollama pull qwen2\.5:3b/) });

    const slow = createOllamaMessageFn({ timeoutMs: 1000, fetchImpl: async () => Promise.reject(Object.assign(new Error('aborted'), { name: 'TimeoutError' })) });
    await expect(slow(PARAMS)).rejects.toMatchObject({ status: 504, message: expect.stringMatching(/longer than 1 s/) });
  });
});

describe('Ollama startup check', () => {
  const tags = (names) => async () => ({ ok: true, json: async () => ({ models: names.map((name) => ({ name })) }) });

  it('is quiet when the model is pulled, and warns when it is missing or Ollama is down', async () => {
    expect(await checkOllamaSetup({ model: 'qwen2.5:3b', fetchImpl: tags(['qwen2.5:3b']) })).toEqual([]);
    expect(await checkOllamaSetup({ model: 'llama3.2', fetchImpl: tags(['llama3.2:latest']) })).toEqual([]);
    expect((await checkOllamaSetup({ model: 'qwen2.5:3b', fetchImpl: tags(['llama3.2:3b']) }))[0]).toMatch(/isn't downloaded yet.*ollama pull qwen2\.5:3b.*llama3\.2:3b/);
    expect((await checkOllamaSetup({ fetchImpl: async () => Promise.reject(new TypeError('fetch failed')) }))[0]).toMatch(/Ollama not reachable/);
  });

  it('does nothing for the cloud providers', async () => {
    const fetchImpl = vi.fn();
    expect(await checkProviderSetup({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' }, { fetchImpl })).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await checkProviderSetup({ AI_PROVIDER: 'ollama' }, { fetchImpl: tags([DEFAULT_OLLAMA_MODEL]) })).toEqual([]);
  });
});
