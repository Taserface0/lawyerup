import { useState } from 'react';
import Icon from '../icons/Icon.jsx';
import { useTranslation } from '../hooks/useTranslation.js';
import { useSpeechRecognition } from '../hooks/useVoice.js';

export default function ChatInput({ onSend, disabled }) {
  const [value, setValue] = useState('');
  const { t, lang } = useTranslation();
  const voice = useSpeechRecognition({
    lang,
    // A finished utterance is sent straight away, so a user who can't or
    // doesn't want to type can have a hands-free conversation.
    onFinal: (text) => {
      if (!disabled) onSend(text, { viaVoice: true });
    },
  });
  const listening = voice.status === 'listening';

  function handleSend() {
    // Enter used to bypass the disabled button: the text was cleared while a
    // reply was still loading and the message silently dropped.
    if (disabled || !value.trim()) return;
    onSend(value, { viaVoice: false });
    setValue('');
  }

  const voiceHint =
    voice.status === 'denied' ? t('voice.micDenied') : voice.status === 'no-speech' ? t('voice.noSpeech') : null;

  return (
    <div className="chat-input-wrap">
      {voiceHint && (
        <p className="voice-hint" role="status">
          {voiceHint}
        </p>
      )}
      <div className="chat-input">
        <input
          type="text"
          aria-label={t('a11y.chatInput')}
          maxLength={2000}
          placeholder={listening ? t('voice.listening') : t('chat.inputPlaceholder')}
          value={listening ? voice.interim : value}
          readOnly={listening}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        {voice.supported && (
          <button
            type="button"
            className={`mic-btn ${listening ? 'listening' : ''}`}
            onClick={listening ? voice.stop : voice.start}
            disabled={disabled && !listening}
            aria-pressed={listening}
            aria-label={listening ? t('voice.stopListening') : t('voice.startListening')}
          >
            <Icon name="mic" />
          </button>
        )}
        <button type="button" onClick={handleSend} disabled={disabled || !value.trim()} aria-label={t('a11y.sendMessage')}>
          <Icon name="send" />
        </button>
      </div>
    </div>
  );
}
