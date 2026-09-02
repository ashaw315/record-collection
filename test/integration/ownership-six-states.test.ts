import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { matchOwnership } from '@/lib/db/queries/ownership';

/**
 * **EVERY STATE §7.7 CAN PRODUCE, ENUMERATED AND DRIVEN THROUGH THE REAL QUERY.**
 *
 * `ownership-matching.test.ts` covers each tier's own rules — corroboration,
 * fuzzy thresholds, ordering. This file asks a different question: **how many
 * distinguishable answers exist, and is every one of them reachable?**
 *
 * It exists because that question had two defensible answers. A design session
 * reading `ownership-badge.ts` counted **five** renderable marks and was right
 * about what shipped. Scoping the payload counted **six** reachable states and
 * was right about what the type can express. Neither was mistaken — **one was
 * counting the mapper and the other the query, and the gap between them was
 * exactly the defect.** A number that survives review by being confirmed twice
 * from the same layer is not confirmed at all.
 *
 * So the enumeration is asserted against the DATABASE rather than by
 * constructing `OwnershipMatch` values: a state that only type-checks is not a
 * state the app can ever show.
 *
 * ---
 *
 * **THE SIXTH IS THE ONE THAT WAS UNREACHABLE**, and it is the most valuable
 * answer in a shop: you own a different pressing of this album, AND this exact
 * pressing is the one you have been hunting. Tiers 1 and 2 hardcoded
 * `wantList: null` and returned before the want-list query ran, so it was
 * indistinguishable from "you own a different pressing" — the buy signal
 * silently dropped at the moment it mattered most.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

const TITLE = 'Hear Nothing See Nothing Say Nothing';

/** The release being looked at in the shop. */
const LOOKING_AT = 381756;

/** The same album, a different pressing. */
const OTHER = 6779382;

async function seedArtist(name = 'Discharge'): Promise<string> {
  const r = await db.execute<{ id: string }>(
    sql`INSERT INTO artists (name) VALUES (${name}) RETURNING id`,
  );
  return r.rows[0].id;
}

async function seedPressing(discogsReleaseId: number | null): Promise<string> {
  const r = await db.execute<{ id: string }>(
    sql`INSERT INTO pressings (discogs_release_id) VALUES (${discogsReleaseId}) RETURNING id`,
  );
  return r.rows[0].id;
}

async function seedRecord(artistId: string, pressingId: string | null): Promise<string> {
  const r = await db.execute<{ id: string }>(
    sql`INSERT INTO records (artist_id, pressing_id, title)
        VALUES (${artistId}, ${pressingId}, ${TITLE}) RETURNING id`,
  );
  return r.rows[0].id;
}

/**
 * `isAcquired` defaults to false, which is what makes state 6 ordinary rather
 * than corrupt — see the note on that test.
 */
async function seedWant(
  artistId: string,
  targetPressingId: string | null,
  isAcquired = false,
): Promise<string> {
  const r = await db.execute<{ id: string }>(
    sql`INSERT INTO want_list (artist_id, title, target_pressing_id, is_acquired, priority)
        VALUES (${artistId}, ${TITLE}, ${targetPressingId}, ${isAcquired}, 1) RETURNING id`,
  );
  return r.rows[0].id;
}

const lookUp = () =>
  matchOwnership({ discogsReleaseId: LOOKING_AT, artist: 'Discharge', title: TITLE });

