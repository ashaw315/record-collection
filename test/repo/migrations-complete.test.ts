import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { assertLocalTestDatabase } from '../helpers/db';

const REPO_ROOT = join(import.meta.dirname, '..', '..');

/**
 * `drizzle-kit migrate` reads drizzle/meta/_journal.json to decide which .sql
 * files to apply. If the journal is missing it applies nothing, creates nothing,
 * and exits 0 — a silent no-op that reports success.
 *
 * That is why an exit code is not sufficient verification here (CLAUDE.md §2's
 * carve-out requires a command that proves the step, and "exit 0" does not
 * prove it). These tests assert the migration state is actually reachable from
 * a clean checkout and that applying it produces tables.
 */

function tracked(path: string): boolean {
  const out = execFileSync('git', ['ls-files', '--error-unmatch', '--', path], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return out.trim() !== '';
}

describe('migration state is committed', () => {
  it('tracks the migration journal', () => {
    // The journal is migration state, not build output. Without it a fresh
    // clone migrates nothing.
    expect(() => tracked('drizzle/meta/_journal.json')).not.toThrow();
  });

  it('tracks a snapshot for every migration in the journal', () => {
    const listed = execFileSync('git', ['ls-files', '--', 'drizzle/'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    })
      .trim()
      .split('\n');

    const sqlFiles = listed.filter((f) => f.endsWith('.sql'));
    const snapshots = listed.filter((f) => /meta\/\d+_snapshot\.json$/.test(f));

    expect(sqlFiles.length).toBeGreaterThan(0);
    // drizzle-kit generate emits one snapshot per migration; a missing one
    // makes the next `generate` diff against the wrong baseline.
    expect(snapshots).toHaveLength(sqlFiles.length);
  });

  it('does not ignore anything under drizzle/', () => {
    // git check-ignore exits 1 when nothing matches, which is the passing case.
    let ignored = '';
    try {
      ignored = execFileSync('git', ['check-ignore', 'drizzle/meta/_journal.json'], {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      ignored = '';
    }

    expect(ignored).toBe('');
  });
});

describe('migrations applied to an empty database create the schema', () => {
  const workdir = mkdtempSync(join(tmpdir(), 'rc-freshclone-'));
  const dbName = 'migration_verify';
  let adminUrl: string;
  let targetUrl: string;

  try {
    const base = assertLocalTestDatabase(process.env.TEST_DATABASE_URL);
    const parsed = new URL(base);
    adminUrl = new URL(base).toString();
    parsed.pathname = `/${dbName}`;
    targetUrl = parsed.toString();
  } catch {
    adminUrl = '';
    targetUrl = '';
  }

  let generatedConfig: string | undefined;

  afterAll(() => {
    rmSync(workdir, { recursive: true, force: true });
    if (generatedConfig !== undefined) rmSync(generatedConfig, { force: true });
  });

  async function withAdmin<T>(fn: (c: Client) => Promise<T>): Promise<T> {
    const client = new Client({ connectionString: adminUrl });
    await client.connect();
    try {
      return await fn(client);
    } finally {
      await client.end();
    }
  }

  it('applies every migration from a fresh clone and creates tables', async () => {
    // Simulate a fresh clone: copy ONLY git-tracked files. Anything gitignored
    // is absent, exactly as it would be for a new developer or CI.
    const trackedFiles = execFileSync('git', ['ls-files', '--', 'drizzle/'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    })
      .trim()
      .split('\n')
      .filter(Boolean);

    for (const file of trackedFiles) {
      cpSync(join(REPO_ROOT, file), join(workdir, file), { recursive: true });
    }

    // The journal must have survived the tracked-files-only copy. If it did
    // not, drizzle-kit would silently apply nothing below.
    expect(existsSync(join(workdir, 'drizzle/meta/_journal.json'))).toBe(true);

    await withAdmin(async (c) => {
      await c.query(`DROP DATABASE IF EXISTS ${dbName}`);
      await c.query(`CREATE DATABASE ${dbName}`);
    });

    // The config must live inside the repo: drizzle-kit resolves its own module
    // from the config file's location, so one written to a temp dir cannot load
    // it. Only `out` points at the simulated clone.
    //
    // The name is distinctive and gitignored: if a run crashes between this
    // write and afterAll, the orphan still cannot be committed.
    const configPath = join(REPO_ROOT, 'drizzle.config.fresh-clone-test.ts');
    writeFileSync(
      configPath,
      `import { defineConfig } from 'drizzle-kit';\n` +
        `export default defineConfig({\n` +
        `  dialect: 'postgresql',\n` +
        `  out: ${JSON.stringify(join(workdir, 'drizzle'))},\n` +
        `  dbCredentials: { url: ${JSON.stringify(targetUrl)} },\n` +
        `});\n`,
    );
    generatedConfig = configPath;

    execFileSync('npx', ['drizzle-kit', 'migrate', '--config', configPath], {
      cwd: REPO_ROOT,
      stdio: 'pipe',
      env: { ...process.env },
    });

    const client = new Client({ connectionString: targetUrl });
    await client.connect();
    try {
      const tables = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM information_schema.tables WHERE table_schema = 'public'`,
      );
      // The positive assertion: a migration that "succeeds" while doing nothing
      // is the exact failure this guards against.
      expect(Number(tables.rows[0].count)).toBeGreaterThan(0);

      // Spot-check that it is OUR schema, not an empty drizzle bookkeeping table.
      const named = await client.query<{ tablename: string }>(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
      );
      const names = named.rows.map((r) => r.tablename);
      for (const required of ['artists', 'records', 'want_list', 'price_history', 'pressings']) {
        expect(names).toContain(required);
      }

      // The formats seed is the only seed data (SPEC.md §4.1); its presence
      // proves the migration body ran, not merely that tables were created.
      const formats = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM formats`,
      );
      expect(Number(formats.rows[0].count)).toBe(7);
    } finally {
      await client.end();
      await withAdmin(async (c) => {
        await c.query(`DROP DATABASE IF EXISTS ${dbName}`);
      });
    }
  }, 60_000);
});
