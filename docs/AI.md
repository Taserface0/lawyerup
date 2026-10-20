# Know Your Rights assistant: AI design

## Goals

1. Correct, checkable legal information. Every answer is tied to real provisions the user can verify.
2. Safety first for people in danger. Helplines never depend on the model.
3. Privacy by default. Identity numbers never leave our server.
4. Works for people who are stressed, not fluent in English, or not comfortable typing.

## Request pipeline (`server/chatHandler.js`)

| Step | What happens | Code |
|---|---|---|
| Sanitize | Only user/assistant roles, string content, ≤2,000 chars per message, last 12 turns, alternation repaired, must end with the user | `src/ai/guardrails.js` `sanitizeHistory` |
| Redact | Aadhaar, PAN, phone, email, IFSC and Luhn-valid card numbers become `[AADHAAR]` and so on, in every user turn | `redactPII` |
| Crisis check | Phrase lists in English, Hindi and Hinglish for self-harm, violence, sexual violence, child abuse and custodial abuse | `detectCrisis` |
| Retrieve | BM25 over `src/ai/knowledge.js` with the latest question plus the previous user turn; absolute and relative score cut-offs | `src/ai/retrieval.js` |
| Generate | Frozen system prompt with `cache_control`; sources, language hint and escaped question in the user turn; JSON-schema output; `effort: low` for chat latency | `src/ai/prompt.js` |
| Validate | Handles refusal and `max_tokens`; parses JSON, falling back to a safe localized answer | `chatHandler.js` |
| Ground | Citations must be ids that were retrieved this turn; others are dropped and counted | `groundCitations` |
| Override | Crisis detected means urgency is `high`, whatever the model said | `chatHandler.js` |
| Log | One JSON line: latency, tokens, cache read/write, retrieved/cited/dropped ids, redaction types, crisis kinds. **No message text.** | `chatHandler.js` |

On a safety-classifier decline the API is asked to retry on its recommended fallback model (`fallbacks: "default"`); a final refusal becomes the safe fallback answer.

## Why these choices

- **Curated KB plus BM25 instead of a vector DB.** About 30 passages, multilingual keyword aliases, deterministic and testable, no extra infrastructure. Swap `retrieve()` for hybrid search when the corpus reaches the hundreds; the signature stays the same.
- **JSON schema, not forced tool use.** Current Claude models reject forced `tool_choice`. Structured output guarantees the shape without it.
- **Language hint in the user turn.** Switching language doesn't invalidate the cached system prompt.
- **Prompt caching.** The cache only pays off once the cached prefix passes the model's minimum size. The system prompt is close to that, so watch `tokens.cacheRead` in the logs. If it stays 0, move the full knowledge-base index into the system block, which also helps answers.

## Providers

`server/provider.js` picks the model client from `.env`: `AI_PROVIDER=gemini` with `GEMINI_API_KEY` (free tier from Google AI Studio, default `gemini-flash-lite-latest` for lower response latency), or `anthropic` with `ANTHROPIC_API_KEY`. Set `GEMINI_MODEL` to override the default. `server/geminiClient.js` converts the handler's request into Gemini's REST format (system instruction, `model` role, `responseSchema` in Gemini's OpenAPI subset) and converts the answer back (finish reasons to `refusal` / `max_tokens`, usage to the same log fields). Sanitizing, redaction, crisis detection, retrieval, citation grounding and logging are provider-independent and covered by the same tests. Prompt caching and the server-side safety fallback are Claude features; Gemini gets neither, and safety blocks become the localized fallback answer.

The free Gemini tier is for development and demos: Google may use free-tier prompts to improve its products. Use a paid tier of either provider for real users.

## Model and cost

The default is `claude-opus-5-5` at `effort: low`. Set `CLAUDE_MODEL` to compare alternatives; `claude-haiku-5-5` is far cheaper and may be enough for this task. Decide with the live eval, not by guessing:

```bash
ANTHROPIC_API_KEY=... CLAUDE_MODEL=claude-haiku-5-5 npm run eval -- --live
```

## Evals (`evals/`)

`cases.json` holds 28 cases: arrest, FIR, traffic, tenancy, RERA, cyber fraud, blackmail, consumer, cheques, wages, domestic violence, self-harm, free legal aid, divorce, workplace harassment, PII, off-topic, prompt injection and outcome promises. They cover English, Hindi and Hinglish.

- **Offline** (CI): retrieval recall, crisis detection, PII redaction. Currently 28/28.
- **Live**: adds category, urgency floor, grounded citation, required helplines, Hindi script, banned phrases and length. Results go to `evals/results/` for comparison over time.

Building the eval already caught two real retrieval bugs: "blackmailing" didn't match "blackmail" (fixed with light stemming), and an off-topic poem request pulled in legal passages (fixed with score cut-offs).

## Voice (`src/hooks/useVoice.js`)

Web Speech API: recognition in `en-IN` or `hi-IN` (Hinglish uses `en-IN`, which transcribes in Roman script), and read-aloud using an Indian voice when the device has one, at a slightly slower rate. A spoken question gets a spoken answer; the speaker toggle reads every answer. Unsupported browsers hide the buttons. Speech recognition is done by the browser vendor (for example Google in Chrome); only the transcript reaches our API. Mention this in the privacy notice.

### Natural voice (`server/tts.js`)

`/api/tts` sends only the answer text to a Gemini speech model (picked from the key's model list, or `GEMINI_TTS_MODEL`) and returns a WAV using the configured prebuilt voice. Keeping speech instructions out of the text prevents the model from reading them aloud. The client requests it in parts of about 600 characters and fetches the next part while the current one plays. Any failure falls back to `speechSynthesis` with a ranked voice choice. Free-tier speech quota is small, so the fallback matters.

### Voice call (`src/components/VoiceCall.jsx`)

A small state machine on top of the same hooks: listening → thinking → speaking → listening. Each question is sent through the normal chat, so the server pipeline is unchanged and the transcript stays in the chat. The client-side crisis check runs on every spoken question. Echo is avoided by never listening while the answer is being spoken; the user interrupts by tapping instead of talking over it. Verified in headless Chromium with simulated speech APIs; real microphones, accents and Hindi recognition still need testing on devices.

## Next steps

1. Lawyer review of every knowledge-base passage; add state-specific rent laws and more family-law coverage.
2. Record a live eval baseline and add an LLM-as-judge check for "plain language and calm tone".
3. Stream responses for faster first words, especially for voice.
4. A thumbs up/down on answers, logged with the request id, to grow the eval set from real traffic.
5. Native speech (Capacitor plugin) for better Hindi recognition on Android.
