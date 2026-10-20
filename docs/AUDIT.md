# Audit: Lawyerup v7 → v8 (20 October 2026)

Scope: the whole `Lawyerup v7` source tree (81 files). Each finding lists where it was, why it matters and what changed. "Open" items need a decision or a real backend.

Severity: **Critical**: data or money at risk, or legal exposure. **High**: a user sees wrong information or a core flow breaks. **Medium**: wrong in edge cases. **Low**: polish or hygiene.

## Security

| # | Sev | Finding | Fix |
|---|---|---|---|
| S1 | Critical | Anthropic API key shipped inside the browser bundle (`VITE_ANTHROPIC_API_KEY`, `anthropic-dangerous-direct-browser-access`). Anyone could copy it and spend on your account. | Moved every model call to a server-side `/api/chat` proxy (`server/`). The browser bundle contains no key; CI greps `dist/` to enforce it. |
| S2 | High | Mock admin console (approve lawyers, change KYC, delete accounts) was linked from the sign-in screen in production builds with no authentication. | Admin route and link exist only in dev builds, or when `VITE_ENABLE_MOCK_ADMIN=true` for a private demo; otherwise the code is tree-shaken out. |
| S3 | High | OTP verification allowed unlimited guesses at a 4-digit code (9,000 possibilities). | Codes are invalidated after 5 wrong attempts and must be re-sent. |
| S4 | Medium | No rate limiting or request size limit on the AI endpoint (once it exists). | Per-IP token bucket (10/min), 64 KB body cap, 2,000-character message cap, 12-turn history window. |
| S5 | Medium | Prompt injection: user text was concatenated into the conversation unmarked. | User text is XML-escaped inside `<user_question>`, the system prompt treats it as data, roles are validated server-side. |
| S6 | Medium | Production server had no security headers. | CSP, `X-Frame-Options: DENY`, `nosniff`, Referrer and Permissions policies; path traversal tested. |
| S7 | Low | Password minimum was 6 characters. | 8 characters (all three languages updated). Real hashing still needs the backend. |
| S8 | Open | Passwords stored as base64 in `localStorage`, sessions unsigned. | Documented; must be replaced by server-side argon2/bcrypt and httpOnly sessions before launch. |

## Bugs

| # | Sev | Finding | Fix |
|---|---|---|---|
| B1 | High | Every booking was saved with `date: 'Today'` whatever slot was picked, so a booking for next week showed as "Today" in Bookings and on the lawyer's dashboard. | The appointment now records the slot's real date (e.g. "14 Jul 2026"). |
| B2 | High | A signed-in **lawyer** could book consultations (as a client, with their own email). | Booking requires a client account; lawyers see a translated message. |
| B3 | Medium | Approving the demo lawyer listed Adv. Rekha Menon twice (both entries had id 1). That was the real cause of the duplicate-key warning, previously hidden with index-based keys. | Marketplace merges entries by id; keys are stable ids again. |
| B4 | Medium | An unverified lawyer (Adv. Arjun Desai) was listed and bookable under "Find a verified lawyer". | Only verified lawyers are listed or bookable. |
| B5 | Medium | Pressing Enter while the AI was replying cleared the input and silently dropped the message. | Enter respects the disabled state; empty messages can't be sent. |
| B6 | Medium | Case numbers used `length + 1`, so they could repeat after an account deletion. | `max + 1`. |
| B7 | Low | New lawyers displayed "★ 0 (0)". | They show "New" (translated). |
| B8 | Low | Theme and language reset on every reload; `<html lang>` stayed `en` while the UI was in Hindi. | Both persist; `lang` is set to `hi` / `hi-Latn` / `en`. |
| B9 | Low | Mobile validation accepted numbers that can't be Indian mobiles (e.g. starting with 0). | Must start with 6–9. |
| B10 | Low | Model id `claude-sonnet-5` hard-coded with fragile JSON parsing (stripping code fences by regex). | Model configurable on the server (default `claude-opus-5-5`); JSON-schema structured output; refusal and truncation handled. |

