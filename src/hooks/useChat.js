import { useAppState, useAppDispatch } from '../context/AppContext.jsx';
import { askLegalAssistant } from '../lib/claudeApi.js';
import { useTranslation } from './useTranslation.js';

export function useChat() {
  const { chatMessages, chatBusy } = useAppState();
  const dispatch = useAppDispatch();
  const { t, lang } = useTranslation();

  async function sendMessage(text) {
    if (!text || !text.trim() || chatBusy) return;

    const userMessage = { role: 'user', content: text };
    dispatch({ type: 'ADD_CHAT_MESSAGE', payload: userMessage });
    dispatch({ type: 'SET_CHAT_BUSY', payload: true });

    try {
      const parsed = await askLegalAssistant([...chatMessages, userMessage], {
        langCode: lang,
        noKeyFallback: { reply: t('chat.noKeyFallback'), category: null, urgency: 'low' },
      });
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          role: 'assistant',
          content: parsed.reply,
          category: parsed.category,
          urgency: parsed.urgency,
          citations: parsed.citations || [],
          followUps: parsed.followUps || [],
          redacted: parsed.safety?.redacted || [],
        },
      });
    } catch (err) {
      // Dev builds append the server's diagnosis (developer-facing, English).
      const detail = import.meta.env.DEV && err?.detail ? `\n\n[dev] ${err.detail}` : '';
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: { role: 'assistant', content: t(err?.busy ? 'chat.busyError' : 'chat.fallbackError') + detail },
      });
    } finally {
      dispatch({ type: 'SET_CHAT_BUSY', payload: false });
    }
  }

  return { chatMessages, chatBusy, sendMessage };
}
