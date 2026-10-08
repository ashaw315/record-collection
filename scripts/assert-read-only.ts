/**
 * **Proves, before a sheet's server starts, that its database connection
 * cannot write.** Run by `playwright.sheet.config.ts` ahead of `next dev`,
 * with the same environment and the same `poolOptions` the app's driver
 * module uses, so what is proved is the connection the server is about to
 * open and not a description of it.
 *
 * It attempts a write that changes nothing if it is allowed, `UPDATE
 * records SET title = title WHERE false`, and exits zero only if the
 * database refuses it as a read-only transaction. Three states, and two of
 * them stop the sheet: the flag is not set; the flag is set and the write
 * is allowed (the mechanism has stopped working, which is the dangerous
 * one, since the sheet would look protected); the write is refused.
 */
import { Pool as NeonPool } from '@neondatabase/serverless';
import { Pool as PgPool } from 'pg';
import { poolOptions, resolveDriver } from '../src/lib/db/connection-string';

async function main(): Promise<number> {
  const env = { DATABASE_URL: process.env.DATABASE_URL ?? '', TEST_DATABASE_URL: process.env.TEST_DATABASE_URL, NODE_ENV: process.env.NODE_ENV, DATABASE_READ_ONLY: process.env.DATABASE_READ_ONLY };
  if (env.DATABASE_READ_ONLY !== '1') {
    process.stderr.write('assert-read-only: DATABASE_READ_ONLY is not 1. The sheet server would be able to write; not starting.\n');
    return 1;
  }
  const options = poolOptions(env);
  /* Both pools have the one shape this needs; their own types do not unify. */
  type Queryable = { query: (text: string) => Promise<{ rows: unknown[] }>; end: () => Promise<void> };
  const pool: Queryable = resolveDriver(env).driver === 'pg' ? new PgPool(options) : new NeonPool(options);
  try {
    const setting = await pool.query('SHOW default_transaction_read_only');
    const value = String((setting.rows[0] as Record<string, unknown>).default_transaction_read_only);
    try {
      await pool.query('UPDATE records SET title = title WHERE false');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/read-only transaction/.test(message)) {
        process.stdout.write(`assert-read-only: the connection refuses writes (default_transaction_read_only is ${value}).\n`);
        return 0;
      }
      process.stderr.write(`assert-read-only: the probe failed for another reason, so nothing is proved: ${message}\n`);
      return 1;
    }
    process.stderr.write(`assert-read-only: DATABASE_READ_ONLY is 1 and the database ALLOWED a write (default_transaction_read_only is ${value}). The read-only parameter is not taking effect; not starting.\n`);
    return 1;
  } finally {
    await pool.end();
  }
}

void main().then((code) => process.exit(code), (error: unknown) => {
  process.stderr.write(`assert-read-only: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
