import { existsSync, readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Mounts the same /api/chat handler the production server uses, so `npm run
// dev` talks to the AI provider (Claude or Gemini) through a server-side
// proxy and the API key never reaches the browser bundle.
function chatApiPlugin(env) {
  return {
    name: 'lawyerup-chat-api',
    async configureServer(server) {
      const { createChatMiddleware } = await import('./server/http.js');
      const { describeSetup } = await import('./server/provider.js');
      const { parseDotEnv } = await import('./server/env.js');
      const exampleEnv = existsSync('.env.example') ? parseDotEnv(readFileSync('.env.example', 'utf8')) : {};
      for (const line of describeSetup(env, { exampleEnv, hasDotEnv: existsSync('.env') })) console.log(line);
      const chat = createChatMiddleware({ env, exposeErrors: true });
      server.middlewares.use('/api/chat', (req, res) => chat(req, res));
      const { createTtsMiddleware } = await import('./server/tts.js');
      const tts = createTtsMiddleware({ env });
      server.middlewares.use('/api/tts', (req, res) => tts(req, res));
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
