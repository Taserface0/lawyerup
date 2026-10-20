// Picks the AI provider from environment variables.
//   AI_PROVIDER=anthropic | gemini   (optional; otherwise whichever key is set,
//                                     preferring Anthropic when both are)
//   ANTHROPIC_API_KEY, CLAUDE_MODEL
//   GEMINI_API_KEY,    GEMINI_MODEL
// Returns null when the chosen provider has no key, so the app shows its
// "assistant not connected" message instead of failing.

import { DEFAULT_MODEL } from './chatHandler.js';
import { DEFAULT_GEMINI_MODEL } from './geminiClient.js';

export function resolveProvider(env = process.env) {
  const requested = (env.AI_PROVIDER || '').trim().toLowerCase();
  const name = requested || (env.ANTHROPIC_API_KEY ? 'anthropic' : env.GEMINI_API_KEY ? 'gemini' : null);
  if (name === 'anthropic') {
    return { name, apiKey: cleanKey(env.ANTHROPIC_API_KEY), model: env.CLAUDE_MODEL || DEFAULT_MODEL };
  }
  // Any Gemini key format works (older "AIza…" keys and the newer "AQ." auth
  // keys from AI Studio); it is sent as-is in the x-goog-api-key header.
  if (name === 'gemini') {
    const requestedModel = (env.GEMINI_MODEL || '').trim().replace(/^models\//, '');
    // A full model id looks like "gemini-3.8-flash"; a bare "gemini" or a
    // typo would make every request fail with 404, so fall back instead.
    const valid = /^gemini-[\w.-]+$/.test(requestedModel);
    return {
      name,
      apiKey: cleanKey(env.GEMINI_API_KEY),
      model: valid ? requestedModel : DEFAULT_GEMINI_MODEL,
      warning:
        requestedModel && !valid
          ? `GEMINI_MODEL="${requestedModel}" is not a Gemini model id (e.g. ${DEFAULT_GEMINI_MODEL}); using ${DEFAULT_GEMINI_MODEL}.`
          : null,
    };
  }
  if (name) throw new Error(`Unknown AI_PROVIDER "${env.AI_PROVIDER}". Use "anthropic" or "gemini".`);
  return { name: null, apiKey: '', model: null };
}

// Tolerates the usual copy-paste slips: surrounding spaces or quotes.
function cleanKey(value) {
  return (value || '').trim().replace(/^["']|["']$/g, '').trim();
}

/**
 * One-line, key-free description of the AI setup for the terminal, plus
 * hints for the usual setup mistakes.
 * @param {object} env
 * @param {{ exampleEnv?: object, hasDotEnv?: boolean }} [files]
 */
export function describeSetup(env, { exampleEnv = {}, hasDotEnv = true } = {}) {
  const lines = [];
  let provider;
  try {
    provider = resolveProvider(env);
  } catch (err) {
    return [`[ai] ${err.message}`];
  }
  if (provider.name && provider.apiKey) lines.push(`[ai] Assistant connected: ${provider.name} (${provider.model}).`);
  else lines.push('[ai] No AI key found, so the chatbot will say it is not connected.');
  if (provider.warning) lines.push(`[ai] ${provider.warning}`);
  if (!provider.apiKey && (exampleEnv.GEMINI_API_KEY || exampleEnv.ANTHROPIC_API_KEY)) {
    lines.push('[ai] Your key is in .env.example. Put it in a file named .env (same folder) instead, then restart.');
  } else if (!provider.apiKey && !hasDotEnv) {
    lines.push('[ai] There is no .env file. Run: copy .env.example .env  then add your key and restart.');
  }
  return lines;
}

/** @returns {Promise<{ name: string, model: string, createMessage: Function } | null>} */
export async function createModelClient(env = process.env) {
  const { name, apiKey, model } = resolveProvider(env);
  if (!name || !apiKey) return null;
  if (name === 'gemini') {
    const { createGeminiMessageFn } = await import('./geminiClient.js');
    const fallbackModels = env.GEMINI_FALLBACK_MODELS
      ? env.GEMINI_FALLBACK_MODELS.split(',').map((m) => m.trim()).filter(Boolean)
      : undefined;
    return { name, model, createMessage: createGeminiMessageFn(apiKey, { model, fallbackModels }) };
  }
  const { createAnthropicMessageFn } = await import('./anthropicClient.js');
  return { name, model, createMessage: createAnthropicMessageFn(apiKey) };
}
