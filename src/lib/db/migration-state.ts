/**
 * Compares what the migration journal says has been applied against what the
 * database's ledger records — the assertion R6 deferred to step 16.
 *
 * **Why this is the check, and not a schema comparison.** `drizzle-kit migrate`
 * derives its work from the ledger and the journal, and a failed run changes
 * neither: the batch is recomputed, dies on the same error, rolls back, and
 * prints "migrations applied successfully". Exit 0 forever, with nothing that
 * says so. The divergence lives in the bookkeeping, which is the INPUT to
 * drizzle's decision — so that is what has to be asserted.
 *
 * A snapshot-versus-live-schema diff is the stronger check in general and was
 * the weaker one here. Measured against this project's three incidents: on the
 * Neon test branch, 0011–0013's schema was already present and correct while
 * their ledger rows were missing, so a schema diff reports CLEAN on a database
 * that is one `db:migrate` away from the permanent failure.
 *
 * No `server-only` marker: this is imported by the migration script, which
 * drizzle-kit and Node run as a plain CLI module.
 */

/** One entry of `drizzle/meta/_journal.json`, plus the hash of its `.sql` file. */
export type JournalEntry = {
  /** The migration's file stem, e.g. `0016_elite_ben_grimm` — used for reporting. */
  tag: string;
  /** sha256 of the raw `.sql` bytes. Measured against a real ledger, not assumed. */
  hash: string;
  when: number;
};

/** One row of `drizzle.__drizzle_migrations`. */
export type LedgerRow = {
  hash: string;
  createdAt: number;
};

export type MigrationStateComparison = {
  consistent: boolean;
  /** Journal entries with no matching ledger row, by tag, in journal order. */
  missing: string[];
};

/**
 * **Directional by design: every journal entry needs a ledger row, but not
 * every ledger row needs a journal entry.**
 *
 * The asymmetry is not laziness. Both Neon branches carry an inert orphan row
 * (`created_at=1786715119768`, matching no file, one millisecond after 0010)
 * that sits below the high-water mark and can never gate a migration. A
 * bidirectional or count-based check fires on that healthy state — NOTES
 * records a first verification script doing exactly this and failing on a good
 * database, and a check that cries wolf is a check somebody disables.
 *
 * Matched on HASH rather than on timestamp. A committed migration edited after
 * being applied keeps its `when` and changes its content, so a timestamp match
 * would call that consistent while the database holds something the repo no
 * longer describes.
 */
export function compareMigrationState(input: {
  journal: readonly JournalEntry[];
  ledger: readonly LedgerRow[];
}): MigrationStateComparison {
  const applied = new Set(input.ledger.map((row) => row.hash));

  const missing = input.journal
    .filter((entry) => !applied.has(entry.hash))
    .map((entry) => entry.tag);

  return { consistent: missing.length === 0, missing };
}
