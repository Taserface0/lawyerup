// Framework-free HTTP glue for /api/chat, shared by the Vite dev middleware
// (vite.config.js) and the production server (server/index.js).

import { handleChat, ChatRequestError } from './chatHandler.js';
import { createModelClient } from './provider.js';
import { createRateLimiter } from './rateLimit.js';

const MAX_BODY_BYTES = 64 * 1024;

// `env` selects the provider (see provider.js). Tests can pass `client`
// ({ createMessage, model }) directly instead.
export function createChatMiddleware({ env = process.env, client, rateLimit = createRateLimiter(), exposeErrors = false } = {}) {
  const clientReady = client
    ? Promise.resolve(client)
    : createModelClient(env).catch((err) => {
        console.error(JSON.stringify({ event: 'ai_config_error', message: err.message }));
        return null;
      });

  return async function chatMiddleware(req, res) {
    if (req.method !== 'POST') return send(res, 405, { error: 'method-not-allowed' });
    const ai = await clientReady;
    if (!ai) return send(res, 503, { error: 'ai-not-configured' });

    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    const limit = rateLimit.take(ip);
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSeconds));
      return send(res, 429, { error: 'rate-limited' });
    }

    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return send(res, 400, { error: 'invalid-json' });
    }

    try {
      const result = await handleChat(body, { createMessage: ai.createMessage, model: ai.model });
      return send(res, 200, result);
    } catch (err) {
      if (err instanceof ChatRequestError) return send(res, err.status, { error: err.code });
      console.error(JSON.stringify({ event: 'chat_error', status: err?.status, message: err?.message }));
      if ([429, 503, 504].includes(err?.status)) {
        return send(res, 429, { error: 'ai-busy', ...(exposeErrors && { detail: upstreamHint(err) }) });
      }
      // Provider error messages never contain the key. Only the dev server
      // shows them in the chat; production keeps them in the logs.
      return send(res, 502, { error: 'upstream-error', ...(exposeErrors && { detail: upstreamHint(err) }) });
    }
  };
}

function upstreamHint(err) {
  const message = String(err?.message || 'unknown error').slice(0, 300);
  const hints = {
    400: 'Check the key in .env (copy it again from the provider).',
    401: 'The API key was rejected. Copy it again, or create a new one.',
    403: 'The API key is not allowed to use this model or API.',
    404: 'The model name is wrong. Remove GEMINI_MODEL / CLAUDE_MODEL from .env to use the default (for Ollama: pull the model, or fix OLLAMA_MODEL).',
    429: 'Free quota or rate limit reached. Wait a minute and try again.',
    503: 'Google says this model is overloaded; the backup models were busy too. Try again in a minute.',
    504: 'The AI took too long to answer. Try again in a minute.',
  };
  return `${message}${hints[err?.status] ? ` ${hints[err.status]}` : ''}`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('too-large'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}
