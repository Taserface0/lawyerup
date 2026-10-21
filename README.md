# LawyerUp

**Know your rights under Indian law, in your language, and reach a verified lawyer with an upfront price.**

LawyerUp is a mobile-first web app for people who suddenly need legal help: stopped by police, threatened with eviction, scammed online. It has two parts:

1. **Know Your Rights assistant.** An AI chat (text or voice, in English, Hindi or Hinglish) that explains what the law says and cites the provisions it relied on. It also shows emergency helplines the moment someone describes danger.
2. **Lawyer marketplace.** Verified advocates with transparent fees, online or in-person consultations, case-specific chat, a case-resolution workflow and post-case reviews.

> Status: **v0.8.1 prototype.** The AI assistant is real (through a server-side proxy, using Google Gemini's free tier or Anthropic Claude). Accounts and logins (clients and lawyers), lawyer applications, availability, bookings, cases, consultation chat and reviews are real (a SQLite database on the server, with live updates). KYC, OTP, payments and document uploads are still simulated; see [What is real vs mocked](#what-is-real-vs-mocked).

---

## Quick start

### Windows + VS Code, step by step

1. Install **Node.js 20 LTS or newer** from <https://nodejs.org> (Node 18.18 is the minimum). Restart VS Code afterwards.
2. In VS Code: **File → Open Folder…** and pick the `Lawyerup v8.5` folder (the one that contains `package.json`).
3. Open the terminal: **Terminal → New Terminal**.
4. Install the dependencies (first time only):
   ```powershell
   npm install
   ```
5. Create your settings file:
   ```powershell
   copy .env.example .env
   ```
6. Get a **free** AI key: go to <https://aistudio.google.com/apikey>, sign in with a Google account, click **Create API key**, and copy it. New keys start with `AQ.` and older ones with `AIza`; both work. Treat it like a password: don't share screenshots of it or commit `.env`.
7. Open `.env` in VS Code and fill in these two lines, then save:
   ```
   AI_PROVIDER=gemini
   GEMINI_API_KEY=paste-your-key-here
   ```
   (No quotes, no spaces around `=`. Leave `GEMINI_MODEL` empty to use the faster `gemini-flash-lite-latest`, or set a specific model id to override it. Using Claude instead? Set `AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY=...`.)
8. Start the app:
   ```powershell
   npm run dev
   ```
   The terminal should print `[ai] Assistant connected: gemini (gemini-flash-lite-latest)`. If it prints something else, follow what it says. Open <http://localhost:5173> (Ctrl+click the link in the terminal). Use **Chrome or Edge** for the voice buttons.
9. To stop it, click in the terminal and press **Ctrl+C**. After changing `.env`, stop and start it again.

### Run with Docker

1. Install and start [Docker Desktop](https://www.docker.com/products/docker-desktop/).
2. Copy `.env.example` to `.env` if you have not already, then add your AI provider key. Docker Compose reads these settings from `.env` and passes only the server-side AI settings into the container. `.env` is excluded from the Docker build.
3. From the project folder, build and start the app:
   ```powershell
   docker compose up --build -d
   ```
4. Open <http://localhost:8080>. To view server logs, run `docker compose logs -f`; to stop the app, run `docker compose down`.

The container runs the production build on Node.js 24, exposes port 8080 by default, and includes a `/healthz` health check. The accounts database is kept in the `lawyerup-data` Docker volume, so it survives `docker compose up --build`; `docker compose down -v` deletes it. Set `PORT` in `.env` to change the host port. The AI key is supplied at container runtime; it is not baked into the image. Without an AI key, the site still runs but the live assistant is unavailable.

### Which command do I use?

| Command | When | Address |
|---|---|---|
| `npm run dev` | Everyday development. Reloads on save. Reads `.env` itself. | <http://localhost:5173> |
| `npm run build` then `npm start` | Try the production version. `npm start` serves the built `dist/` folder and also reads `.env`. Run `npm run build` again after code changes. | <http://localhost:8080> (or `PORT` from `.env`) |
| `docker compose up --build -d` | Build and run the production container. Reads server settings from `.env`. | <http://localhost:8080> (or `PORT` from `.env`) |

Both run the same `/api/chat` backend, so the key stays on your computer's server process and never reaches the browser. The terminal prints which AI is connected when you use `npm start`.

### Free Gemini vs paid Claude

| | Gemini (free tier) | Claude (paid) |
|---|---|---|
| Cost | Free, with daily request limits | Pay per use |
| Good for | Development, demos, college projects | Real users |
| Privacy | Google may use free-tier prompts to improve its products | Not used for training under API terms |

The guardrails, statute retrieval, citation checks and logs work the same with either provider (`server/provider.js`). If you hit the free limit, the chat shows an error until the quota resets.

### All scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server, with `/api/chat` mounted as middleware |
| `npm run build` / `npm start` | Production bundle / Node server for `dist/` + API |
| `npm test` | Vitest unit tests (guardrails, retrieval, API handler, providers, services, i18n) |
| `npm run lint` | ESLint (React + hooks rules) |
| `npm run check:i18n` | Fails unless `en`, `hi`, `hinglish` have identical keys and placeholders |
| `npm run eval` | Offline AI evals: retrieval and guardrails (free, runs in CI) |
| `npm run eval -- --live` | Full AI evals against the provider in `.env` (about 39 requests) |
| `npm run ci` | Everything CI runs |

On macOS or Linux use `cp .env.example .env` in step 5.

### Troubleshooting

- **"npm.ps1 cannot be loaded because running scripts is disabled"**: in the VS Code terminal dropdown pick **Command Prompt** instead of PowerShell, or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.
- **"'npm' is not recognized"**: Node isn't installed or VS Code was open during the install. Install Node, then restart VS Code.
- **Chat says the assistant isn't connected**: `.env` is missing, misnamed (Windows may save it as `.env.txt`), or the key line is empty. Fix it and restart `npm run dev`.
- **Terminal shows `Gemini API 401` or `403`**: the key was copied incompletely, was deleted, or belongs to a project without the Gemini API. Click **Copy key** in AI Studio again and paste the whole value.
- **"The AI assistant is very busy right now"**: Google's free models get overloaded at peak times. The server already retries and tries backup models (`gemini-flash-latest`, `gemini-flash-lite-latest`); if all are busy, wait a minute.
- **The voice sounds robotic**: the natural Gemini voice needs `GEMINI_API_KEY`; if its free quota is used up the app falls back to your device's voices. In that case Microsoft Edge gives the most natural ones ("Online (Natural)" voices for Indian English and Hindi).
- **Chat shows an error after working for a while**: you've probably used up the free Gemini quota for now. Wait, or switch to another key.
- **Port 5173 already in use**: another dev server is running. Close that terminal, or Vite will offer the next port.

### Demo accounts

- **Client:** `demo@lawyerup.in` / `lawyerup123` (has two past consultations)
- **Lawyer (dev only):** `demo.lawyer@lawyerup.dev` / `lawyerup123` (shown as Adv. Rekha Menon; add availability under Profile → Manage My Availability, then book it as the client)
- **Mock admin console (dev only):** Profile → "Admin review (mock)". Approve the demo lawyer here so it appears in the marketplace.

Mock OTP codes are printed to the browser console, never shown in the UI.

### Database

Accounts, login sessions, lawyer applications, availability slots, bookings (appointments), cases, consultation messages and reviews are stored by the server in a SQLite file, `data/lawyerup.db` (set `DB_PATH` to move it). It is created on first start, uses Node's built-in `node:sqlite` (Node 22.13 or newer, nothing to install), and is excluded from git and Docker builds.

- Passwords are hashed with scrypt and a per-user salt; the browser never stores one.
- The session is an httpOnly cookie (7 days); the database stores only a hash of its token.
- Every request is checked against the session on the server: a client only sees and changes their own bookings and cases, a lawyer only their own slots, bookings and cases. Only the client can request closing a case; only the assigned lawyer can keep it active or close it.
- Booking is one transaction, and each slot can be attached to only one appointment (a UNIQUE column), so the same slot can never be booked twice, even from two browsers at once. Slot times are read as India time (IST) on the server.
- The demo client account and its two past consultations are created on first start (`SEED_DEMO_ACCOUNT=false` skips them). The demo lawyer is created by `npm run dev` only (`SEED_DEMO_LAWYER=true` for `npm start`).
- Chat: only the case's client and its lawyer can read or post, a closed case is read-only, and unread badges come from per-message read receipts. Reviews: one per appointment, by its client, only after the case is closed. Lawyer ratings are computed on the server (static baseline + submitted reviews, weighted), and a deleted client's reviews are anonymised rather than removed.
- **Live updates:** each signed-in browser keeps one Server-Sent Events stream open (`GET /api/data/events`, `server/data/events.js`). When a message, booking, case change, slot or review concerns someone, the server sends them a "change" event and their browser reloads its data, so chat and badges update instantly on any device. The stream closes on sign-out (and server-side once the session ends). If it can't connect, the browser falls back to checking every 10 seconds; while connected it still checks every 60 seconds and on window focus.
- **Reset:** stop the app and delete the `data` folder. A fresh database is created on the next start.

The same account, its bookings and its chats work in any browser or device that uses the same server. The browser keeps only UI preferences (`lawyerup_prefs`: language and theme), a copy of the signed-in user's own profile for a fast first screen (`lawyerup_mock_session`, removed on sign-out) and, per tab, whether the welcome popup was shown. Older copies of moved data are deleted from the browser on load.

---

## How the AI assistant works

```
browser ──POST /api/chat──▶ sanitize ▶ redact PII ▶ retrieve statutes ▶ Gemini or Claude ▶ validate + ground citations ▶ log
   ▲  (no API key here)                                (BM25 over a        (cached system prompt,
   └── instant crisis banner (same guardrails, client-side)  curated KB)    JSON-schema output)
```

- **Key stays on the server.** The browser only calls `/api/chat`. CI checks that the built bundle has no API key in it.
- **Retrieval (RAG).** `src/ai/knowledge.js` holds about 45 curated, plain-language passages (BNSS, BNS, the Constitution's fundamental rights, IT Act, Consumer Protection Act, the Domestic Violence Act and more) with English, Hinglish and Hindi keywords. A BM25 retriever picks the top passages for each question.
- **Citation grounding.** The model may cite only passages it was given. Any other citation is dropped and counted in the logs. Each answer shows its sources under the reply.
- **Guardrails.** Aadhaar, PAN, phone, email, IFSC and card numbers are removed before anything leaves the server. Crisis language in all three languages forces `urgency: high` and shows helplines (112, 181, 1098, 1930, 15100) whatever the model says. History is bounded and validated, and user text is escaped so it can't pose as instructions.
- **Structured output.** Answers come back as JSON matching a schema: reply, category, urgency, citations, whether a lawyer is needed, and follow-up questions.
- **Two providers.** `AI_PROVIDER=gemini` (free key) or `anthropic`. A small adapter (`server/geminiClient.js`) translates the same request and response, so every guardrail applies to both.
- **Prompt caching.** The system prompt is frozen and marked `cache_control` (Claude). Per-request data (sources, language) goes in the user turn so the cached prefix stays intact.
- **Observability.** One JSON log line per turn: latency, tokens (including cache reads and writes), retrieved and cited ids, dropped citations, redaction types, crisis flags. Message text is never logged.
- **Evals.** `evals/cases.json` holds 39 golden cases across the three languages, including injection, off-topic, PII and emergency cases.
- **Voice.** Speech-to-text (`en-IN` / `hi-IN`) and read-aloud through the browser's Web Speech API. A spoken question gets a spoken answer.
- **Voice call.** The phone button in the chat header opens a hands-free call: speak, hear the answer, and it listens again. Tap the circle to interrupt, pause the mic, or end the call. Every turn goes through the same server guardrails, crisis questions show the helplines on the call screen, and the conversation stays in the chat. Works in Chrome and Edge (desktop and Android); the button is hidden where the browser can't do speech.

Details, trade-offs and next steps: [docs/AI.md](docs/AI.md).

---

## Project structure

```
server/             /api/chat: handler pipeline, provider switch (Gemini/Claude), rate limiter, prod server
server/auth/        /api/auth: client and lawyer sign-up, login, sessions, password hashing, admin review
server/data/        /api/data: marketplace, availability, booking, cases, chat, reviews (with access checks); events.js: live updates (SSE)
server/db/          SQLite database, SQL migrations, repositories (users.js, practice.js, conversations.js)
src/ai/             knowledge base, BM25 retrieval, guardrails, prompt + schema (shared by browser and server)
src/context/        AppContext: global state via useReducer
src/services/       authApi.js + serverData.js (server-backed, live updates) behind the original store files; OTP, email and location stay simulated
src/screens/        client, lawyer, consultation, admin (dev only) and legal screens
src/components/     shared UI; src/modals/ booking and profile sheets
src/i18n/           en.js / hi.js / hinglish.js (kept in strict key parity)
src/hooks/          useChat, useVoice, useTranslation, useOtpChannel, useToast
evals/              golden cases + harness       tests/   Vitest suites
docs/               AI.md, AUDIT.md, legal/ (privacy, terms, AI disclaimer drafts)
```

Architecture decisions that are deliberate (keep them):

- Appointment and Case are separate records. An appointment is a booking; a case is the ongoing relationship with its chat and resolution workflow.
- GPS goes through `mockLocationService.js` so a Capacitor build can swap in a native plugin. Raw coordinates never leave the client; appointments store a city name only.
- Each `src/services/mock*.js` file maps to a future backend endpoint, and its header comment says what replaces it.

## What is real vs mocked

| Real | Mocked (replace before launch) |
|---|---|
| AI assistant through the server proxy | Real-time delivery beyond this app (no push notifications, SMS or email) |
| Client and lawyer accounts, hashed passwords, login sessions (SQLite) | |
| Lawyer applications and admin review, availability, bookings, cases (SQLite, access-checked) | |
| Consultation chat with read receipts and live updates, reviews and server-computed ratings | |
| Retrieval, guardrails, citation checks | OTP (console), KYC (auto-approves), document upload (filename only) |
| Voice input and output (browser APIs) | Payments (no money moves), admin console (no auth, dev builds only) |
| Booking with database-level double-booking prevention | Static seed lawyers in `src/data/lawyers.js` (display data) |

## Compliance notes

LawyerUp touches regulated territory. These drafts are a starting point and **must be reviewed by a qualified Indian lawyer before launch**:

- [Privacy notice](docs/legal/PRIVACY.md), drafted for the DPDP Act 2023 and DPDP Rules 2025. The app already supports in-app account deletion and review anonymisation.
- [Terms of use](docs/legal/TERMS.md): platform-not-law-firm, Bar Council of India Rule 36 (no solicitation or paid ranking) and no fee-sharing.
- [AI disclaimer](docs/legal/AI_DISCLAIMER.md) in all three languages.

The full audit of what was found and fixed is in [docs/AUDIT.md](docs/AUDIT.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md) (house rules for humans and AI coding assistants). Report security issues as described in [SECURITY.md](SECURITY.md).

## License

Proprietary, all rights reserved. See [LICENSE](LICENSE).
