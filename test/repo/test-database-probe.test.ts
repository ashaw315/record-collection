import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { assertTestDatabaseReachable } from '../helpers/db';
import { underLoad } from '../helpers/spawn-budget';

vi.setConfig({ testTimeout: underLoad(3_500) });

/**
 * **A check run with Docker down says so (the coordinator, 21 Nov).** Staged on 21 Nov: with the container stopped, a
 * pure unit file's run printed `Command failed: npx drizzle-kit migrate` and `No test files found, exiting with code 1`,
 * nothing naming Postgres or the port, and commit-checked would have refused with "the check failed" and sent a reader
 * looking for a broken test. Adam quits Docker between sessions now, so this is the ordinary course. The probe runs
 * before the migration in both global setups and fails by name. Fails against a probe that passes on a closed port, one
 * whose message omits the port or the command, and against a global setup that migrates before probing (the staged run).
 */
async function closedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

describe('assertTestDatabaseReachable', () => {
  it('resolves against the running test database', async () => {
    await expect(assertTestDatabaseReachable(process.env.TEST_DATABASE_URL ?? '')).resolves.toBeUndefined();
  });

  it('fails by name on a closed port: the address, that it is not reachable, and the command that starts Docker', async () => {
    const port = await closedPort();
    const url = `postgresql://postgres:postgres@localhost:${port}/record_collection_test`;
    await expect(assertTestDatabaseReachable(url)).rejects.toThrow(new RegExp(`test database at localhost:${port} is not reachable[\\s\\S]*npm run db:test:up`));
  });

  it('carries the cause by its code, because pg’s refused connection has no message text', async () => {
    // Observed 21 Nov with Docker up and the container absent: `is not reachable ()`, the parentheses empty. pg
    // throws an AggregateError whose message is '' and whose code is ECONNREFUSED; the code is what a reader needs.
    const port = await closedPort();
    const url = `postgresql://postgres:postgres@localhost:${port}/record_collection_test`;
    await expect(assertTestDatabaseReachable(url)).rejects.toThrow(/not reachable \(ECONNREFUSED\)/);
  });
});

describe('the vitest global setup, staged with the database unreachable', () => {
  it('fails before migrating, with the probe’s message and not drizzle’s', async () => {
    const port = await closedPort();
    const r = spawnSync('npx', ['vitest', 'run', 'src/lib/musicbrainz/artist-facts.test.ts'], {
      encoding: 'utf8',
      env: { ...process.env, TEST_DATABASE_URL: `postgresql://postgres:postgres@localhost:${port}/record_collection_test`, FORCE_COLOR: '0', NO_COLOR: '1' },
      timeout: underLoad(3_000),
    });
    const out = `${r.stdout}${r.stderr}`;
    expect(r.status, out.slice(-600)).not.toBe(0);
    expect(out).toMatch(new RegExp(`test database at localhost:${port} is not reachable`));
    expect(out).toMatch(/npm run db:test:up/);
    expect(out, 'the migration never ran').not.toMatch(/Command failed: npx drizzle-kit migrate/);
  });
});
