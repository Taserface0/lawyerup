# Changelog

## Unreleased

- Real client accounts: a SQLite database on the server (`server/db`, Node's built-in `node:sqlite`, versioned SQL migrations) with `/api/auth` sign-up, login, logout, current user and delete-my-account. Passwords are hashed with scrypt and a per-user salt; sessions are httpOnly, SameSite=Lax cookies (7 days) stored as token hashes. Login and sign-up are rate-limited and give one generic error for a wrong email or password.
- The browser no longer stores any password; the old mock account list is removed on first load. The same account now works from any browser that uses the same server.
- Docker: Node 24 image, database in the `lawyerup-data` volume. Requires Node 22.13+.
- 1 new string in all three languages (430 keys); 14 new tests (89 total).

Phase 2:

- Lawyers, availability, bookings and cases moved to the database (migration 002): lawyer sign-up and login (role-checked, one email = one account), the admin review of applications, slots, appointments and cases, all behind `/api/data` with access checks from the session.
- Double-booking is impossible: booking is one `BEGIN IMMEDIATE` transaction that claims the slot only while it is still available and in the future, and `appointments.slot_id` is UNIQUE. Tested with five concurrent bookings of one slot (exactly one succeeds).
- Case workflow enforced on the server: only the client can request resolution, only the assigned lawyer can keep a case active or close it, CLOSED is final, case numbers are max + 1.
- Fee, lawyer name, category and date of a booking come from the server, not the browser. Approved lawyers are published without email, phone or documents.
- The store files keep their synchronous functions, now reading a server copy that refreshes every 10 s and on focus, so the screens did not change; the old browser lists with base64 passwords are deleted on load.
- Demo data (the demo lawyer and the demo client's two past consultations) is seeded by the server.
- Fixed: the checkout and confirmation said "Today" whatever day the slot was on; the sign-up password hint said 6 characters while 8 are required; a lawyer whose session was restored by the server opened on the client Home screen.
- 1 new string (431 keys); 14 new server tests (`tests/data.test.js`), 105 total.

Phase 3:

- Consultation messages and reviews moved to the database (migration 003). Only the case's client and lawyer can read or post; a CLOSED case is read-only; messages are 1-4,000 characters and posting is rate-limited. Read receipts drive the unread badges.
- Reviews: one per appointment, by its client, only after closure (rating 1-5, text up to 2,000 characters). Lawyer ratings are now computed on the server with the same weighted formula, so they can't be changed from the browser. Deleting an account anonymises its reviews and deletes its messages.
- Live updates over Server-Sent Events (`GET /api/data/events`): one stream per signed-in browser, a heartbeat every 25 s, closed on sign-out and when the session ends. New messages, read receipts, bookings, case changes, slots and reviews reach the other person instantly on any device; polling (10 s, or 60 s while the stream is up) remains as a fallback.
- The browser no longer keeps anyone else's data: the old localStorage copies of bookings, cases, availability, messages, reviews and client profiles are deleted on load.
- Fixed: the chat notice still said messages were stored only on this device; it now says they're seen only by the client and the lawyer, and warns against sharing passwords or OTPs (all three languages).
- 9 new server tests (`tests/conversations.test.js`, including SSE delivery and close-on-sign-out) and 2 new browser-store tests; 116 total.

## 0.8.5 (2026-10-20)

- Voice capability questions now get a brief confirmation; speech transcription details are only provided when asked.
- Gemini speech sends only the assistant's reply to TTS, preventing voice style instructions from being spoken; voice interaction questions now get an accurate explanation of browser speech transcription.
- Default Gemini model is now `gemini-flash-lite-latest`; the previous default timed out before a fallback answered, adding about 45 seconds in a measured chat request.
- Gemini resilience: overloaded (503), rate-limited (429) and timed-out requests are retried, then answered by backup models (`gemini-flash-latest`, `gemini-flash-lite-latest`, configurable with `GEMINI_FALLBACK_MODELS`).
- Gemini answers use a low thinking level, so replies come back in seconds instead of 40+; models that don't accept the setting are retried without it.
- Natural voice: answers are spoken with Gemini's speech voices (warm "Sulafat" voice by default, same `GEMINI_API_KEY`, served by the new `/api/tts`), part by part so speech starts quickly. If that's unavailable, the app picks the best voice on the device, preferring Edge/Chrome "Natural" voices over the robotic built-in ones.
- Production server: microphone allowed for the app itself (voice didn't work under `npm start`), and the CSP allows the generated audio.
- When every model is busy the chat says so in plain words (in all three languages) and repeats the 112 / 15100 helplines.
- Welcome popup: signed-out visitors landing on Home get a sign in / create account sheet (once per browser session) with "Maybe later" and a link for lawyers. It closes by itself after signing in. 4 new strings in all three languages (429 keys).
- 8 new tests (72 total).

## 0.8.4 (2026-10-20)

- Voice call mode: a phone button in the chat header opens a hands-free conversation (listen → answer spoken → listen again), with tap-to-interrupt, pause and end call, in English, Hindi and Hinglish. Crisis questions show the helplines on the call screen. After three silent turns the call pauses.
- Long answers are spoken sentence by sentence, avoiding Chrome's cut-off on long speech.
- A failing speech engine can no longer crash the chat screen.
- 10 new translated strings (424 keys in parity) and 2 new tests (64 total).

## 0.8.3 (2026-10-20)

- Default Gemini model is now `gemini-3.8-flash`: Google no longer offers `gemini-2.5-flash` to new keys (it returned 404).
- If Google retires a model and names a replacement, the server switches to it automatically and says so in the terminal.
- Gemini requests use the model's default temperature, as Google recommends for current models.

## 0.8.2 (2026-10-20)

- `npm run dev` prints the AI setup at startup (`[ai] Assistant connected: gemini (gemini-2.5-flash)`) and flags common mistakes: key left in `.env.example`, no `.env` file, invalid model name.
- An invalid `GEMINI_MODEL` (for example just `gemini`) falls back to the default instead of failing every request.
- In dev builds, a failed answer shows the provider's reason under the error message (rejected key, wrong model, quota). Production still shows only the friendly message.
- Accepts both Gemini key formats (`AQ.` and `AIza`) and trims stray spaces or quotes.

## 0.8.1 (2026-10-20)

- Free AI option: Google Gemini (`AI_PROVIDER=gemini`, `GEMINI_API_KEY`) alongside Anthropic Claude. Both run through the same guardrails, retrieval and citation checks.
- `npm start` now reads `.env` (previously only `npm run dev` did).
- README: step-by-step Windows + VS Code setup, dev vs production commands, troubleshooting.
- Detention questions phrased "how long can they keep him" now find the 24-hour rule (BNSS s.58).
- Privacy notice draft covers both providers and warns that the free Gemini tier is for demos only.
- 10 new tests (58 total).

## 0.8.0 (2026-10-20)

### Security
- AI calls moved behind a server-side `/api/chat` proxy; the API key no longer ships to browsers.
- Mock admin console removed from production builds; OTP guesses capped at 5; rate limits and size limits on the AI endpoint; security headers on the production server; minimum password length raised to 8.

### AI
- Retrieval over a curated Indian-law knowledge base, with grounded citations shown under each answer.
- PII redaction, deterministic crisis detection with a helplines card, prompt-injection hardening.
- JSON-schema structured output, prompt caching, refusal fallback, structured logs.
- Voice mode: speak your question, hear the answer (English, Hindi, Hinglish).
- 28-case eval suite (offline in CI, live on demand).

### Fixes
- Bookings record the real slot date instead of "Today".
- Lawyer accounts can't book consultations.
- No duplicate lawyer listing; only verified lawyers are listed.
- Enter no longer drops a message while the AI is replying; case numbers never repeat; "New" instead of ★ 0 (0); theme and language persist; `<html lang>` follows the UI language; Indian mobile validation.

### Compliance
- Privacy notice, terms of use and AI disclaimer drafts plus an in-app Legal screen.
- Self-service account and data deletion (reviews anonymised).
- Removed a false "sent to your WhatsApp" claim; emergency numbers updated to 112, 181, 1098, 1930 and 15100.

### Project
- README, AGENTS.md, CONTRIBUTING, SECURITY, LICENSE, ESLint, Vitest (48 tests), i18n parity check, GitHub Actions CI.

## 0.7.0
- Previous prototype (client and lawyer flows, marketplace, consultations, case resolution, reviews, messages).
