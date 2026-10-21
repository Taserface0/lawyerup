// Ollama adapter: runs the assistant on a model on your own computer
// (https://ollama.com). Exposes the same `createMessage(params)` shape as
// anthropicClient.js and geminiClient.js, so chatHandler.js (guardrails,
// retrieval, citation grounding, logging) runs unchanged. No API key and no
// quota; answers are only as good as the local model, and only available
// while that computer is on.
//
//   OLLAMA_URL         default http://127.0.0.1:11434
//   OLLAMA_MODEL       default qwen2.5:3b (see DEFAULT_OLLAMA_MODEL)
//   OLLAMA_TIMEOUT_MS  default 120000 (CPU-only machines are slow)

export const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';
// Small enough (about 2 GB) to answer at a usable speed on a laptop without a
// GPU, handles Hindi and Hinglish reasonably, and follows a JSON schema well.
// qwen2.5:7b answers better if the machine has the RAM (8 GB+) or a GPU.
export const DEFAULT_OLLAMA_MODEL = 'qwen2.5:3b';
export const DEFAULT_OLLAMA_TIMEOUT_MS = 120_000;

const setupHint = (url, model) => `Ollama not reachable at ${url}. Start it (open the Ollama app, or run \`ollama serve\`) and run \`ollama pull ${model}\`.`;

/** Converts the Anthropic-style params chatHandler builds into an Ollama /api/chat body. */
export function toOllamaRequest(params, model) {
  const systemText = (params.system || []).map((b) => (typeof b === 'string' ? b : b.text)).join('\n\n');
  const body = {
    model,
    stream: false,
    messages: [...(systemText ? [{ role: 'system', content: systemText }] : []), ...params.messages.map((m) => ({ role: m.role, content: m.content }))],
    // A low temperature keeps small local models on the JSON format and the sources.
    options: { num_predict: params.max_tokens, temperature: 0.2 },
  };
  const schema = params.output_config?.format?.schema;
  if (schema) body.format = schema; // Ollama structured outputs take a plain JSON schema
  return body;
}

/** Converts an Ollama /api/chat response into the Anthropic message shape chatHandler reads. */
export function fromOllamaResponse(data, model) {
  // Some local models think out loud in <think> tags before the answer.
  const text = String(data?.message?.content || '')
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .trim();
  return {
    model: data?.model || model,
    stop_reason: data?.done_reason === 'length' ? 'max_tokens' : 'end_turn',
    content: text ? [{ type: 'text', text }] : [],
    usage: {
      input_tokens: data?.prompt_eval_count,
      output_tokens: data?.eval_count,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  };
}

export function createOllamaMessageFn({
  url = DEFAULT_OLLAMA_URL,
  model = DEFAULT_OLLAMA_MODEL,
  timeoutMs = DEFAULT_OLLAMA_TIMEOUT_MS,
  fetchImpl = fetch,
} = {}) {
  const base = url.replace(/\/+$/, '');
  return async (params) => {
    let res;
    try {
      res = await fetchImpl(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toOllamaRequest(params, model)),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      const timedOut = cause?.name === 'TimeoutError' || cause?.name === 'AbortError';
      const err = new Error(timedOut ? `Ollama took longer than ${Math.round(timeoutMs / 1000)} s to answer (OLLAMA_TIMEOUT_MS).` : setupHint(base, model));
      err.status = timedOut ? 504 : 502;
      throw err;
    }
    if (res.ok) return fromOllamaResponse(await res.json(), model);
    let detail = '';
    try {
      detail = (await res.json())?.error || '';
    } catch {
      /* non-JSON error body */
    }
    const err = new Error(`Ollama ${res.status}${detail ? `: ${detail}` : ''}${res.status === 404 ? ` Run \`ollama pull ${model}\`.` : ''}`);
    err.status = res.status;
    throw err;
  };
}

/**
 * Startup check for the terminal: is Ollama running, and is the model pulled?
 * Returns [ai] lines to print (empty when all is well).
 */
export async function checkOllamaSetup({ url = DEFAULT_OLLAMA_URL, model = DEFAULT_OLLAMA_MODEL, fetchImpl = fetch } = {}) {
  const base = url.replace(/\/+$/, '');
  let tags;
  try {
    const res = await fetchImpl(`${base}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`http-${res.status}`);
    tags = await res.json();
  } catch {
    return [`[ai] ${setupHint(base, model)}`];
  }
  const names = (tags?.models || []).map((m) => m.name || m.model);
  const pulled = names.some((n) => n === model || n === `${model}:latest` || n.replace(/:latest$/, '') === model);
  return pulled ? [] : [`[ai] Ollama is running but "${model}" isn't downloaded yet. Run \`ollama pull ${model}\` (or set OLLAMA_MODEL to one of: ${names.join(', ') || 'none'}).`];
}
