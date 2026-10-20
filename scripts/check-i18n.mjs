// Fails (exit 1) unless en, hi and hinglish define exactly the same keys and
// every {{placeholder}} used in English also exists in each translation.
// Run: npm run check:i18n   (also runs in CI)
import { en } from '../src/i18n/en.js';
import { hi } from '../src/i18n/hi.js';
import { hinglish } from '../src/i18n/hinglish.js';

function flatten(node, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix + key;
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, `${path}.`, out);
    else out[path] = value;
  }
  return out;
}
const placeholders = (v) => (typeof v === 'string' ? [...v.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort().join(',') : '');

const base = flatten(en);
let problems = 0;
for (const [name, dict] of Object.entries({ hi, hinglish })) {
  const flat = flatten(dict);
  for (const key of Object.keys(base)) {
    if (!(key in flat)) {
      console.error(`${name}: missing key ${key}`);
      problems++;
    } else if (placeholders(base[key]) !== placeholders(flat[key])) {
      console.error(`${name}: placeholder mismatch in ${key}`);
      problems++;
    } else if (Array.isArray(base[key]) && (!Array.isArray(flat[key]) || flat[key].length !== base[key].length)) {
      console.error(`${name}: list length mismatch in ${key}`);
      problems++;
    }
  }
  for (const key of Object.keys(flat)) {
    if (!(key in base)) {
      console.error(`${name}: extra key ${key}`);
      problems++;
    }
  }
}
if (problems) {
  console.error(`\ni18n check failed with ${problems} problem(s).`);
  process.exit(1);
}
console.log(`i18n OK — ${Object.keys(base).length} keys in parity across en, hi, hinglish.`);