describe('every §7.7 state is reachable through the real query', () => {
  it('1 · nothing owned and nothing wanted', async () => {
    const match = await lookUp();

    expect(match.tier).toBe('none');
    expect(match.wantList).toBeNull();
    expect(match.ownedPressing).toBeNull();
  });

  it('2 · owns this exact pressing', async () => {
    const artistId = await seedArtist();
    await seedRecord(artistId, await seedPressing(LOOKING_AT));

    const match = await lookUp();

    expect(match.tier).toBe('exact');
    expect(match.wantList).toBeNull();
  });

  it('3 · owns a different pressing of the same album', async () => {
    const artistId = await seedArtist();
    await seedRecord(artistId, await seedPressing(OTHER));

    const match = await lookUp();

    expect(match.tier).toBe('different-pressing');
    expect(match.wantList).toBeNull();
  });

  it('4 · wanted, but this is not the pressing being hunted', async () => {
    const artistId = await seedArtist();
    await seedWant(artistId, await seedPressing(OTHER));

    const match = await lookUp();

    expect(match.tier).toBe('wanted');
    expect(match.wantList?.isTargetPressing).toBe(false);
  });

  it('5 · wanted, and this IS the pressing being hunted', async () => {
    const artistId = await seedArtist();
    await seedWant(artistId, await seedPressing(LOOKING_AT));

    const match = await lookUp();

    expect(match.tier).toBe('wanted');
    expect(match.wantList?.isTargetPressing).toBe(true);
  });

  /**
   * **STATE 6 — the one the tiering made unreachable.**
   *
   * A want-list row with `is_acquired = false` on an album already owned. That
   * is not corruption and not a row anybody forgot to clean up: **ownership and
   * `is_acquired` are independent.** The acquire flow sets the flag, but a
   * record added any other way — direct entry, an import, a purchase logged
   * separately — leaves the want row untouched at false. §7.3 keeps acquired
   * rows forever as history and nothing tidies the un-acquired ones, so this
   * state is a normal consequence of the design.
   *
   * Which is exactly why it must be RENDERABLE rather than filtered away.
   *
   * Fails against the shipped tiering, where tier 2 returns `wantList: null`
   * before the want-list query runs.
   */
  it('6 · owns a different pressing AND this is the hunted target', async () => {
    const artistId = await seedArtist();
    await seedRecord(artistId, await seedPressing(OTHER));
    await seedWant(artistId, await seedPressing(LOOKING_AT));

    const match = await lookUp();

    expect(match.tier, 'ownership still outranks wanting').toBe('different-pressing');
    expect(match.wantList, 'the want entry survives the tier').not.toBeNull();
    expect(match.wantList?.isTargetPressing, 'and names THIS pressing as the target').toBe(true);
  });

  /**
   * **The same carry-through at TIER 1**, which the six above do not reach.
   *
   * Owning the exact pressing and still having an un-acquired want row for it
   * is the ordinary shape of "I bought it and never tidied the entry" — §7.3
   * keeps history, nothing tidies the rest. Tier 1 hardcoded `wantList: null`
   * for the same reason tier 2 did.
   *
   * **This test exists because a mutation survived without it**: dropping the
   * want entry from tier 1 alone left all six states passing. A fix is only as
   * constrained as its least-tested branch, and the enumeration above stops at
   * the states that differ in what the BADGE shows — this one differs in what
   * the payload carries.
   */
  it('carries the want entry at tier 1 as well', async () => {
    const artistId = await seedArtist();
    const pressingId = await seedPressing(LOOKING_AT);
    await seedRecord(artistId, pressingId);
    await seedWant(artistId, pressingId);

    const match = await lookUp();

    expect(match.tier).toBe('exact');
    expect(match.wantList, 'tier 1 must not destroy it either').not.toBeNull();
    expect(match.wantList?.isTargetPressing).toBe(true);
  });

  /**
   * **An ACQUIRED want row must not resurface.** §7.3 keeps it forever as
   * history; surfacing it would tell the user they are still hunting something
   * they have bought. This is the boundary of state 6 — without it, "carry the
   * want list through every tier" would carry acquired rows too.
   */
  it('does not surface a want entry that has been acquired', async () => {
    const artistId = await seedArtist();
    await seedRecord(artistId, await seedPressing(OTHER));
    await seedWant(artistId, await seedPressing(LOOKING_AT), true);

    const match = await lookUp();

    expect(match.tier).toBe('different-pressing');
    expect(match.wantList, 'acquired is not still wanted').toBeNull();
  });
});
