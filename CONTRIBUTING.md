# Contributing

1. Read [AGENTS.md](AGENTS.md): the house rules (inspect first, propose before architectural changes, i18n parity, don't touch `#root`/`#app` CSS).
2. `npm install`, then `cp .env.example .env`.
3. Make the smallest change that solves the problem. Put any new user-facing text in **all three** of `src/i18n/en.js`, `hi.js` and `hinglish.js`.
4. Before opening a pull request, run:

   ```bash
   npm run ci      # lint, i18n parity, unit tests, build
   npm run eval    # retrieval and guardrail evals
   ```

5. Changing the AI prompt, model or knowledge base? Also run `npm run eval -- --live` and paste the summary line into the PR.
6. Describe what you verified in a browser and what you didn't.
