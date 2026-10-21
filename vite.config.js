import { existsSync, readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Mounts the same /api/chat handler the production server uses, so `npm run
// dev` talks to the AI provider (Claude, Gemini or a local Ollama model) through a server-side
// proxy and the API key never reaches the browser bundle.
function chatApiPlugin(env) {
  return {
    name: 'lawyerup-chat-api',
    async configureServer(server) {
      const { createChatMiddleware } = await import('./server/http.js');
      const { describeSetup, checkProviderSetup } = await import('./server/provider.js');
      const { parseDotEnv } = await import('./server/env.js');
      const exampleEnv = existsSync('.env.example') ? parseDotEnv(readFileSync('.env.example', 'utf8')) : {};
      for (const line of describeSetup(env, { exampleEnv, hasDotEnv: existsSync('.env') })) console.log(line);
      checkProviderSetup(env).then((lines) => lines.forEach((line) => console.log(line)));
      const chat = createChatMiddleware({ env, exposeErrors: true });
      server.middlewares.use('/api/chat', (req, res) => chat(req, res));
      const { createTtsMiddleware } = await import('./server/tts.js');
      const tts = createTtsMiddleware({ env });
      server.middlewares.use('/api/tts', (req, res) => tts(req, res));
      // Accounts, lawyers, bookings and cases (SQLite in data/, or DB_PATH).
      // The mock admin console and the demo lawyer are always on in dev.
      const { createAuthMiddleware } = await import('./server/auth/handler.js');
      const { createDataMiddleware } = await import('./server/data/handler.js');
      const { openDatabase } = await import('./server/db/index.js');
      // Vitest also starts this server; keep its database in memory.
      const db = openDatabase(env.DB_PATH || (process.env.VITEST ? ':memory:' : undefined));
      const { createEventHub } = await import('./server/data/events.js');
      const events = createEventHub(); // live updates, shared by /api/auth and /api/data
      const auth = createAuthMiddleware({ db, events, adminRoutes: true, seedDemo: env.SEED_DEMO_ACCOUNT !== 'false', seedDemoLawyer: true });
      const data = createDataMiddleware({ db, events, ready: auth.ready });
      server.middlewares.use('/api/auth', (req, res) => auth(req, res));
      server.middlewares.use('/api/data', (req, res) => data(req, res));
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), chatApiPlugin(env)],
    server: {
      port: 5173,
    },
    test: {
      environment: 'node',
      include: ['tests/**/*.test.{js,jsx}'],
      setupFiles: ['tests/setup.js'],
    },
  };
});
