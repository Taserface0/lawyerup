import { it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

it('en, hi and hinglish stay in exact key parity', () => {
  const out = execFileSync(process.execPath, ['scripts/check-i18n.mjs'], { encoding: 'utf8' });
  expect(out).toMatch(/i18n OK/);
});
