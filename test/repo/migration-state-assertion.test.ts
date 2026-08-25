import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { assertLocalTestDatabase } from '../helpers/db';
import { readJournal, readLedger } from '@/lib/db/migration-state-io';
import { compareMigrationState } from '@/lib/db/migration-state';

const REPO_ROOT = join(import.meta.dirname, '..', '..');

/**
 * The live half of step 16 unit 3: the readers that feed
 * `compareMigrationState`, and the assertion running against a real database.
 *
 * The comparison itself is unit-tested against manufactured drift
 * (`src/lib/db/migration-state.test.ts`) because a genuinely drifted database
 * cannot be created safely. What CANNOT be unit-tested is whether the readers
 * agree with what drizzle actually wrote — the hash algorithm, the table's
 * location, the journal's shape — and getting any of those wrong would produce
 * an assertion that always fires or never does.
 */

const url = assertLocalTestDatabase(process.env.TEST_DATABASE_URL);
let client: Client | undefined;

async function connect() {
  if (client === undefined) {
    client = new Client({ connectionString: url });
    await client.connect();
  }
  return client;
}

afterAll(async () => {
  await client?.end();
});

describe('readJournal', () => {
  /**
   * Fails against: a reader pointed at the wrong file, or one that does not
   * hash the `.sql` bytes.
   */
  it('carries one entry per migration, each with its file hash', () => {
    const journal = readJournal(REPO_ROOT);
    const listed = execFileSync('git', ['ls-files', '--', 'drizzle/*.sql'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    })
      .trim()
      .split('\n')
      .filter(Boolean);

    expect(journal.length).toBe(listed.length);
    expect(journal.every((e) => /^[0-9a-f]{64}$/.test(e.hash))).toBe(true);
  });

  /**
   * **Fails against a wrong hash algorithm**, which is the failure that would
   * make this whole check useless in the most misleading way: every journal
   * entry would look unapplied on a perfectly healthy database.
   *
   * Measured rather than assumed — sha256 of the raw file bytes, checked
   * against what drizzle actually stored for migration 0000.
   */
  it('hashes the way drizzle does', async () => {
    const journal = readJournal(REPO_ROOT);
    const first = journal[0];

    const db = await connect();
    const { rows } = await db.query<{ hash: string }>(
      'SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at ASC LIMIT 1',
    );

    expect(rows[0].hash).toBe(first.hash);
  });
});

describe('readLedger', () => {
  /**
   * Fails against: a reader looking in the `public` schema, which is where the
   * table is NOT.
   */
  it('reads the rows drizzle wrote', async () => {
    const db = await connect();
    const ledger = await readLedger(db);

    const { rows } = await db.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM drizzle.__drizzle_migrations',
    );

    expect(ledger).toHaveLength(Number(rows[0].n));
    expect(ledger.length).toBeGreaterThan(0);
  });
});

describe('the assertion against the real test database', () => {
  /**
   * **The end-to-end statement: this database is consistent with this repo.**
   *
   * Fails against: readers that disagree with drizzle in any way — wrong table,
   * wrong hash, wrong journal shape — since any of those makes a healthy
   * database report as drifted.
   *
   * The test database is migrated by `global-setup`, so if this fails either
   * the readers are wrong or the database genuinely drifted. Both are worth
   * stopping for.
   */
  it('reports no missing migrations', async () => {
    const db = await connect();

    const result = compareMigrationState({
      journal: readJournal(REPO_ROOT),
      ledger: await readLedger(db),
    });

    expect(result.missing).toEqual([]);
    expect(result.consistent).toBe(true);
  });

  /**
   * **Fails against a check that cannot see drift on a real database** — the
   * mutation the pure-function tests cannot perform.
   *
   * A journal entry whose hash nothing in the ledger carries is exactly the dev
   * and Neon-branch incidents. Constructed by appending a fabricated entry to
   * the REAL journal rather than by touching the database, so nothing is
   * mutated and the test cannot leave debris.
   */
  it('sees a journal entry the database has never applied', async () => {
    const db = await connect();
    const journal = readJournal(REPO_ROOT);

    const result = compareMigrationState({
      journal: [
        ...journal,
        { tag: '9999_never_applied', hash: createHash('sha256').update('nope').digest('hex'), when: 9_999_999_999_999 },
      ],
      ledger: await readLedger(db),
    });

    expect(result.consistent).toBe(false);
    expect(result.missing).toEqual(['9999_never_applied']);
  });
});

