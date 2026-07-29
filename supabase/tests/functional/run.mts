// Functional security test runner: discovers every *.spec.sql file in this
// directory and runs it against a disposable Postgres connection (a local
// `supabase start` stack by default — see the "security:functional" npm
// script and .github/workflows/ci.yml).
//
// Isolation model (belt and suspenders, per the brief):
//   1. Each spec runs inside its own BEGIN … ROLLBACK transaction, so a spec
//      never persists writes even when it's pointed at a long-lived local
//      dev database instead of a throwaway CI one.
//   2. That transaction is expected to run against a disposable environment
//      whose migrations were just applied from scratch (`supabase start` /
//      `supabase db reset`), so specs never touch a real/shared database.
//
// _helpers.sql + _fixtures.sql are loaded into every transaction before the
// spec body runs, so each spec sees the same owner/editor/viewer/outsider/
// revoked fixtures without depending on any other spec's side effects.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;

const dir = path.dirname(fileURLToPath(import.meta.url));

const DATABASE_URL =
  process.env.SUPABASE_DB_URL ??
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const helpersSql = readFileSync(path.join(dir, '_helpers.sql'), 'utf8');
const fixturesSql = readFileSync(path.join(dir, '_fixtures.sql'), 'utf8');

const specFiles = readdirSync(dir)
  .filter((name) => name.endsWith('.spec.sql'))
  .sort();

assert.notEqual(
  specFiles.length,
  0,
  'No *.spec.sql files found under supabase/tests/functional — the suite would silently pass empty.'
);

for (const specFile of specFiles) {
  test(`security: ${specFile}`, async () => {
    const client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    try {
      await client.query('begin');
      // Fixtures run as the connection's login role (postgres), which owns
      // every table and bypasses RLS — the correct role for test setup.
      await client.query(helpersSql);
      await client.query(fixturesSql);

      const specSql = readFileSync(path.join(dir, specFile), 'utf8');
      await client.query(specSql);
    } finally {
      // Always roll back, whether the spec passed or a RAISE EXCEPTION
      // failed it — nothing this suite does is ever meant to persist.
      await client.query('rollback').catch(() => {});
      await client.end();
    }
  });
}
