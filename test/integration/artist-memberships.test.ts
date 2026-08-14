import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { artists } from '@/db/schema';
import {
  saveMemberships,
  membershipsForArtist,
  type MembershipInput,
} from '@/lib/db/queries/artist-memberships';

/**
 * SPEC.md §4.3's `artist_memberships` — a person's membership of a group,
 * imported from MusicBrainz. A *fact with a source*, kept apart from
 * `artist_influences`, which is the user's judgement.
 *
 * **The re-import path is what these tests are shaped around.** Writing a row
 * once is easy and proves little; §12 step 11 makes this on-demand and cached,
 * so the same artist WILL be imported twice, and the failure that matters is
 * duplicates accumulating silently on each pass — which looks exactly like a
 * cache that is working, because nothing errors and the page still renders.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

async function seedArtists() {
  const [person] = await db.insert(artists).values({ name: 'Tony Atkinson' }).returning();
  const [group] = await db.insert(artists).values({ name: 'Discharge' }).returning();
  const [other] = await db.insert(artists).values({ name: 'Broken Bones' }).returning();

  return { person, group, other };
}

const countRows = async () => {
  const result = await db.execute<{ n: number }>(
    sql`SELECT COUNT(*)::int AS n FROM artist_memberships`,
  );
  return result.rows[0].n;
};

describe('saving memberships', () => {
  it('writes a membership row (happy path)', async () => {
    const { person, group } = await seedArtists();

    await saveMemberships([
      {
        personArtistId: person.id,
        groupArtistId: group.id,
        instrument: 'drums (drum set)',
        beganYear: 1977,
        endedYear: 1982,
        musicbrainzId: 'abc-123',
      },
    ]);

    const rows = await membershipsForArtist(group.id);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      personArtistId: person.id,
      groupArtistId: group.id,
      instrument: 'drums (drum set)',
      beganYear: 1977,
      endedYear: 1982,
    });
  });

  it('accepts a membership with no instrument or dates', async () => {
    // All three are nullable in §4.3, and MusicBrainz omits them routinely —
    // six of Black Flag's members have no end date.
    const { person, group } = await seedArtists();

    await saveMemberships([
      {
        personArtistId: person.id,
        groupArtistId: group.id,
        instrument: null,
        beganYear: null,
        endedYear: null,
        musicbrainzId: null,
      },
    ]);

    expect(await countRows()).toBe(1);
  });
});

describe('re-import — the path this table is shaped around', () => {
  /**
   * §12 step 11: on demand, cached. The same artist is imported again whenever
   * the cache expires or the user asks a second time, so idempotency is not a
   * nicety here — it is the normal path.
   */

  it('importing the same artist twice does not change the row count', async () => {
    const { person, group } = await seedArtists();

    const payload: MembershipInput[] = [
      {
        personArtistId: person.id,
        groupArtistId: group.id,
        instrument: 'guitar',
        beganYear: 1977,
        endedYear: null,
        musicbrainzId: 'rel-1',
      },
    ];

    await saveMemberships(payload);
    const afterFirst = await countRows();

    await saveMemberships(payload);

    expect(afterFirst, 'the first import wrote it').toBe(1);
    expect(await countRows(), 'the second import wrote nothing new').toBe(1);
  });

  it('does NOT duplicate a membership whose instrument is null', async () => {
    /**
     * **The case that decides `NULLS NOT DISTINCT`, and the reason it is tested
     * on re-import rather than on insert.**
     *
     * Under Postgres' default semantics two NULLs are distinct, so a UNIQUE
     * constraint over `(person, group, instrument)` does not see two
     * null-instrument rows as conflicting — `ON CONFLICT DO NOTHING` never
     * fires and a duplicate is inserted on every pass. Measured on Postgres
     * 16.14: default gives 2 rows, `NULLS NOT DISTINCT` gives 1.
     *
     * Two null-instrument rows for the same person and group are the SAME FACT
     * recorded twice. Nothing errors, the import "succeeds", and the graph
     * quietly weights that pair more heavily on every re-import — a cache that
     * looks like it is working while the data drifts.
     */
    const { person, group } = await seedArtists();

    const payload: MembershipInput[] = [
      {
        personArtistId: person.id,
        groupArtistId: group.id,
        instrument: null,
        beganYear: null,
        endedYear: null,
        musicbrainzId: null,
      },
    ];

    await saveMemberships(payload);
    await saveMemberships(payload);
    await saveMemberships(payload);

    expect(await countRows(), 'one fact, imported three times, is one row').toBe(1);
  });

  it('refreshes the detail of a membership it already has', async () => {
    /**
     * A re-import is not only "do not duplicate" — MusicBrainz data is edited,
     * so an end date that was missing may now be known. The row is updated
     * rather than left stale.
     */
    const { person, group } = await seedArtists();

    await saveMemberships([
      {
        personArtistId: person.id,
        groupArtistId: group.id,
        instrument: 'guitar',
        beganYear: 1977,
        endedYear: null,
        musicbrainzId: 'rel-1',
      },
    ]);

    await saveMemberships([
      {
        personArtistId: person.id,
        groupArtistId: group.id,
        instrument: 'guitar',
        beganYear: 1977,
        endedYear: 1982,
        musicbrainzId: 'rel-1',
      },
    ]);

    const [row] = await membershipsForArtist(group.id);

    expect(await countRows()).toBe(1);
    expect(row.endedYear, 'the newly-known end date').toBe(1982);
  });
});

