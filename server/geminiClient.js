// Google Gemini adapter: exposes the same `createMessage(params)` shape as
// anthropicClient.js, so chatHandler.js (guardrails, retrieval, citation
// grounding, logging) runs unchanged on either provider. Uses the public
// REST API through fetch, so there is no extra dependency.
//
// Free keys: https://aistudio.google.com/apikey

export const DEFAULT_GEMINI_MODEL = 'gemini-flash-lite-latest';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const REFUSAL_REASONS = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION']);

// Gemini's responseSchema is an OpenAPI subset: upper-case type names and no
// additionalProperties.
export function toGeminiSchema(schema) {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'additionalProperties' || key === '$schema') continue;
    if (key === 'type' && typeof value === 'string') out.type = value.toUpperCase();
    else if (key === 'properties') {
      out.properties = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toGeminiSchema(v)]));
    } else if (key === 'items') out.items = toGeminiSchema(value);
    else out[key] = value;
  }
  return out;
}

/** Converts the Anthropic-style params chatHandler builds into a Gemini request body. */
export function toGeminiRequest(params) {
  const systemText = (params.system || []).map((b) => (typeof b === 'string' ? b : b.text)).join('\n\n');
  const body = {
    contents: params.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    // Temperature is left at the model default, which Google recommends for
    // current Gemini models.
    generationConfig: { maxOutputTokens: params.max_tokens },
  };
  if (systemText) body.systemInstruction = { parts: [{ text: systemText }] };
  const schema = params.output_config?.format?.schema;
  if (schema) {
    body.generationConfig.responseMimeType = 'application/json';
    body.generationConfig.responseSchema = toGeminiSchema(schema);
  }
  return body;
}

/** Converts a Gemini response into the Anthropic message shape chatHandler reads. */
export function fromGeminiResponse(data, model) {
  const candidate = data.candidates?.[0];
  const finish = candidate?.finishReason;
  let stopReason = 'end_turn';
  if (data.promptFeedback?.blockReason || REFUSAL_REASONS.has(finish) || !candidate) stopReason = 'refusal';
  else if (finish === 'MAX_TOKENS') stopReason = 'max_tokens';

  const text = (candidate?.content?.parts || [])
    .filter((p) => typeof p.text === 'string' && !p.thought)
    .map((p) => p.text)
    .join('');
  const usage = data.usageMetadata || {};
  return {
    model: data.modelVersion || model,
    stop_reason: stopReason,
    content: text ? [{ type: 'text', text }] : [],
    usage: {
      input_tokens: usage.promptTokenCount,
      output_tokens: (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0),
      cache_read_input_tokens: usage.cachedContentTokenCount || 0,
      cache_creation_input_tokens: 0,
    },
  };
}

// Google retires models for new users and says which one to use instead
// ("...Please update your code to use models/gemini-x-flash...").
export function suggestedReplacementModel(message) {
  return /use models\/(gemini-[\w.-]*\w)/.exec(message || '')?.[1] || null;
}

// Tried in order when the main model is overloaded or unavailable. The
// "-latest" names are Google's rolling aliases, so they keep working when
// specific versions are retired. Override with GEMINI_FALLBACK_MODELS.
export const DEFAULT_GEMINI_FALLBACKS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];

const RETRYABLE = new Set([429, 500, 503, 504]);
const ATTEMPTS_PER_MODEL = 2;
const REQUEST_TIMEOUT_MS = 45_000;
const TOTAL_BUDGET_MS = 100_000;

export function createGeminiMessageFn(
  apiKey,
  {
    model = DEFAULT_GEMINI_MODEL,
    fallbackModels = DEFAULT_GEMINI_FALLBACKS,
    thinkingLevel = 'minimal',
    fetchImpl = fetch,
    log = console.warn,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    now = Date.now,
  } = {}
) {
  let preferredModel = model;
  // Current Gemini models "think" before answering by default, which made
  // short chat replies take 40+ seconds. The minimal thinking level keeps chat
  // and voice responsive; models that reject the setting are retried without it.
  let useThinking = Boolean(thinkingLevel);

  async function call(params, modelId) {
    const body = toGeminiRequest(params);
    if (useThinking) body.generationConfig.thinkingConfig = { thinkingLevel };
    let res;
    try {
      res = await fetchImpl(`${API_BASE}/${encodeURIComponent(modelId)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (cause) {
      const err = new Error(`Gemini API timeout or network error: ${cause?.message || cause}`);
      err.status = 504; // treat like an overloaded upstream: retry / fall back
      throw err;
    }
    if (res.ok) return fromGeminiResponse(await res.json(), modelId);
    let detail = '';
    try {
      detail = (await res.json())?.error?.message || '';
    } catch {
      /* non-JSON error body */
    }
    const err = new Error(`Gemini API ${res.status}${detail ? `: ${detail}` : ''}`);
    err.status = res.status;
    throw err;
  }

  return async (params) => {
    const deadline = now() + TOTAL_BUDGET_MS;
    const queue = [preferredModel, ...fallbackModels.filter((m) => m && m !== preferredModel)];
    let lastError;

    for (let i = 0; i < queue.length; i++) {
      const modelId = queue[i];
      for (let attempt = 1; attempt <= ATTEMPTS_PER_MODEL; attempt++) {
        try {
          const result = await call(params, modelId);
          if (modelId !== preferredModel) log(`[ai] ${preferredModel} was unavailable; answered with ${modelId}.`);
          return result;
        } catch (err) {
          lastError = err;
          if (err.status === 400 && useThinking && /thinking/i.test(err.message)) {
            useThinking = false; // this model doesn't take a thinking level
            attempt--;
            continue;
          }
          if (err.status === 404) {
            const replacement = suggestedReplacementModel(err.message);
            if (replacement && !queue.includes(replacement)) {
              log(`[ai] ${modelId} is retired; switching to ${replacement}. Set GEMINI_MODEL=${replacement} in .env to skip this.`);
              if (modelId === preferredModel) preferredModel = replacement;
              queue.splice(i + 1, 0, replacement);
            }
            break; // next model
          }
          if (!RETRYABLE.has(err.status)) throw err; // bad key, bad request: retrying won't help
          // Overloaded, out of quota or timed out: waiting and asking the same
          // model again rarely helps, so try the next model straight away.
          if (err.status !== 500) break;
          if (now() + 1000 * attempt > deadline) throw err;
          if (attempt < ATTEMPTS_PER_MODEL) await sleep(1000 * attempt);
        }
      }
      if (now() > deadline) break;
    }
    throw lastError;
  };
}
