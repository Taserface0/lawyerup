import { useCallback, useEffect, useRef, useState } from 'react';

// =============================================================================
// Voice mode for the Know Your Rights chat, built on the browser's Web Speech
// API: SpeechRecognition (speech → text) and speechSynthesis (text → speech).
// No audio leaves the device through our servers; recognition is handled by
// the browser vendor (Chrome/Edge/Safari), and only the resulting text goes
// through the usual /api/chat pipeline with its PII redaction.
//
// Browsers without support (e.g. Firefox) simply get `supported: false` and
// the UI hides the buttons. A future native (Capacitor) build can swap these
// two hooks for a plugin without touching ChatScreen.
// =============================================================================

// Indian locales give much better recognition of Indian names, places and
// accents. Hinglish is spoken Hindi-English, which en-IN transcribes in Roman
// script — the script the Hinglish UI uses.
export const SPEECH_LOCALES = { en: 'en-IN', hi: 'hi-IN', hinglish: 'en-IN' };

// Chrome stops long utterances after ~15 seconds without firing `end`, so
// answers are spoken sentence by sentence. Splits on . ! ? and the Hindi
// danda, then packs sentences into chunks of at most ~220 characters.
export function splitForSpeech(text, max = 220) {
  const sentences = String(text)
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?।])\s+/)
    .filter(Boolean);
  const chunks = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && (current + ' ' + sentence).length > max) {
      chunks.push(current);
      current = sentence;
    } else current = current ? `${current} ${sentence}` : sentence;
  }
  if (current) chunks.push(current);
  return chunks.flatMap((c) => (c.length <= max * 2 ? [c] : c.match(new RegExp(`.{1,${max}}(\\s|$)`, 'g')) || [c]));
}

function getRecognitionCtor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

/** True when this browser can both listen and speak (needed for a voice call). */
export function isVoiceCallSupported() {
  return Boolean(getRecognitionCtor()) && typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Speech-to-text. `onFinal(text)` fires once per utterance with the final
 * transcript; `interim` holds the live partial transcript while listening.
 * `onEnd({ text, error })` fires every time listening stops, heard or not,
 * so a voice call can decide whether to listen again.
 * status: 'idle' | 'listening' | 'denied' | 'no-speech'
 */
export function useSpeechRecognition({ lang, onFinal, onEnd }) {
  const Ctor = getRecognitionCtor();
  const [status, setStatus] = useState('idle');
  const [interim, setInterim] = useState('');
  const recognitionRef = useRef(null);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  useEffect(() => () => recognitionRef.current?.abort(), []);

  const start = useCallback(() => {
    if (!Ctor || recognitionRef.current) return;
    const recognition = new Ctor();
    recognition.lang = SPEECH_LOCALES[lang] || 'en-IN';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    let finalText = '';
    let lastError = null;
    recognition.onresult = (event) => {
      let partial = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const { transcript } = event.results[i][0];
        if (event.results[i].isFinal) finalText += transcript;
        else partial += transcript;
      }
      setInterim(finalText + partial);
    };
    recognition.onerror = (event) => {
      lastError = event.error;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') setStatus('denied');
      else if (event.error === 'no-speech') setStatus('no-speech');
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setInterim('');
      setStatus((s) => (s === 'listening' ? 'idle' : s));
      if (finalText.trim()) onFinalRef.current?.(finalText.trim());
      onEndRef.current?.({ text: finalText.trim(), error: lastError });
    };

    recognitionRef.current = recognition;
    setStatus('listening');
    setInterim('');
    try {
      recognition.start();
    } catch {
      // start() throws if the browser is still releasing the previous session.
      recognitionRef.current = null;
      setStatus('idle');
      onEndRef.current?.({ text: '', error: 'busy' });
    }
  }, [Ctor, lang]);

  const stop = useCallback(() => recognitionRef.current?.stop(), []);
  // abort() discards anything heard so far (used when a call is muted or ended).
  const abort = useCallback(() => recognitionRef.current?.abort(), []);

  return { supported: Boolean(Ctor), status, interim, start, stop, abort };
}

// Ranks the device's voices: right language first, then the "Natural" /
// "Online" neural voices Edge and Chrome offer, which sound far less robotic
// than the older built-in ones.
export function pickBrowserVoice(voices, locale) {
  const prefix = locale.slice(0, 2);
  let best = null;
  let bestScore = 0;
  for (const v of voices || []) {
    const lang = (v.lang || '').replace('_', '-');
    let score = lang === locale ? 6 : lang.startsWith(prefix) ? 3 : 0;
    if (!score) continue;
    if (/natural|online|neural/i.test(v.name)) score += 4;
    if (/google/i.test(v.name)) score += 2;
    if (!v.localService) score += 1;
    if (score > bestScore) [best, bestScore] = [v, score];
  }
  return best;
}