describe('what counts as a DIFFERENT membership', () => {
  it('keeps two instruments for the same person and group as separate rows', async () => {
    /**
     * §4.3: "a person may join a group twice on different instruments." The
     * instrument is part of what identifies the row, so this must NOT collapse
     * — the mirror of the null case above, and the reason the constraint spans
     * all three columns rather than just the pair.
     */
    const { person, group } = await seedArtists();

    await saveMemberships([
      {
        personArtistId: person.id,
        groupArtistId: group.id,
        instrument: 'guitar',
        beganYear: null,
        endedYear: null,
        musicbrainzId: null,
      },
      {
        personArtistId: person.id,
        groupArtistId: group.id,
        instrument: 'lead vocals',
        beganYear: null,
        endedYear: null,
        musicbrainzId: null,
      },
    ]);

    expect(await countRows(), 'two instruments, two facts').toBe(2);
  });

  it('keeps the same person in two different groups', async () => {
    const { person, group, other } = await seedArtists();

    await saveMemberships([
      {
        personArtistId: person.id,
        groupArtistId: group.id,
        instrument: 'guitar',
        beganYear: null,
        endedYear: null,
        musicbrainzId: null,
      },
      {
        personArtistId: person.id,
        groupArtistId: other.id,
        instrument: 'guitar',
        beganYear: null,
        endedYear: null,
        musicbrainzId: null,
      },
    ]);

    expect(await countRows()).toBe(2);
  });
});

describe('constraints §4.3 requires', () => {
  it('refuses a membership of an artist in itself', async () => {
    // §4.3: "CHECK that person ≠ group." A self-membership is meaningless and
    // would draw a self-loop in the graph.
    const { person } = await seedArtists();

    await expect(
      saveMemberships([
        {
          personArtistId: person.id,
          groupArtistId: person.id,
          instrument: null,
          beganYear: null,
          endedYear: null,
          musicbrainzId: null,
        },
      ]),
    ).rejects.toThrow();
  });

  it('removes memberships when the artist is deleted', async () => {
    /**
     * §4.3's cascade reasoning for `artist_influences` applies identically: an
     * edge to a deleted artist is meaningless. Without the cascade, deleting an
     * artist would fail on an FK violation.
     */
    const { person, group } = await seedArtists();

    await saveMemberships([
      {
        personArtistId: person.id,
        groupArtistId: group.id,
        instrument: 'guitar',
        beganYear: null,
        endedYear: null,
        musicbrainzId: null,
      },
    ]);

    await db.execute(sql`DELETE FROM artists WHERE id = ${person.id}`);

    expect(await countRows(), 'the edge went with the artist').toBe(0);
  });
});

describe('reading memberships', () => {
  it('finds an artist’s memberships whether it is the person or the group', async () => {
    /**
     * The graph asks both questions: "who was in this band" and "what bands was
     * this person in". A reader that only matched one column would answer half
     * of them with silence.
     */
    const { person, group } = await seedArtists();

    await saveMemberships([
      {
        personArtistId: person.id,
        groupArtistId: group.id,
        instrument: 'guitar',
        beganYear: null,
        endedYear: null,
        musicbrainzId: null,
      },
    ]);

    expect(await membershipsForArtist(group.id), 'asked as the band').toHaveLength(1);
    expect(await membershipsForArtist(person.id), 'asked as the person').toHaveLength(1);
  });

  it('returns nothing for an artist with no memberships', async () => {
    const { other } = await seedArtists();

    expect(await membershipsForArtist(other.id)).toEqual([]);
  });

  it('writes nothing when given nothing', async () => {
    // An artist whose MusicBrainz page has no member relations is a normal
    // result, not an error — and must not produce a malformed empty INSERT.
    await expect(saveMemberships([])).resolves.not.toThrow();
    expect(await countRows()).toBe(0);
  });
});
