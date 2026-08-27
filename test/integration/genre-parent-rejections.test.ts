import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { genres } from '@/db/schema';
import {
  genresForParentProposal,
  rejectParentPairing,
  rejectedPairings,
} from '@/lib/db/queries/genre-hierarchy';

/**
 * SPEC.md §12c (A44) — what the proposal is built from, and what it must never
 * propose twice.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

async function seedGenres(names: string[]) {
  return db
    .insert(genres)
    .values(names.map((name) => ({ name })))
    .returning();
}

describe('what the model is shown', () => {
  /**
   * **Genres carrying NO records are included, deliberately.** Measured on the
   * live collection: `Punk` and `US Hardcore` carry zero and exist because the
   * user created them as intended parents. They are the parents the tree needs,
   * and dropping them for lack of evidence would remove the answer.
   *
   * Fails against a query that joins records and filters empties out.
   */
  it('includes genres with no records at all', async () => {
    await seedGenres(['Punk', 'UK82']);

    const proposal = await genresForParentProposal();

    expect(proposal.map((g) => g.name).sort()).toEqual(['Punk', 'UK82']);
    expect(proposal.every((g) => g.recordCount === 0)).toBe(true);
  });

  /**
   * **Already-parented genres are EXCLUDED.** The feature fills a gap; a genre
   * the user has already placed is a decision already made, and re-proposing it
   * would invite overwriting the user's own hierarchy.
   */
  it('excludes genres the user has already given a parent', async () => {
    const [punk, uk82] = await seedGenres(['Punk', 'UK82']);
    await db.update(genres).set({ parentGenreId: punk.id }).where(eq(genres.id, uk82.id));

    const proposal = await genresForParentProposal();

    expect(proposal.map((g) => g.name)).toEqual(['Punk']);
  });
});

describe('rejections', () => {
  it('records a rejected pairing and reads it back', async () => {
    const [punk, uk82] = await seedGenres(['Punk', 'UK82']);

    await rejectParentPairing({ genreId: uk82.id, rejectedParentId: punk.id });

    expect(await rejectedPairings()).toEqual([{ genreId: uk82.id, rejectedParentId: punk.id }]);
  });

  /**
   * Rejecting twice is the same fact, not two — the unique constraint says so
   * and the query must not throw on a repeat, because a user clicking twice is
   * not an error.
   */
  it('is idempotent, because rejecting twice is the same fact', async () => {
    const [punk, uk82] = await seedGenres(['Punk', 'UK82']);

    await rejectParentPairing({ genreId: uk82.id, rejectedParentId: punk.id });
    await rejectParentPairing({ genreId: uk82.id, rejectedParentId: punk.id });

    expect(await rejectedPairings()).toHaveLength(1);
  });

  /**
   * **A rejection is about ONE pairing, and rejecting it must not touch
   * others.** "UK82 under Rock" declined says nothing about "UK82 under Punk" —
   * and a cascade would silently narrow what the user can be offered.
   */
  it('rejecting one parent for a genre leaves other parents proposable', async () => {
    const [punk, rock, uk82] = await seedGenres(['Punk', 'Rock', 'UK82']);

    await rejectParentPairing({ genreId: uk82.id, rejectedParentId: rock.id });
    const rejected = await rejectedPairings();

    expect(rejected).toEqual([{ genreId: uk82.id, rejectedParentId: rock.id }]);
    expect(rejected.some((r) => r.rejectedParentId === punk.id)).toBe(false);
  });

  /**
   * **A rejection is a fact ABOUT a pair**, so deleting either genre makes it
   * meaningless. Without the cascade it would survive as a dangling row and
   * resurrect the moment a name was reused.
   */
  it('disappears when either genre is deleted', async () => {
    const [punk, uk82] = await seedGenres(['Punk', 'UK82']);
    await rejectParentPairing({ genreId: uk82.id, rejectedParentId: punk.id });

    await db.delete(genres).where(eq(genres.id, punk.id));

    expect(await rejectedPairings()).toEqual([]);
  });
});