// Server voices (Gemini speech via /api/tts) are tried first. If the server
// says speech isn't configured, stop asking for the rest of the session.
let naturalVoiceAvailable = true;

async function fetchNaturalAudio(text, lang, signal) {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, lang }),
    signal,
  });
  if (res.status === 503) naturalVoiceAvailable = false;
  if (!res.ok) throw new Error(`tts-${res.status}`);
  return URL.createObjectURL(await res.blob());
}

/**
 * Text-to-speech. Uses the natural Gemini voice from the server when it is
 * available, sentence-group by sentence-group (the next part is prepared
 * while the current one plays), and otherwise the best voice on the device.
 */
export function useSpeechSynthesis({ lang }) {
  const browserTts = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const supported = browserTts || (typeof window !== 'undefined' && typeof Audio !== 'undefined');
  const [speaking, setSpeaking] = useState(false);
  // Each speak() call gets an id so a cancelled answer's late events can't
  // end (or restart) the next one.
  const runRef = useRef(0);
  const audioRef = useRef(null);
  const abortRef = useRef(null);

  const stopAll = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (browserTts) window.speechSynthesis.cancel();
  }, [browserTts]);

  useEffect(() => () => stopAll(), [stopAll]);

  /** speak(text, { onEnd }): onEnd fires once, after the last sentence or on cancel/error. */
  const speak = useCallback(
    (text, { onEnd } = {}) => {
      if (!supported || !text) {
        onEnd?.();
        return;
      }
      stopAll(); // never talk over the previous answer
      const run = ++runRef.current;
      const isCurrent = () => run === runRef.current;
      const locale = SPEECH_LOCALES[lang] || 'en-IN';
      let finished = false;
      const finish = () => {
        if (finished || !isCurrent()) return;
        finished = true;
        setSpeaking(false);
        onEnd?.();
      };
      setSpeaking(true);

      function speakWithBrowser(chunks) {
        if (!browserTts || !chunks.length) return finish();
        try {
          const voice = pickBrowserVoice(window.speechSynthesis.getVoices(), locale);
          window.speechSynthesis.cancel();
          chunks.forEach((chunk, i) => {
            const utterance = new SpeechSynthesisUtterance(chunk);
            utterance.lang = locale;
            utterance.voice = voice;
            utterance.rate = 0.95; // slightly slower: legal terms, often a stressed listener
            utterance.onerror = finish;
            if (i === chunks.length - 1) utterance.onend = finish;
            window.speechSynthesis.speak(utterance);
          });
        } catch {
          finish(); // a broken speech engine must never take the chat down with it
        }
      }

      if (!naturalVoiceAvailable) return speakWithBrowser(splitForSpeech(text));

      // Natural voice: short first part so speech starts quickly, then larger parts.
      const parts = splitForSpeech(text, 600);
      const controller = new AbortController();
      abortRef.current = controller;
      const load = (i) => (i < parts.length ? fetchNaturalAudio(parts[i], lang, controller.signal) : null);

      (async () => {
        let next = load(0);
        for (let i = 0; i < parts.length; i++) {
          let url;
          try {
            url = await next;
          } catch {
            if (!isCurrent()) return;
            return speakWithBrowser(splitForSpeech(parts.slice(i).join(' ')));
          }
          if (!isCurrent()) return URL.revokeObjectURL(url);
          next = load(i + 1);
          next?.catch(() => {}); // handled when awaited
          const played = await new Promise((resolve) => {
            const audio = new Audio(url);
            audioRef.current = audio;
            audio.onended = () => resolve(true);
            audio.onerror = () => resolve(false);
            audio.play().catch(() => resolve(false));
          });
          URL.revokeObjectURL(url);
          if (!isCurrent()) return;
          if (!played) return speakWithBrowser(splitForSpeech(parts.slice(i).join(' ')));
        }
        finish();
      })();
    },
    [supported, browserTts, lang, stopAll]
  );

  const cancel = useCallback(() => {
    runRef.current += 1;
    stopAll();
    setSpeaking(false);
  }, [stopAll]);

  return { supported, speaking, speak, cancel };
}
