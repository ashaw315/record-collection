import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { JournalEntry, LedgerRow } from './migration-state';

/**
 * The IO half of the migration-state assertion: reading the journal from disk
 * and the ledger from a database.
 *
 * Split from `migration-state.ts` so the comparison stays a pure function that
 * can be tested against manufactured drift — a genuinely drifted database is
 * the thing this exists to prevent and cannot be created safely to test.
 *
 * No `server-only`: the migration script runs this as a plain Node module,
 * the same constraint `src/lib/env/schema.ts` documents for `drizzle.config.ts`.
 */

/** Only the fields used; drizzle carries `idx`, `version` and `breakpoints` too. */
const journalSchema = z.object({
  entries: z.array(
    z.object({
      when: z.number(),
      tag: z.string().min(1),
    }),
  ),
});

/**
 * Reads `drizzle/meta/_journal.json` and hashes each migration's `.sql` file.
 *
 * **sha256 of the raw file bytes, and it was measured rather than assumed.**
 * Getting this wrong is the worst available failure for this check: every entry
 * would look unapplied on a healthy database, the assertion would fire on every
 * migration, and the natural response would be to disable it. A test pins the
 * algorithm against a hash drizzle itself wrote.
 *
 * Parsed with Zod rather than cast. The journal is a file on disk that a failed
 * `generate` can truncate, and a malformed one silently yielding zero entries
 * would make this assertion pass by having nothing to check — the
 * absence-as-success shape this project has shipped three times.
 */
export function readJournal(repoRoot: string): JournalEntry[] {
  const raw = readFileSync(join(repoRoot, 'drizzle', 'meta', '_journal.json'), 'utf8');
  const journal = journalSchema.parse(JSON.parse(raw));

  return journal.entries.map((entry) => {
    const sql = readFileSync(join(repoRoot, 'drizzle', `${entry.tag}.sql`));

    return {
      tag: entry.tag,
      when: entry.when,
      hash: createHash('sha256').update(sql).digest('hex'),
    };
  });
}

/** The minimum a caller must provide — `pg`'s Client and Pool both satisfy it. */
export type Queryable = {
  query<T extends Record<string, unknown>>(sql: string): Promise<{ rows: T[] }>;
};

/**
 * Reads `drizzle.__drizzle_migrations`.
 *
 * **In the `drizzle` schema, not `public`** — a query against the wrong schema
 * errors rather than returning nothing, which is the safe direction: a reader
 * that silently found zero rows would report every migration as missing.
 *
 * Returns an empty ledger when the table does not exist at all. That is a
 * database nothing has ever migrated, which is a legitimate state for the
 * assertion to describe rather than an error to throw on — the caller decides
 * what it means, since before a migration it is expected and after one it is
 * a failure.
 */
export async function readLedger(db: Queryable): Promise<LedgerRow[]> {
  const { rows } = await db.query<{ hash: string; created_at: string | number | null }>(
    `SELECT hash, created_at FROM drizzle.__drizzle_migrations`,
  );

  return rows.map((row) => ({
    hash: row.hash,
    // bigint arrives as a string over the wire; the comparison never reads it,
    // but a caller reporting a high-water mark would.
    createdAt: Number(row.created_at ?? 0),
  }));
}
