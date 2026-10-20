import { useEffect, useRef, useState } from 'react';
import { CATEGORY_MAP } from '../data/categories.js';
import Icon from '../icons/Icon.jsx';
import ChatInput from '../components/ChatInput.jsx';
import { useAppDispatch } from '../context/AppContext.jsx';
import { useChat } from '../hooks/useChat.js';
import { useTranslation } from '../hooks/useTranslation.js';
import { detectCrisis } from '../ai/guardrails.js';
import { useSpeechSynthesis, isVoiceCallSupported } from '../hooks/useVoice.js';
import VoiceCall from '../components/VoiceCall.jsx';

export default function ChatScreen() {
  const dispatch = useAppDispatch();
  const { chatMessages, chatBusy, sendMessage } = useChat();
  const { t, lang } = useTranslation();
  const bottomMarkerRef = useRef(null);
  const tts = useSpeechSynthesis({ lang });
  const [readAloud, setReadAloud] = useState(false);
  const [inCall, setInCall] = useState(false);
  const canCall = isVoiceCallSupported();
  const lastSentViaVoiceRef = useRef(false);
  const spokenCountRef = useRef(chatMessages.length);

  function handleSend(text, { viaVoice = false } = {}) {
    lastSentViaVoiceRef.current = viaVoice;
    sendMessage(text);
  }

  // Speak each NEW assistant answer when read-aloud is on, or when the
  // question itself was spoken (a voice question gets a voice answer).
  useEffect(() => {
    const latest = chatMessages[chatMessages.length - 1];
    // During a voice call the call screen does the speaking.
    if (!inCall && chatMessages.length > spokenCountRef.current && latest?.role === 'assistant') {
      if (readAloud || lastSentViaVoiceRef.current) tts.speak(latest.content);
    }
    spokenCountRef.current = chatMessages.length;
  }, [chatMessages]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleReadAloud() {
    if (readAloud) tts.cancel();
    setReadAloud((on) => !on);
  }

  function openCategory(slug) {
    dispatch({ type: 'SET_FILTER_CAT', payload: slug });
    dispatch({ type: 'SET_SCREEN', payload: 'lawyers' });
  }

  // Auto-scroll to the latest message (or the typing indicator) whenever
  // the thread changes. scrollIntoView({ block: 'end' }) aligns the
  // marker's bottom edge with the bottom of the scroll container's visible
  // area — unlike setting scrollTop = scrollHeight, it won't overshoot
  // into the reserved bottom padding and leave a dead gap under the last
  // message.
  useEffect(() => {
    bottomMarkerRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [chatMessages, chatBusy]);

  // The greeting is rendered from the translation dictionary rather than
  // stored in chat state — that way it re-renders on language change and
  // never gets sent to the API as fake conversation history.
  const chips = t('chat.chips');
  // Deterministic, client-side check so helplines appear instantly — even if
  // the AI is slow, offline, or answers without mentioning them.
  const showEmergencyCard = chatMessages.some((m) => m.role === 'user' && detectCrisis(m.content).isEmergency);

  return (
    <div className="screen active chat-screen">
      <div className="chat-header">
        <div className="chat-avatar" />
        <div>
          <b>{t('chat.headerTitle')}</b>
          <span>{t('chat.headerSubtitle')}</span>
        </div>
        {canCall && (
          <button
            type="button"
            className="icon-btn call-btn"
            onClick={() => {
              tts.cancel();
              setInCall(true);
            }}
            aria-label={t('voice.callStart')}
            title={t('voice.callStart')}
          >
            <Icon name="phone" />
          </button>
        )}
        {tts.supported && (
          <button
            type="button"
            className={`icon-btn read-aloud-btn ${readAloud ? 'on' : ''}`}
            onClick={toggleReadAloud}
            aria-pressed={readAloud}
            aria-label={readAloud ? t('voice.readAloudOff') : t('voice.readAloudOn')}
            title={readAloud ? t('voice.readAloudOff') : t('voice.readAloudOn')}
          >
            <Icon name={readAloud ? 'speaker' : 'speakerOff'} />
          </button>
        )}
      </div>

      <div className="disclaimer">
        <Icon name="info" />
        <span>{t('chat.disclaimer')}</span>
      </div>

      <div>
        <div className="msg assistant">
          <div className="bubble">{t('chat.welcome')}</div>
        </div>

        {chatMessages.map((m, i) => {
          if (m.role === 'user') {
            return (
              <div className="msg user" key={i}>
                <div className="bubble">{m.content}</div>
              </div>
            );
          }
          const category = m.category && CATEGORY_MAP[m.category];
          return (
            <div className="msg assistant" key={i}>
              <div className="bubble">
                {m.urgency === 'high' && (
                  <div className="urgent-tag">
                    <Icon name="alert" style={{ width: 13, height: 13 }} /> {t('chat.urgentTag')}
                  </div>
                )}
                {m.content}
                {m.citations?.length > 0 && (
                  <div className="citations">
                    <span className="citations-label">{t('chat.sourcesLabel')}</span>
                    <ul>
                      {m.citations.map((c) => (
                        <li key={c.id}>
                          {c.law}, {c.section}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {m.redacted?.length > 0 && <div className="redacted-note">{t('chat.redactedNotice')}</div>}
                {category && (
                  <div className="reco-card">
                    <button className="reco-btn" onClick={() => openCategory(m.category)}>
                      {t('chat.findLawyerButton', { category: t(`category.${m.category}`) })} <Icon name="arrowRight" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {showEmergencyCard && (
          <div className="emergency-card" role="alert">
            <Icon name="alert" />
            <div>
              <b>{t('chat.emergencyTitle')}</b>
              <span>{t('chat.emergencyLines')}</span>
            </div>
          </div>
        )}
        {chatBusy && (
          <div className="msg assistant">
            <div className="bubble">
              <div className="typing">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomMarkerRef} />
      </div>

      {chatMessages.length === 0 && (
        <div className="quick-chips">
          {chips.map((chip) => (
            <button type="button" className="chip" key={chip.label} onClick={() => handleSend(chip.text)}>
              {chip.label}
            </button>
          ))}
        </div>
      )}

      <ChatInput onSend={handleSend} disabled={chatBusy} />

      {inCall && <VoiceCall onClose={() => setInCall(false)} onSend={(text) => handleSend(text)} chatMessages={chatMessages} />}
    </div>
  );
}
