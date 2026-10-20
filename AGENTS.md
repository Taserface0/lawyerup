# AGENTS.md: rules for anyone changing this codebase

These rules apply to people and to AI coding assistants (Claude Code, Google Antigravity, Cursor, Copilot and others). They are the project owner's standing rules.

## Process

1. **Inspect before coding.** Read the files you're about to touch and the services they call. Don't assume what's there.
2. **Propose before architectural changes.** New state shape, new data model, moving files, new dependencies: write the plan first and get it approved.
3. **Smallest clean change.** Prefer targeted fixes over redesigns. Don't reformat files you aren't changing.
4. **Be honest about verification.** Logic can be checked with `npm test` (Node + localStorage polyfill). Layout, rendering and UX need a real browser; say so instead of claiming it works.

## Hard constraints

- **i18n parity.** Every user-visible string lives in `src/i18n/en.js`, `hi.js` and `hinglish.js` with identical keys and `{{placeholders}}`. Run `npm run check:i18n` after any copy change. Legal identifiers (BNS, BNSS, section numbers, lawyer names) are not translated.
- **Do not touch `#root`, `#app` or the screen container CSS** in `src/index.css`. They encode a fixed layout bug-fix. Add new styles at the end of the file.
- **The API key never reaches the browser.** Only `server/` reads AI keys (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`). Never add a `VITE_`-prefixed secret.
- **Keep the deliberate architecture:** separate Appointment and Case records; the GPS abstraction in `mockLocationService.js`; city names, never coordinates, on shared records.
- **Legal content is curated.** Changes to `src/ai/knowledge.js` must cite the real provision; don't invent section numbers. Keep evals passing (`npm run eval`).

## Before you hand work back

```bash
npm run ci        # lint + i18n parity + tests + build
npm run eval      # retrieval / guardrail evals
```

Delivery: the owner expects a zipped copy of the project folder after each change.
