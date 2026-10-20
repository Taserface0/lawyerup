// Minimal .env loader for `npm start` (Vite loads .env itself in dev).
// Values already set in the real environment win. No dependency needed.

import { readFileSync } from 'node:fs';

export function parseDotEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).replace(/^export\s+/, '').trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '');
    }
    out[key] = value;
  }
  return out;
}

export function loadDotEnv(path, env = process.env) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return false;
  }
  for (const [k, v] of Object.entries(parseDotEnv(text))) {
    if (env[k] === undefined || env[k] === '') env[k] = v;
  }
  return true;
}
