import { describe, it, expect, vi } from 'vitest';
import { pcmToWav, pickTtsModel, createTtsSynthesizer, createTtsMiddleware } from '../server/tts.js';
import { pickBrowserVoice } from '../src/hooks/useVoice.js';

describe('Gemini speech', () => {
  it('wraps PCM in a valid WAV header', () => {
    const wav = pcmToWav(Buffer.alloc(480), 24000);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.readUInt32LE(40)).toBe(480);
    expect(wav.length).toBe(524);
  });

  it('picks a flash speech model from the model list', () => {
    const models = [
      { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-pro-tts', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-flash-tts', supportedGenerationMethods: ['generateContent'] },
    ];
    expect(pickTtsModel(models)).toBe('gemini-flash-tts');
    expect(pickTtsModel([{ name: 'models/gemini-3.8-flash' }])).toBeNull();
  });

  it('sends only the answer text for audio in the chosen voice and returns a WAV', async () => {
    const requests = [];
    const fetchImpl = vi.fn(async (url, init) => {
      requests.push({ url, body: init?.body && JSON.parse(init.body) });
      if (url.includes('/models?')) return { ok: true, json: async () => ({ models: [{ name: 'models/gemini-x-flash-tts' }] }) };
      return {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: Buffer.alloc(100).toString('base64') } }] } }],
        }),
      };
    });
    const synth = createTtsSynthesizer('k', { fetchImpl, voice: 'Sulafat' });
    const { wav, model } = await synth('Call 112.');
    expect(model).toBe('gemini-x-flash-tts');
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    const body = requests[1].body;
    expect(body.generationConfig.responseModalities).toEqual(['AUDIO']);
    expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Sulafat');
    expect(body.contents[0].parts[0].text).toBe('Call 112.');
    expect(body.contents[0].parts[0].text).not.toMatch(/read this aloud|calm, warm|शांत, गर्मजोशी/i);
  });

  it('reports "not configured" without a Gemini key, so the browser voice is used', async () => {
    const mw = createTtsMiddleware({ env: {} });
    const res = { setHeader() {}, end: vi.fn() };
    await mw({ method: 'POST', headers: {}, socket: {} }, res);
    expect(res.statusCode).toBe(503);
  });
});

describe('pickBrowserVoice', () => {
  const voices = [
    { name: 'Microsoft Heera - English (India)', lang: 'en-IN', localService: true },
    { name: 'Microsoft Neerja Online (Natural) - English (India)', lang: 'en-IN', localService: false },
    { name: 'Google UK English Female', lang: 'en-GB', localService: false },
    { name: 'Microsoft Swara Online (Natural) - Hindi (India)', lang: 'hi-IN', localService: false },
  ];
  it('prefers natural voices in the right language', () => {
    expect(pickBrowserVoice(voices, 'en-IN').name).toMatch(/Neerja/);
    expect(pickBrowserVoice(voices, 'hi-IN').name).toMatch(/Swara/);
    expect(pickBrowserVoice([], 'hi-IN')).toBeNull();
  });
});
