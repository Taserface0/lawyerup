// /api/tts: natural-sounding speech for answers, using Gemini's speech
// models with the same GEMINI_API_KEY. Returns a WAV file. The browser falls
// back to its own (often robotic) voices whenever this endpoint fails, so it
// is optional: no Gemini key, quota used up, or model unavailable all still
// work, just with the browser voice.
//
//   GEMINI_TTS_MODEL   optional; otherwise the first "*tts*" model the key can use
//   GEMINI_TTS_VOICE   optional prebuilt voice (default Sulafat, a warm voice)

import { createRateLimiter } from './rateLimit.js';

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta';
const MAX_TTS_CHARS = 1500;
const MAX_BODY_BYTES = 16 * 1024;
export const DEFAULT_TTS_VOICE = 'Sulafat';

/** Wraps raw 16-bit little-endian mono PCM in a WAV header. */
export function pcmToWav(pcm, sampleRate = 24000) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Picks a speech model from the models list, preferring flash ones. */
export function pickTtsModel(models) {
  const names = (models || [])
    .filter((m) => /tts/i.test(m.name) && (m.supportedGenerationMethods || ['generateContent']).includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''));
  return names.find((n) => /flash/i.test(n) && !/preview/i.test(n)) || names.find((n) => /flash/i.test(n)) || names[0] || null;
}

export function createTtsSynthesizer(apiKey, { model, voice = DEFAULT_TTS_VOICE, fetchImpl = fetch } = {}) {
  let modelPromise = model ? Promise.resolve(model) : null;

  async function resolveModel() {
    if (!modelPromise) {
      modelPromise = fetchImpl(`${API_ROOT}/models?pageSize=200`, { headers: { 'x-goog-api-key': apiKey } })
        .then(async (res) => (res.ok ? pickTtsModel((await res.json()).models) : null))
        .catch(() => null);
    }
    const found = await modelPromise;
    if (!found) modelPromise = null; // try listing again next time
    return found;
  }

  return async function synthesize(text) {
    const ttsModel = await resolveModel();
    if (!ttsModel) throw Object.assign(new Error('No Gemini speech model available for this key'), { status: 404 });
    const res = await fetchImpl(`${API_ROOT}/models/${encodeURIComponent(ttsModel)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.json())?.error?.message || '';
      } catch {
        /* non-JSON */
      }
      if (res.status === 404 && !model) modelPromise = null;
      throw Object.assign(new Error(`Gemini TTS ${res.status}${detail ? `: ${detail}` : ''}`), { status: res.status });
    }
    const data = await res.json();
    const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part) throw Object.assign(new Error('Gemini TTS returned no audio'), { status: 502 });
    const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType || '')?.[1]) || 24000;
    return { wav: pcmToWav(Buffer.from(part.inlineData.data, 'base64'), rate), model: ttsModel };
  };
}

export function createTtsMiddleware({ env = process.env, synthesize, rateLimit = createRateLimiter({ capacity: 20, refillPerMinute: 20 }) } = {}) {
  const apiKey = (env.GEMINI_API_KEY || '').trim().replace(/^["']|["']$/g, '');
  const synth =
    synthesize ||
    (apiKey && env.GEMINI_TTS !== 'off'
      ? createTtsSynthesizer(apiKey, { model: env.GEMINI_TTS_MODEL || undefined, voice: env.GEMINI_TTS_VOICE || DEFAULT_TTS_VOICE })
      : null);

  return async function ttsMiddleware(req, res) {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method-not-allowed' });
    if (!synth) return sendJson(res, 503, { error: 'tts-not-configured' });
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    if (!rateLimit.take(ip).allowed) return sendJson(res, 429, { error: 'rate-limited' });

    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return sendJson(res, 400, { error: 'invalid-json' });
    }
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_TTS_CHARS) : '';
    if (!text) return sendJson(res, 400, { error: 'empty-text' });
    try {
      const started = Date.now();
      const { wav, model } = await synth(text);
      console.log(JSON.stringify({ event: 'tts', model, chars: text.length, ms: Date.now() - started }));
      res.statusCode = 200;
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Cache-Control', 'no-store');
      res.end(wav);
    } catch (err) {
      console.error(JSON.stringify({ event: 'tts_error', status: err?.status, message: err?.message }));
      sendJson(res, 502, { error: 'tts-failed' });
    }
  };
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

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}
