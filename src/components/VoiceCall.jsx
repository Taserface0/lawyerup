import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../icons/Icon.jsx';
import { useTranslation } from '../hooks/useTranslation.js';
import { useSpeechRecognition, useSpeechSynthesis } from '../hooks/useVoice.js';
import { detectCrisis } from '../ai/guardrails.js';

// =============================================================================
// Hands-free voice call with the Know Your Rights assistant.
//
//   listening ──(you finish speaking)──▶ thinking ──(answer arrives)──▶ speaking
//       ▲                                                                   │
//       └──────────────────(answer finished, or you tap to interrupt)───────┘
//
// Questions go through the normal chat (onSend), so they get the same server
// guardrails (PII redaction, retrieval, citation checks) and the whole call
// stays in the chat history afterwards. Crisis language shows the helplines
// on the call screen as well. After three silent turns the call pauses
// instead of listening forever.
// =============================================================================

const MAX_SILENT_TURNS = 3;

export default function VoiceCall({ onClose, onSend, chatMessages }) {
  const { t, lang } = useTranslation();
  const [phase, setPhase] = useState('listening'); // listening | thinking | speaking | paused | denied
  const [heard, setHeard] = useState('');
  const [answer, setAnswer] = useState('');
  const [emergency, setEmergency] = useState(false);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const activeRef = useRef(true);
  const silentTurnsRef = useRef(0);
  const sentAtCountRef = useRef(null);
  const messageCountRef = useRef(chatMessages.length);
  messageCountRef.current = chatMessages.length;
  const onSendRef = useRef(onSend);
  onSendRef.current = onSend;
  const listenRef = useRef(() => {});

  const tts = useSpeechSynthesis({ lang });
  const stt = useSpeechRecognition({
    lang,
    onFinal: (text) => {
      if (!activeRef.current || phaseRef.current === 'thinking') return;
      silentTurnsRef.current = 0;
      setHeard(text);
      setAnswer('');
      if (detectCrisis(text).isEmergency) setEmergency(true);
      setPhase('thinking');
      sentAtCountRef.current = messageCountRef.current;
      onSendRef.current(text);
    },
    onEnd: ({ text, error }) => {
      if (!activeRef.current || text) return;
      if (error === 'not-allowed' || error === 'service-not-allowed') {
        setPhase('denied');
        return;
      }
      if (phaseRef.current !== 'listening') return; // paused or ended on purpose
      if (error === 'aborted' || error === 'busy') {
        // The browser cut the session short (e.g. React re-mount in dev): just listen again.
        setTimeout(() => listenRef.current(), 300);
        return;
      }
      silentTurnsRef.current += 1;
      if (silentTurnsRef.current >= MAX_SILENT_TURNS) setPhase('paused');
      else setTimeout(() => listenRef.current(), 300);
    },
  });

  const listen = useCallback(() => {
    if (!activeRef.current) return;
    setPhase('listening');
    stt.start();
  }, [stt]);
  listenRef.current = listen;

  // Start listening as soon as the call opens; release mic and speaker on close.
  useEffect(() => {
    activeRef.current = true;
    listenRef.current();
    return () => {
      activeRef.current = false;
      stt.abort();
      tts.cancel();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When the answer to our question lands in the chat, speak it, then listen again.
  useEffect(() => {
    if (phaseRef.current !== 'thinking' || sentAtCountRef.current === null) return;
    const latest = chatMessages[chatMessages.length - 1];
    if (chatMessages.length < sentAtCountRef.current + 2 || latest?.role !== 'assistant') return;
    sentAtCountRef.current = null;
    if (latest.urgency === 'high') setEmergency(true);
    setAnswer(latest.content);
    setPhase('speaking');
    tts.speak(latest.content, {
      onEnd: () => {
        if (activeRef.current && phaseRef.current === 'speaking') listenRef.current();
      },
    });
  }, [chatMessages, tts]);

  function tapOrb() {
    if (phase === 'speaking') {
      tts.cancel(); // interrupt the answer and let the user talk
      listen();
    } else if (phase === 'listening') {
      stt.stop(); // "I'm done talking"
    } else if (phase === 'paused' || phase === 'denied') {
      silentTurnsRef.current = 0;
      listen();
    }
  }

  function togglePause() {
    if (phase === 'paused') {
      silentTurnsRef.current = 0;
      listen();
      return;
    }
    if (phase === 'thinking') return;
    setPhase('paused');
    stt.abort();
    tts.cancel();
  }

  const endCall = useCallback(() => {
    activeRef.current = false;
    stt.abort();
    tts.cancel();
    onClose();
  }, [stt, tts, onClose]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && endCall();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [endCall]);

  const status = {
    listening: t('voice.callListening'),
    thinking: t('voice.callThinking'),
    speaking: t('voice.callSpeaking'),
    paused: t('voice.callPaused'),
    denied: t('voice.micDenied'),
  }[phase];
  const orbIcon = phase === 'speaking' ? 'speaker' : phase === 'paused' || phase === 'denied' ? 'micOff' : 'mic';
  const youSaid = stt.interim || heard;

  return (
    <div className="voice-call" role="dialog" aria-modal="true" aria-label={t('voice.callTitle')}>
      <div className="voice-call-inner">
        <div className="voice-call-top">
          <b>{t('voice.callTitle')}</b>
          <span>{t('chat.headerSubtitle')}</span>
        </div>

        <button type="button" className={`voice-orb ${phase}`} onClick={tapOrb} aria-label={status}>
          <span className="voice-orb-ring" />
          <span className="voice-orb-core">
            <Icon name={orbIcon} />
          </span>
        </button>

        <p className="voice-status" aria-live="polite">
          {status}
        </p>

        <div className="voice-transcript">
          {youSaid && <p className="voice-you">“{youSaid}”</p>}
          {answer && phase !== 'thinking' && <p className="voice-ai">{answer}</p>}
        </div>

        {emergency && (
          <div className="emergency-card" role="alert">
            <Icon name="alert" />
            <div>
              <b>{t('chat.emergencyTitle')}</b>
              <span>{t('chat.emergencyLines')}</span>
            </div>
          </div>
        )}

        <div className="voice-controls">
          <button
            type="button"
            className="voice-ctrl"
            onClick={togglePause}
            disabled={phase === 'thinking'}
            aria-pressed={phase === 'paused'}
          >
            <Icon name={phase === 'paused' ? 'mic' : 'micOff'} />
            <span>{phase === 'paused' ? t('voice.callResume') : t('voice.callPause')}</span>
          </button>
          <button type="button" className="voice-ctrl end" onClick={endCall}>
            <Icon name="phone" />
            <span>{t('voice.callEnd')}</span>
          </button>
        </div>

        <p className="voice-hint">{t('voice.callHint')}</p>
      </div>
    </div>
  );
}
