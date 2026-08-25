import { describe, expect, it } from 'vitest';
import { compareMigrationState, type JournalEntry, type LedgerRow } from './migration-state';

/**
 * The state assertion R6 parked for step 16 (NOTES: "'The script ran' is not
 * 'the script did what it is for'").
 *
 * **What it checks, and why this shape rather than a stronger one.**
 * `drizzle-kit migrate` decides what to run from the LEDGER and the JOURNAL, and
 * a failed run changes neither — so when they diverge the same batch is
 * recomputed, dies on the same `42701`, rolls back, and prints "migrations
 * applied successfully" for ever. The divergence is in the bookkeeping, and the
 * bookkeeping is the input to the decision.
 *
 * A snapshot-versus-live-schema diff is the stronger check and would have been
 * WEAKER here. On the Neon test branch (13c unit 1) 0011–0013's schema was
 * already present and correct while their ledger rows were missing: a schema
 * diff reports clean, and the database is still one `db:migrate` away from the
 * permanent failure. Measured against the three real incidents rather than
 * chosen in principle.
 *
 * These are pure-function tests because the failure states cannot be
 * manufactured safely — creating a genuinely drifted database is the thing this
 * exists to prevent.
 */

const entry = (tag: string, hash: string, when: number): JournalEntry => ({
  tag,
  hash,
  when,
});

const row = (hash: string, createdAt: number): LedgerRow => ({ hash, createdAt });

describe('a database that matches its journal', () => {
  /**
   * Fails against: an assertion that reports drift on a healthy database, which
   * is worse than none — a check that cries wolf gets disabled.
   */
  it('is consistent', () => {
    const result = compareMigrationState({
      journal: [entry('0000_a', 'aaa', 1), entry('0001_b', 'bbb', 2)],
      ledger: [row('aaa', 1), row('bbb', 2)],
    });

    expect(result.consistent).toBe(true);
    expect(result.missing).toEqual([]);
  });

  /**
   * **Fails against a count-based or bidirectional comparison**, and this is the
   * case that decides the direction of the check.
   *
   * Both Neon branches carry an inert orphan row — `created_at=1786715119768`,
   * matching no journal entry, one millisecond after 0010. It sits BELOW the
   * high-water mark so it can never gate a migration. NOTES records that the
   * first verification script asserted "row count equals journal length" and
   * failed on a healthy database; this is that mistake, pinned so it cannot
   * come back.
   */
  it('tolerates an extra ledger row that matches no journal entry', () => {
    const result = compareMigrationState({
      journal: [entry('0000_a', 'aaa', 1), entry('0001_b', 'bbb', 3)],
      ledger: [row('aaa', 1), row('orphan', 2), row('bbb', 3)],
    });

    expect(result.consistent).toBe(true);
  });

  /**
   * Fails against: a comparison that depends on ledger ordering or on ids.
   *
   * The ledger's `id` is a sequence and R6 measured it skipping 13–14 on a
   * healthy branch, so nothing may be inferred from it.
   */
  it('does not depend on the order rows were inserted', () => {
    const result = compareMigrationState({
      journal: [entry('0000_a', 'aaa', 1), entry('0001_b', 'bbb', 2)],
      ledger: [row('bbb', 2), row('aaa', 1)],
    });

    expect(result.consistent).toBe(true);
  });
});

describe('the drift that makes db:migrate a permanent no-op', () => {
  /**
   * **The dev incident, R5 (NOTES).** Ledger 12 rows against a 15-entry
   * journal, with 0011–0013's schema already present and unrecorded.
   *
   * Fails against: no assertion at all, which is the state this replaces — the
   * command exits 0 and the divergence is invisible.
   */
  it('names every journal entry with no ledger row', () => {
    const result = compareMigrationState({
      journal: [
        entry('0010_j', 'jjj', 10),
        entry('0011_k', 'kkk', 11),
        entry('0012_l', 'lll', 12),
        entry('0013_m', 'mmm', 13),
      ],
      ledger: [row('jjj', 10)],
    });

    expect(result.consistent).toBe(false);
    expect(result.missing).toEqual(['0011_k', '0012_l', '0013_m']);
  });

  /**
   * **The Neon test branch, 13c unit 1.** Ledger 11 against journal 16 — the
   * same shape one migration further behind, and the case a schema diff would
   * have passed because 0011–0013's DDL was already applied.
   */
  it('reports drift even when the schema those migrations describe is present', () => {
    const journal = Array.from({ length: 16 }, (_, i) =>
      entry(`00${String(i).padStart(2, '0')}_m`, `h${i}`, i),
    );
    const ledger = journal.slice(0, 11).map((e) => row(e.hash, e.when));

    const result = compareMigrationState({ journal, ledger });

    expect(result.consistent).toBe(false);
    expect(result.missing).toHaveLength(5);
  });

  /**
   * **Fails against a comparison keyed on `created_at` rather than on the hash.**
   *
   * A file edited after being applied keeps its timestamp and changes its
   * content, so a timestamp match would call this consistent while the database
   * holds something the repo no longer describes. Never editing a committed
   * migration is CLAUDE.md §7's rule; this is the check that notices when it
   * happens anyway.
   */
  it('reports a journal entry whose ledger row carries a different hash', () => {
    const result = compareMigrationState({
      journal: [entry('0000_a', 'aaa', 1), entry('0001_edited', 'NEW-HASH', 2)],
      ledger: [row('aaa', 1), row('OLD-HASH', 2)],
    });

    expect(result.consistent).toBe(false);
    expect(result.missing).toEqual(['0001_edited']);
  });

  /**
   * Fails against: an assertion that treats an unmigrated database as drifted.
   *
   * An empty ledger against a full journal is a database nothing has run yet —
   * a legitimate starting state, and the one `db:migrate` exists to move. It is
   * still reported as inconsistent AFTER a migration, which is where this check
   * runs; the distinction lives in the caller, not here.
   */
  it('reports an empty ledger as every entry missing, not as an error', () => {
    const result = compareMigrationState({
      journal: [entry('0000_a', 'aaa', 1)],
      ledger: [],
    });

    expect(result.consistent).toBe(false);
    expect(result.missing).toEqual(['0000_a']);
  });
});