## Legal and compliance (India)

| # | Sev | Finding | Fix |
|---|---|---|---|
| L1 | Critical | No privacy notice, terms or grievance officer, yet the app collects identity, location and legal-matter data (DPDP Act 2023; IT Rules 2021 r.3). The KYC consent text referred to a Privacy Policy that didn't exist. | Drafted privacy notice, terms and AI disclaimer (`docs/legal/`), plus an in-app Legal screen in all three languages. Placeholders remain for entity name and grievance officer. |
| L2 | High | No way for a user to delete their own account (DPDP s.12 right to erasure); only the dev admin could. | "Delete my account and data" in Profile: erases profile, bookings, cases and messages, and anonymises reviews. |
| L3 | High | Booking confirmation claimed "A confirmation has been sent to your WhatsApp", which never happened (misleading; Consumer Protection Act). | Honest copy in all three languages. |
| L4 | Medium | Emergency guidance said "100 (Police)". India's single emergency number is 112; cyber-fraud (1930) and free legal aid (15100) were missing. | Updated in the prompt, the urgent tag and the new emergency card. |
| L5 | Medium | Bar Council of India Rule 36 (no solicitation or advertising by advocates). Marketplace ranking and listing content need to stay factual. | Terms state factual-only listings, no paid ranking and no fee-sharing (flat platform fee). Open: get a lawyer's opinion on displaying star ratings. |
| L6 | Medium | Static seed reviews and ratings look like real testimonials. | Open: label demo data as sample content, or remove it before a public launch. |
| L7 | Open | KYC is a 1.6-second fake approval. | Needs a licensed KYC provider (e.g. DigiLocker) and a compliance design, as the README already notes. |

## AI quality and safety

| # | Finding | Fix |
|---|---|---|
| A1 | Answers were ungrounded: the model was told "don't fabricate sections", with no source material and no check. | Retrieval over a curated statute knowledge base, citations restricted to retrieved passages, and hallucinated ids dropped and logged. |
| A2 | Personal data (Aadhaar, PAN, phone, cards) was sent to a third-party model verbatim. | Redacted server-side before the request; the user sees a privacy note. |
| A3 | Emergency handling relied entirely on the model. | Deterministic crisis detection (en/hi/Hinglish) shows helplines instantly in the browser and forces high urgency server-side. |
| A4 | No way to measure answer quality. | 29-case golden eval set (offline in CI; live mode for model and prompt changes). |
| A5 | No cost or latency visibility. | Structured per-turn logs with token, cache and latency fields; cached system prompt. |
| A6 | Not accessible to users who can't type comfortably. | Voice input and read-aloud in Indian English and Hindi. |

## Accessibility

Theme and language toggles, chips and role cards were click-only `<div>`s. They are now buttons or have `role="button"` and keyboard handlers, with translated `aria-label`s and visible focus rings. The chat input has a label. Open: run a screen-reader pass in a real browser.

## Project hygiene added

README rewrite, AGENTS.md, CONTRIBUTING, SECURITY, CHANGELOG, LICENSE (proprietary placeholder), ESLint, Vitest (48 tests), i18n parity script, eval harness, GitHub Actions CI, `.env.example` split into server and client variables, and SEO and favicon meta in `index.html`.

## Known open items

1. Real backend (auth, hashing, sessions, payments, document storage) per the existing `src/services` contract.
2. Lawyer review of `docs/legal/*` and of every passage in `src/ai/knowledge.js`.
3. Run `npm run eval -- --live` with a real key and record the baseline before changing the prompt or model.
4. Dev-only dependency advisories (vitest 2 / esbuild dev server). No production dependency is affected (`npm audit --omit=dev` is clean); clear them with an upgrade to Vite 7 + Vitest 4 as a separate change.
5. Browser verification of the new UI (chat sources, emergency card, voice buttons, Legal screen, delete account). This audit verified logic and the production build, not rendering.