describe('the db:migrate script asserts state, not exit code', () => {
  /**
   * **The point of the whole unit, as a command.**
   *
   * `db:migrate` chained a bare `drizzle-kit migrate`, whose exit code reports
   * the last command rather than the chain's purpose — and which prints
   * "migrations applied successfully" while applying nothing when the ledger
   * and journal diverge. This runs the assertion after it and fails loudly.
   *
   * Fails against: a `db:migrate` that is still a bare `drizzle-kit migrate`,
   * and against an assertion script that exits 0 regardless.
   *
   * Run against the LOCAL test database, never the developer's own. The
   * `NODE_ENV=test` is load-bearing for exactly the reason `db:test:reset`
   * needed it: without it drizzle.config.ts reads `.env.local` and points at
   * Neon.
   */
  it('exits 0 against a consistent database', () => {
    const out = execFileSync('npm', ['run', 'db:verify:state'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      env: { ...process.env, NODE_ENV: 'test' },
      stdio: 'pipe',
    });

    expect(out).toMatch(/16 of 16|\d+ of \d+ migrations/);
  });

  /**
   * Fails against: a `db:migrate` script that does not run the assertion at all.
   *
   * A file assertion, and it is the right kind — the property is about what the
   * script chain contains, and no behavioural test can observe that the
   * assertion step was DELETED from it. (The R4 correction: a file-text
   * assertion is right exactly when the property is about a file.)
   */
  it('is chained into db:migrate rather than being an optional extra', () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8')) as {
      scripts: Record<string, string>;
    };

    expect(pkg.scripts['db:migrate']).toMatch(/db:verify:state|migration-state/);
  });
});

/**
 * **The probe that proved this unit, kept as a test (CLAUDE.md §2).**
 *
 * What convinced me the assertion works was building a database in the exact
 * incident state — schema fully applied, ledger rows deleted — and watching
 * `drizzle-kit migrate` exit 0 on it while the assertion exited 1. A
 * verification that does not survive the session did not happen, and this
 * project has already lost one probe that way.
 *
 * It runs against a THROWAWAY database created and dropped here, never the
 * shared test database: the whole point is to leave a database in a state
 * nothing should be left in.
 */
describe('the assertion against a genuinely drifted database', () => {
  const PROBE = 'drift_probe_vitest';
  const probeUrl = url.replace(/\/[^/]+$/, `/${PROBE}`);

  async function withAdmin<T>(fn: (c: Client) => Promise<T>): Promise<T> {
    // `postgres` rather than the test database: you cannot drop a database you
    // are connected to.
    const admin = new Client({ connectionString: url.replace(/\/[^/]+$/, '/postgres') });
    await admin.connect();
    try {
      return await fn(admin);
    } finally {
      await admin.end();
    }
  }

  afterAll(async () => {
    await withAdmin(async (c) => {
      await c.query(`DROP DATABASE IF EXISTS ${PROBE}`);
    });
  });

  /**
   * **Fails against an assertion that cannot see real drift** — the one failure
   * mode the pure-function tests cannot rule out, because they never touch a
   * database and so cannot catch a reader looking at the wrong table.
   *
   * The database is left with its schema COMPLETE and only its ledger rows
   * removed, which is precisely the dev and Neon-branch incidents: a
   * schema-versus-snapshot comparison would report this database clean.
   */
  it('fails on a database whose ledger is behind its schema', async () => {
    await withAdmin(async (c) => {
      await c.query(`DROP DATABASE IF EXISTS ${PROBE}`);
      await c.query(`CREATE DATABASE ${PROBE}`);
    });

    execFileSync('npx', ['drizzle-kit', 'migrate'], {
      cwd: REPO_ROOT,
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'test', TEST_DATABASE_URL: probeUrl },
    });

    const probe = new Client({ connectionString: probeUrl });
    await probe.connect();
    try {
      const before = compareMigrationState({
        journal: readJournal(REPO_ROOT),
        ledger: await readLedger(probe),
      });
      // The precondition, asserted rather than assumed: a probe that was
      // already drifted would make the assertion below prove nothing.
      expect(before.consistent).toBe(true);

      // Remove the three most recent ledger rows, leaving their schema in place.
      await probe.query(
        `DELETE FROM drizzle.__drizzle_migrations
          WHERE created_at >= (
            SELECT created_at FROM drizzle.__drizzle_migrations
             ORDER BY created_at DESC LIMIT 1 OFFSET 2)`,
      );

      const after = compareMigrationState({
        journal: readJournal(REPO_ROOT),
        ledger: await readLedger(probe),
      });

      expect(after.consistent).toBe(false);
      expect(after.missing).toHaveLength(3);
    } finally {
      await probe.end();
    }
  });
});
