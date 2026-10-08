import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { poolOptions } from '@/lib/db/connection-string';

/**
 * The read-only connection, against a real Postgres: the claim is about
 * what the database does, so it is asked of one. A write that changes
 * nothing if it is allowed (`UPDATE … WHERE false`) is refused before the
 * database looks at a row.
 */
const url = process.env.TEST_DATABASE_URL ?? '';
const pools: Pool[] = [];
const open = (readOnly: boolean) => {
  const pool = new Pool(poolOptions({ DATABASE_URL: url, TEST_DATABASE_URL: url, ...(readOnly ? { DATABASE_READ_ONLY: '1' } : {}) }));
  pools.push(pool);
  return pool;
};
afterAll(async () => { await Promise.all(pools.map((pool) => pool.end())); });

describe('a pool opened with DATABASE_READ_ONLY=1', () => {
  /* Fails against a pool that ignores the options it is given: the write goes through. */
  it('refuses a write on every statement, one at a time and at once', async () => {
    const pool = open(true);
    for (let i = 0; i < 4; i += 1) await expect(pool.query('UPDATE records SET title = title WHERE false')).rejects.toThrow(/read-only transaction/);
    const all = await Promise.allSettled(Array.from({ length: 6 }, () => pool.query('DELETE FROM tags WHERE false')));
    expect(all.map((r) => r.status)).toEqual(Array.from({ length: 6 }, () => 'rejected'));
  });

  it('refuses a write inside a transaction it did not mark read-only itself', async () => {
    const client = await open(true).connect();
    try {
      await client.query('BEGIN');
      await expect(client.query("INSERT INTO tags (name) VALUES ('read-only-probe')")).rejects.toThrow(/read-only transaction/);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('still reads', async () => {
    const result = await open(true).query('SELECT count(*)::int AS n FROM records');
    expect(typeof (result.rows[0] as { n: number }).n).toBe('number');
  });

  /* The control: the same statement on a plain pool is allowed, so the refusals above are the parameter's doing. */
  it('is the parameter’s doing: a plain pool allows the same write', async () => {
    await expect(open(false).query('UPDATE records SET title = title WHERE false')).resolves.toBeDefined();
  });
});
