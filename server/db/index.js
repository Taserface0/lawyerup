// SQLite database for app data, using Node's built-in node:sqlite (Node
// 22.13+), so there is no native module to build. Everything else talks to
// the repository functions in users.js, never to SQL directly, so a
// Postgres version could replace this file later.
//
//   DB_PATH   optional; defaults to data/lawyerup.db in the project root.
//             ':memory:' gives a throwaway database (used by the tests).

import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Loaded with require so Vite/Vitest leave this newer built-in alone.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

export const DEFAULT_DB_PATH = fileURLToPath(new URL('../../data/lawyerup.db', import.meta.url));
const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations/', import.meta.url));

export function openDatabase(path = DEFAULT_DB_PATH) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  runMigrations(db);
  return db;
}

/**
 * Applies migrations/NNN_name.sql files in order, once each. Each file runs
 * in a transaction, and its version is recorded in schema_migrations, so
 * running this on every startup is safe.
 */
export function runMigrations(db, dir = MIGRATIONS_DIR) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);');
  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version));
  const files = readdirSync(dir)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort();
  for (const file of files) {
    const version = Number(file.split('_')[0]);
    if (applied.has(version)) continue;
    db.exec('BEGIN');
    try {
      db.exec(readFileSync(`${dir}${file}`, 'utf8'));
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(version, file, new Date().toISOString());
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${err.message}`);
    }
  }
}
