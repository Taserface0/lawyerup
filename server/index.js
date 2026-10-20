// Production server: serves the built SPA from dist/ and the /api/chat proxy.
//   npm run build && npm start
// Reads the AI provider settings (see .env.example) from the environment or
// a .env file in the project root. The key never reaches the browser bundle.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createChatMiddleware } from './http.js';
import { createTtsMiddleware } from './tts.js';
import { createAuthMiddleware } from './auth/handler.js';
import { createDataMiddleware } from './data/handler.js';
import { openDatabase } from './db/index.js';
import { loadDotEnv } from './env.js';
import { resolveProvider } from './provider.js';

loadDotEnv(fileURLToPath(new URL('../.env', import.meta.url)));

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const PORT = Number(process.env.PORT) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'geolocation=(self), camera=(), microphone=(self)',
  'Content-Security-Policy':
    "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; media-src 'self' blob:",
};

const chat = createChatMiddleware({ env: process.env });
const tts = createTtsMiddleware({ env: process.env });
const db = openDatabase(process.env.DB_PATH || undefined);
const auth = createAuthMiddleware({
  db,
  adminRoutes: process.env.ENABLE_MOCK_ADMIN === 'true' || process.env.VITE_ENABLE_MOCK_ADMIN === 'true',
  seedDemo: process.env.SEED_DEMO_ACCOUNT !== 'false',
  seedDemoLawyer: process.env.SEED_DEMO_LAWYER === 'true',
});
const data = createDataMiddleware({ db, ready: auth.ready });

createServer(async (req, res) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/chat') return chat(req, res);
  if (url.pathname === '/api/tts') return tts(req, res);
  if (url.pathname.startsWith('/api/auth/')) return auth(req, res);
  if (url.pathname === '/api/data' || url.pathname.startsWith('/api/data/')) return data(req, res);
  if (url.pathname === '/healthz') return res.end('ok');

  // Static files, falling back to index.html for the single-page app.
  const safePath = normalize(url.pathname).replace(/^(\.\.[/\\])+/, '');
  let file = join(DIST, safePath);
  if (!file.startsWith(DIST)) file = join(DIST, 'index.html');
  try {
    if (!(await stat(file)).isFile()) throw new Error('dir');
  } catch {
    file = join(DIST, 'index.html');
  }
  try {
    const body = await readFile(file);
    res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
    if (safePath.replace(/\\/g, '/').startsWith('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end('Not found — run `npm run build` first.');
  }
}).listen(PORT, () => {
  console.log(`LawyerUp running on http://localhost:${PORT}`);
  let provider;
  try {
    provider = resolveProvider(process.env);
  } catch (err) {
    console.log(err.message);
    return;
  }
  if (provider.name && provider.apiKey) console.log(`AI assistant: ${provider.name} (${provider.model})`);
  else console.log('No AI key set (GEMINI_API_KEY or ANTHROPIC_API_KEY in .env), so the assistant shows its offline message.');
});
