import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { artists, artistInfluences, genres, records, recordGenres } from '@/db/schema';
import { buildGraph } from '@/lib/db/queries/graph';
import { listRecords } from '@/lib/db/queries/records';

/**
 * SPEC.md §8.1 — the network graph, scoped to OWNED records (§5.6).
 *
 * The two rules these tests exist to hold down:
 *
 *   **People are edges, not nodes.** A membership import pulled Adam's artist
 *   list from 6 to 71, of which 4 have records. Emitting the other 67 as nodes
 *   is a hairball around the four that matter, and at `ownedCount: 0` they
 *   render at radius zero — invisible dots still occupying simulation space.
 *   A person who links two groups becomes a `shared_member` edge instead.
 *
 *   **Sparseness is not disguised.** A collection of unrelated artists is
 *   genuinely a scatter of unconnected dots. The endpoint must not invent an
 *   edge to make the layout look busier.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

async function insertArtist(name: string): Promise<string> {
  const [row] = await db.insert(artists).values({ name }).returning();
  return row.id;
}

async function insertRecord(title: string, artistId: string): Promise<string> {
  const [row] = await db.insert(records).values({ title, artistId }).returning();
  return row.id;
}

async function insertMembership(personId: string, groupId: string, instrument?: string) {
  await db.execute(
    sql`INSERT INTO artist_memberships (person_artist_id, group_artist_id, instrument)
        VALUES (${personId}, ${groupId}, ${instrument ?? null})`,
  );
}

function artistNode(id: string) {
  return `artist:${id}`;
}

/** Links are undirected in places, so compare as an unordered set of triples. */
function linkTriples(links: Array<{ source: string; target: string; type: string; weight: number }>) {
  return links.map((l) => `${l.type} ${l.source} ${l.target} ${l.weight}`).sort();
}

describe('buildGraph — nodes are what you own', () => {
  it('returns an artist node carrying its owned-record count', async () => {
    const artist = await insertArtist('Dire Straits');
    await insertRecord('Brothers in Arms', artist);
    await insertRecord('Making Movies', artist);

    const graph = await buildGraph({});

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]).toMatchObject({
      id: artistNode(artist),
      type: 'artist',
      label: 'Dire Straits',
      ownedCount: 2,
    });
  });

  it('omits an artist with no owned records', async () => {
    /**
     * §5.6 is owned-records-only. An artist created by a lineup walk and never
     * collected is not part of the collection graph — this is the rule that
     * keeps 67 of Adam's 71 artists out of the payload.
     */
    await insertArtist('Alan Clark');

    const graph = await buildGraph({});

    expect(graph.nodes).toEqual([]);
  });

  it('omits a MEMBER of a collected band, who is an edge and not a node', async () => {
    /**
     * The people-are-edges rule at its sharpest. Alan Clark is in Dire Straits,
     * which has a record. He must still not be a node: §8.1 says a person is
     * HOW two bands connect, not a thing you would click.
     */
    const band = await insertArtist('Dire Straits');
    const person = await insertArtist('Alan Clark');
    await insertMembership(person, band);
    await insertRecord('Brothers in Arms', band);

    const graph = await buildGraph({});

    expect(graph.nodes.map((n) => n.label)).toEqual(['Dire Straits']);
  });
});

describe('buildGraph — sparseness is reported, not disguised', () => {
  it('returns four unconnected nodes and ZERO links when nothing is shared', async () => {
    /**
     * **Adam's collection today.** Four artists, four records, nothing in
     * common — no shared members, no influences, no genres.
     *
     * The four-node assertion is load-bearing: without it this test would pass
     * against a `buildGraph` that returns an empty graph for everything, which
     * is the vacuous-negative shape CLAUDE.md §2 warns about. The nodes must be
     * RIGHT and the links must be ABSENT, in the same test.
     */
    const names = ['Dire Straits', 'Discharge', 'Hot Tuna', 'The Damned'];
    for (const name of names) {
      const id = await insertArtist(name);
      await insertRecord(`${name} LP`, id);
    }

    const graph = await buildGraph({});

    expect(graph.nodes.map((n) => n.label).sort()).toEqual([...names].sort());
    expect(graph.nodes.every((n) => n.ownedCount === 1)).toBe(true);
    expect(graph.links, 'four dots, and the layout must not invent structure').toEqual([]);
  });

  it('returns nothing at all for an empty collection', async () => {
    const graph = await buildGraph({});

    expect(graph.nodes).toEqual([]);
    expect(graph.links).toEqual([]);
  });

  it('keeps two disconnected components apart', async () => {
    const a1 = await insertArtist('Dire Straits');
    const a2 = await insertArtist('Dire Straits Legacy');
    const b1 = await insertArtist('Discharge');
    const b2 = await insertArtist('The Varukers');
    for (const [name, id] of [
      ['A1', a1],
      ['A2', a2],
      ['B1', b1],
      ['B2', b2],
    ] as const) {
      await insertRecord(`${name} LP`, id);
    }

    const shared = await insertArtist('Alan Clark');
    await insertMembership(shared, a1);
    await insertMembership(shared, a2);

    const bridge = await insertArtist('Rainy Wells');
    await insertMembership(bridge, b1);
    await insertMembership(bridge, b2);

    const graph = await buildGraph({});

    /**
     * The PAIRS are the subject here, not their orientation: §8.1 orders each
     * pair by artist id, which is a random uuid, so naming a1 as the source
     * would be a coin flip per run. Orientation is asserted by the stable-
     * ordering test below, which sorts the ids rather than assuming them.
     */
    expect(graph.nodes).toHaveLength(4);

    const pair = (x: string, y: string) => {
      const [lo, hi] = [x, y].sort();
      return { source: artistNode(lo), target: artistNode(hi), type: 'shared_member', weight: 1 };
    };

    expect(linkTriples(graph.links)).toEqual(linkTriples([pair(a1, a2), pair(b1, b2)]));
  });
});

describe('buildGraph — shared_member edges', () => {
  it('weights the edge by the number of people in common', async () => {
    /**
     * §8.1's weight, and the reason it is worth having: Dire Straits
     * Experience shares THREE members with Dire Straits and is structurally
     * identical to a real side project. The weight is what makes the
     * difference legible in the graph rather than buried in the import.
     */
    const band = await insertArtist('Dire Straits');
    const tribute = await insertArtist('Dire Straits Experience');
    await insertRecord('Brothers in Arms', band);
    await insertRecord('Live', tribute);

    for (const name of ['Chris White', 'Phil Palmer', 'Steve Ferrone']) {
      const person = await insertArtist(name);
      await insertMembership(person, band);
      await insertMembership(person, tribute);
    }

    const graph = await buildGraph({});
    const shared = graph.links.filter((l) => l.type === 'shared_member');

    expect(shared).toHaveLength(1);
    expect(shared[0].weight, 'three people in common').toBe(3);
  });

  it('emits ONE undirected edge per pair, ordered stably by artist id', async () => {
    /**
     * Two groups sharing a person are one edge, not two. The ordering is fixed
     * by artist id so the same collection always produces the same payload —
     * the determinism §8.2 requires of shelf order, for the same reason.
     */
    const one = await insertArtist('Dire Straits');
    const two = await insertArtist('Dire Straits Legacy');
    await insertRecord('A', one);
    await insertRecord('B', two);

    const person = await insertArtist('Alan Clark');
    await insertMembership(person, one);
    await insertMembership(person, two);

    const graph = await buildGraph({});
    const shared = graph.links.filter((l) => l.type === 'shared_member');

    expect(shared).toHaveLength(1);

    const [lo, hi] = [one, two].sort();
    expect(shared[0].source).toBe(artistNode(lo));
    expect(shared[0].target).toBe(artistNode(hi));
  });

  it('does not connect two groups through a person to a band with no records', async () => {
    // The far group is not in the graph, so the edge has nowhere to land.
    const collected = await insertArtist('Dire Straits');
    const uncollected = await insertArtist('Notting Hillbillies');
    await insertRecord('Brothers in Arms', collected);

    const person = await insertArtist('Mark Knopfler');
    await insertMembership(person, collected);
    await insertMembership(person, uncollected);

    const graph = await buildGraph({});

    expect(graph.nodes).toHaveLength(1);
    expect(graph.links).toEqual([]);
  });

  it('counts a person once per pair even with two membership rows', async () => {
    /**
     * §4.3 identifies a membership by (person, group, instrument), so one
     * person may legitimately hold two rows in the same band. That is one
     * person in common, not two — the same duplicate-counting hazard the
     * /manage filter hit with EXISTS.
     */
    const one = await insertArtist('Dire Straits');
    const two = await insertArtist('Dire Straits Legacy');
    await insertRecord('A', one);
    await insertRecord('B', two);

    const person = await insertArtist('Alan Clark');
    await insertMembership(person, one, 'keyboards');
    await insertMembership(person, one, 'guitar');
    await insertMembership(person, two, 'keyboards');

    const graph = await buildGraph({});
    const shared = graph.links.filter((l) => l.type === 'shared_member');

    expect(shared).toHaveLength(1);
    expect(shared[0].weight, 'one person, however many instruments').toBe(1);
  });
});

describe('buildGraph — member_of edges', () => {
  it('emits person-to-group only where the person is themselves collected', async () => {
    /**
     * §8.1's narrowing. A person with their own records is a node in their own
     * right, so the membership is a real edge between two visible nodes.
     * Without records they do not appear at all, and no `member_of` is emitted.
     */
    const band = await insertArtist('Dire Straits');
    const solo = await insertArtist('Mark Knopfler');
    const sideman = await insertArtist('Alan Clark');
    await insertRecord('Brothers in Arms', band);
    await insertRecord('Sailing to Philadelphia', solo);
    await insertRecord('Golden Heart', solo);
    await insertMembership(solo, band);
    await insertMembership(sideman, band);

    const graph = await buildGraph({});
    const memberOf = graph.links.filter((l) => l.type === 'member_of');

    expect(memberOf).toHaveLength(1);
    expect(memberOf[0]).toMatchObject({
      source: artistNode(solo),
      target: artistNode(band),
      weight: 2,
    });
  });
});

describe('buildGraph — genre nodes and edges', () => {
  it('sizes a genre by the records DIRECTLY tagged with it, never rolled up', async () => {
    /**
     * **`ownedCount` is deliberately NOT rolled up, though the genreId FILTER
     * is.** The two rules sit in one module and look contradictory, so the
     * distinction is worth stating precisely: they answer different questions.
     *
     *   - `buildGraph({ genreId: Punk })` MATCHES a record tagged only UK82.
     *     That is §7.1, binding on filtering "and graph purposes", and it is
     *     asserted in the genreId-subset block below.
     *   - A Punk node's `ownedCount` answers "how many records are tagged Punk"
     *     — directly. Rolling up would make every parent larger than all its
     *     children by construction, which is structure the data does not have.
     *
     * **This comment previously read "Filtering by Punk returns UK82 records"
     * as a plain statement of fact.** It was true of the collection list and
     * false of the code it sat above — the graph used flat equality and
     * returned an empty payload for any ancestor. The comment was the reason
     * the defect looked handled: it described the correct rule beside an
     * implementation that did not follow it.
     */
    const [punk] = await db.insert(genres).values({ name: 'Punk' }).returning();
    const [uk82] = await db
      .insert(genres)
      .values({ name: 'UK82', parentGenreId: punk.id })
      .returning();

    const artist = await insertArtist('Discharge');
    const tagged = await insertRecord('Hear Nothing', artist);
    const child = await insertRecord('Why', artist);
    await db.insert(recordGenres).values([
      { recordId: tagged, genreId: punk.id },
      { recordId: child, genreId: uk82.id },
    ]);

    const graph = await buildGraph({});
    const punkNode = graph.nodes.find((n) => n.label === 'Punk');
    const uk82Node = graph.nodes.find((n) => n.label === 'UK82');

    expect(punkNode?.ownedCount, 'its own tagged record only').toBe(1);
    expect(uk82Node?.ownedCount).toBe(1);
    expect(punkNode?.parentGenreId).toBeNull();
    expect(uk82Node?.parentGenreId).toBe(punk.id);
  });

  it('emits an ANCESTOR genre with no records of its own, at ownedCount 0', async () => {
    /**
     * **The structural defect the colour bug exposed.** A record tagged UK82 is
     * not tagged Punk, so a Punk carrying no direct records was absent from the
     * payload entirely — and with it the `genre_parent` edge that draws the
     * hierarchy §8.1 claims to draw. Two scenes under one parent then resolved
     * to different roots and were coloured differently.
     *
     * `ownedCount: 0` is honest here: you own no records tagged Punk directly,
     * and the count says exactly that. This does NOT contradict the
     * people-are-edges rule, which omits zero-count ARTISTS — see the note in
     * graph.ts on why the two differ.
     */
    const [punk] = await db.insert(genres).values({ name: 'Punk' }).returning();
    const [uk82] = await db
      .insert(genres)
      .values({ name: 'UK82', parentGenreId: punk.id })
      .returning();

    const artist = await insertArtist('Discharge');
    const record = await insertRecord('Hear Nothing', artist);
    await db.insert(recordGenres).values({ recordId: record, genreId: uk82.id });

    const graph = await buildGraph({});
    const punkNode = graph.nodes.find((n) => n.id === `genre:${punk.id}`);

    expect(punkNode, 'the parent is drawn even owning nothing directly').toBeDefined();
    expect(punkNode?.ownedCount, 'and says so honestly').toBe(0);
  });

  it('draws the hierarchy through an ancestor that owns nothing', async () => {
    // The genre_parent edge that was missing wherever an intermediate genre had
    // no direct records.
    const [punk] = await db.insert(genres).values({ name: 'Punk' }).returning();
    const [uk82] = await db
      .insert(genres)
      .values({ name: 'UK82', parentGenreId: punk.id })
      .returning();

    const artist = await insertArtist('Discharge');
    const record = await insertRecord('Hear Nothing', artist);
    await db.insert(recordGenres).values({ recordId: record, genreId: uk82.id });

    const graph = await buildGraph({});
    const parents = graph.links.filter((l) => l.type === 'genre_parent');

    expect(parents).toHaveLength(1);
    expect(parents[0]).toMatchObject({
      source: `genre:${uk82.id}`,
      target: `genre:${punk.id}`,
    });
  });

  it('walks the WHOLE ancestor chain, not just one hop', async () => {
    // Punk > UK82 > a sub-scene: emitting only the immediate parent would leave
    // the top-level ancestor — the thing colour keys on — still missing.
    const [punk] = await db.insert(genres).values({ name: 'Punk' }).returning();
    const [uk82] = await db
      .insert(genres)
      .values({ name: 'UK82', parentGenreId: punk.id })
      .returning();
    const [deeper] = await db
      .insert(genres)
      .values({ name: 'Deeper', parentGenreId: uk82.id })
      .returning();

    const artist = await insertArtist('Discharge');
    const record = await insertRecord('Hear Nothing', artist);
    await db.insert(recordGenres).values({ recordId: record, genreId: deeper.id });

    const graph = await buildGraph({});
    const ids = new Set(graph.nodes.map((n) => n.id));

    expect(ids.has(`genre:${uk82.id}`), 'the intermediate').toBe(true);
    expect(ids.has(`genre:${punk.id}`), 'and the root').toBe(true);
  });

  it('does not emit an ancestor for a genre nothing owns', async () => {
    /**
     * The guard against turning the graph into the whole genre table: an
     * unrelated tree with no owned records anywhere stays out entirely.
     */
    const [punk] = await db.insert(genres).values({ name: 'Punk' }).returning();
    await db.insert(genres).values({ name: 'UK82', parentGenreId: punk.id });
    const [jazz] = await db.insert(genres).values({ name: 'Jazz' }).returning();
    await db.insert(genres).values({ name: 'Bebop', parentGenreId: jazz.id });

    const artist = await insertArtist('Discharge');
    await insertRecord('Hear Nothing', artist);

    const graph = await buildGraph({});

    expect(graph.nodes.filter((n) => n.type === 'genre'), 'no genre is owned').toEqual([]);
  });

  it('does not let an ancestor carry a has_genre edge it did not earn', async () => {
    /**
     * The ancestor is a NODE, not a genre the artist is tagged with. §7.1's
     * rollup applies to filtering, not to `has_genre` — an edge to Punk here
     * would claim a record is tagged Punk when it is tagged UK82.
     */
    const [punk] = await db.insert(genres).values({ name: 'Punk' }).returning();
    const [uk82] = await db
      .insert(genres)
      .values({ name: 'UK82', parentGenreId: punk.id })
      .returning();

    const artist = await insertArtist('Discharge');
    const record = await insertRecord('Hear Nothing', artist);
    await db.insert(recordGenres).values({ recordId: record, genreId: uk82.id });

    const graph = await buildGraph({});
    const hasGenre = graph.links.filter((l) => l.type === 'has_genre');

    expect(hasGenre).toHaveLength(1);
    expect(hasGenre[0].target, 'the tagged genre, not its parent').toBe(`genre:${uk82.id}`);
  });

  it('emits a genre_parent edge of weight 1', async () => {
    const [punk] = await db.insert(genres).values({ name: 'Punk' }).returning();
    const [uk82] = await db
      .insert(genres)
      .values({ name: 'UK82', parentGenreId: punk.id })
      .returning();

    const artist = await insertArtist('Discharge');
    const a = await insertRecord('Hear Nothing', artist);
    const b = await insertRecord('Why', artist);
    await db.insert(recordGenres).values([
      { recordId: a, genreId: punk.id },
      { recordId: b, genreId: uk82.id },
    ]);

    const graph = await buildGraph({});
    const parents = graph.links.filter((l) => l.type === 'genre_parent');

    expect(parents).toHaveLength(1);
    expect(parents[0]).toMatchObject({
      source: `genre:${uk82.id}`,
      target: `genre:${punk.id}`,
      weight: 1,
    });
  });
});

describe('buildGraph — has_genre edges (§8.1)', () => {
  /**
   * **The missing link type, found by looking at the rendered graph.** Genre
   * nodes were drawn and connected to nothing, while §8.1's own claim that
   * clusters emerge from "shared genres" went unmet. Two artists tagged UK82
   * cluster because they both connect to the UK82 node.
   *
   * Derived from `record_genres` at query time rather than stored — the same
   * reasoning as `shared_member`: a denormalized field can disagree with the
   * edges it duplicates.
   */
  async function seedTagged(artistName: string, genreName: string, titles: string[]) {
    const [genre] = await db.insert(genres).values({ name: genreName }).returning();
    const artist = await insertArtist(artistName);
    for (const title of titles) {
      const record = await insertRecord(title, artist);
      await db.insert(recordGenres).values({ recordId: record, genreId: genre.id });
    }
    return { artist, genre: genre.id };
  }

  it('connects an artist to the genre their owned records carry', async () => {
    const { artist, genre } = await seedTagged('Discharge', 'UK82', ['Hear Nothing']);

    const graph = await buildGraph({});
    const hasGenre = graph.links.filter((l) => l.type === 'has_genre');

    expect(hasGenre).toHaveLength(1);
    expect(hasGenre[0]).toMatchObject({
      source: artistNode(artist),
      target: `genre:${genre}`,
      weight: 1,
    });
  });

  it('weights the edge by the count of that artist\'s records in the genre', async () => {
    const { artist, genre } = await seedTagged('Discharge', 'UK82', [
      'Hear Nothing',
      'Why',
      'Never Again',
    ]);

    const graph = await buildGraph({});
    const hasGenre = graph.links.filter((l) => l.type === 'has_genre');

    expect(hasGenre).toHaveLength(1);
    expect(hasGenre[0], 'three records in that genre').toMatchObject({
      source: artistNode(artist),
      target: `genre:${genre}`,
      weight: 3,
    });
  });

  it('gives an artist one edge per genre, not one per record', async () => {
    const [punk] = await db.insert(genres).values({ name: 'Punk' }).returning();
    const [uk82] = await db.insert(genres).values({ name: 'UK82' }).returning();
    const artist = await insertArtist('Discharge');

    // One record carrying BOTH genres, plus a second carrying only one: the
    // artist has two genres and three (record, genre) rows.
    const both = await insertRecord('Hear Nothing', artist);
    await db.insert(recordGenres).values([
      { recordId: both, genreId: punk.id },
      { recordId: both, genreId: uk82.id },
    ]);
    const second = await insertRecord('Why', artist);
    await db.insert(recordGenres).values({ recordId: second, genreId: uk82.id });

    const graph = await buildGraph({});
    const hasGenre = graph.links.filter((l) => l.type === 'has_genre');

    expect(hasGenre).toHaveLength(2);
    const byTarget = new Map(hasGenre.map((l) => [l.target, l.weight]));
    expect(byTarget.get(`genre:${punk.id}`)).toBe(1);
    expect(byTarget.get(`genre:${uk82.id}`)).toBe(2);
  });

  it('two artists in one genre both connect to it — the clustering §8.1 claims', async () => {
    const [uk82] = await db.insert(genres).values({ name: 'UK82' }).returning();

    const first = await insertArtist('Discharge');
    const second = await insertArtist('The Varukers');
    for (const [artist, title] of [
      [first, 'Hear Nothing'],
      [second, 'Bloodsuckers'],
    ] as const) {
      const record = await insertRecord(title, artist);
      await db.insert(recordGenres).values({ recordId: record, genreId: uk82.id });
    }

    const graph = await buildGraph({});
    const hasGenre = graph.links.filter((l) => l.type === 'has_genre');

    expect(hasGenre.map((l) => l.source).sort()).toEqual(
      [artistNode(first), artistNode(second)].sort(),
    );
    expect(hasGenre.every((l) => l.target === `genre:${uk82.id}`)).toBe(true);
  });

  it('emits NO edge for an artist whose records carry no genre', async () => {
    // §8.1: such an artist stays grey. Honest absence, not a gap to fill.
    const artist = await insertArtist('Dire Straits');
    await insertRecord('Brothers in Arms', artist);

    const graph = await buildGraph({});

    expect(graph.links.filter((l) => l.type === 'has_genre')).toEqual([]);
    expect(graph.nodes.map((n) => n.label), 'the artist is still drawn').toEqual([
      'Dire Straits',
    ]);
  });

  it('ignores a genre carried only by a WANT-LIST row', async () => {
    /**
     * §5.6 is owned-records-only, and `want_list_genres` is a separate table.
     * An edge sourced from it would put a genre in the graph that no owned
     * record carries — the want list leaking into the collection graph.
     */
    const [genre] = await db.insert(genres).values({ name: 'Crust' }).returning();
    const artist = await insertArtist('Discharge');
    await insertRecord('Hear Nothing', artist);

    const wanted = await db.execute<{ id: string }>(
      sql`INSERT INTO want_list (title, artist_id) VALUES ('Why', ${artist}) RETURNING id`,
    );
    await db.execute(
      sql`INSERT INTO want_list_genres (want_list_id, genre_id)
          VALUES (${wanted.rows[0].id}, ${genre.id})`,
    );

    const graph = await buildGraph({});

    expect(graph.links.filter((l) => l.type === 'has_genre')).toEqual([]);
    expect(graph.nodes.map((n) => n.label), 'and no genre node either').toEqual(['Discharge']);
  });

  it('drops an edge to a genre filtered out by the genreId subset', async () => {
    /**
     * The dangling-endpoint case. Subsetting to Punk emits only the Punk genre
     * node, so an artist who ALSO has a Rock record must not carry an edge to a
     * Rock node that was never emitted — a link into empty space.
     */
    const [punk] = await db.insert(genres).values({ name: 'Punk' }).returning();
    const [rock] = await db.insert(genres).values({ name: 'Rock' }).returning();

    const artist = await insertArtist('Discharge');
    const punkRecord = await insertRecord('Hear Nothing', artist);
    const rockRecord = await insertRecord('Side Project', artist);
    await db.insert(recordGenres).values([
      { recordId: punkRecord, genreId: punk.id },
      { recordId: rockRecord, genreId: rock.id },
    ]);

    const graph = await buildGraph({ genreId: punk.id });
    const nodeIds = new Set(graph.nodes.map((n) => n.id));

    for (const link of graph.links) {
      expect(nodeIds.has(link.source), `source ${link.source} is a node`).toBe(true);
      expect(nodeIds.has(link.target), `target ${link.target} is a node`).toBe(true);
    }
    expect(graph.links.some((l) => l.target === `genre:${rock.id}`)).toBe(false);
  });
});

describe('buildGraph — influence edges', () => {
  it('carries artist_influences.strength as the weight, directed', async () => {
    const source = await insertArtist('Discharge');
    const target = await insertArtist('The Varukers');
    await insertRecord('Hear Nothing', source);
    await insertRecord('Bloodsuckers', target);
    await db
      .insert(artistInfluences)
      .values({ sourceArtistId: source, targetArtistId: target, strength: 4 });

    const graph = await buildGraph({});
    const influence = graph.links.filter((l) => l.type === 'influence');

    expect(influence).toHaveLength(1);
    expect(influence[0]).toMatchObject({
      source: artistNode(source),
      target: artistNode(target),
      weight: 4,
    });
  });

  it('drops an influence edge pointing at an artist with no records', async () => {
    const source = await insertArtist('Discharge');
    const target = await insertArtist('Antisect');
    await insertRecord('Hear Nothing', source);
    await db
      .insert(artistInfluences)
      .values({ sourceArtistId: source, targetArtistId: target, strength: 5 });

    const graph = await buildGraph({});

    expect(graph.nodes).toHaveLength(1);
    expect(graph.links, 'an edge needs two nodes').toEqual([]);
  });
});

describe('buildGraph — the genreId subset (§5.6)', () => {
  it('narrows to artists with a record in that genre', async () => {
    const [punk] = await db.insert(genres).values({ name: 'Punk' }).returning();

    const punkArtist = await insertArtist('Discharge');
    const other = await insertArtist('Dire Straits');
    const punkRecord = await insertRecord('Hear Nothing', punkArtist);
    await insertRecord('Brothers in Arms', other);
    await db.insert(recordGenres).values({ recordId: punkRecord, genreId: punk.id });

    const graph = await buildGraph({ genreId: punk.id });

    expect(graph.nodes.map((n) => n.label)).toContain('Discharge');
    expect(graph.nodes.map((n) => n.label)).not.toContain('Dire Straits');
  });

  it('matches a record tagged only with a DESCENDANT of the filtered genre', async () => {
    /**
     * **§7.1 is binding here, not only on the collection list**: "a record
     * tagged with a child genre is implicitly a member of all ancestor genres
     * for filtering **and graph purposes**."
     *
     * This shipped as flat equality — `rg.genre_id = $1` — so filtering by Punk
     * returned an entirely EMPTY graph when the records were tagged UK82, while
     * `/?genreId=<Punk>` returned them. Measured on `Punk > UK82 > Oi!` with one
     * record tagged only `Oi!`: records=1, wantList=1, graphNodes=0.
     *
     * The `/graph` genre dropdown lists every genre with no hierarchy filter,
     * so selecting a parent was a reachable path to a blank canvas.
     */
    const [punk] = await db.insert(genres).values({ name: 'Punk' }).returning();
    const [uk82] = await db
      .insert(genres)
      .values({ name: 'UK82', parentGenreId: punk.id })
      .returning();

    const artist = await insertArtist('Discharge');
    const record = await insertRecord('Hear Nothing', artist);
    await db.insert(recordGenres).values({ recordId: record, genreId: uk82.id });

    const graph = await buildGraph({ genreId: punk.id });

    expect(graph.nodes.map((n) => n.label), 'the artist survives the filter').toContain(
      'Discharge',
    );
  });

  it('matches through more than one level of nesting', async () => {
    // Two levels, because a fix that walked exactly one level would pass the
    // test above and still be wrong for `Punk > UK82 > Oi!`.
    const [punk] = await db.insert(genres).values({ name: 'Punk' }).returning();
    const [uk82] = await db
      .insert(genres)
      .values({ name: 'UK82', parentGenreId: punk.id })
      .returning();
    const [oi] = await db.insert(genres).values({ name: 'Oi!', parentGenreId: uk82.id }).returning();

    const artist = await insertArtist('Discharge');
    const record = await insertRecord('Hear Nothing', artist);
    await db.insert(recordGenres).values({ recordId: record, genreId: oi.id });

    const graph = await buildGraph({ genreId: punk.id });

    expect(graph.nodes.map((n) => n.label)).toContain('Discharge');
  });

  it('does NOT match a record tagged with an ANCESTOR of the filtered genre', async () => {
    /**
     * The direction is asymmetric and the complement matters: §7.1 makes a child
     * a member of its ancestors, not the reverse. A record tagged only `Punk` is
     * not a UK82 record, and a subtree walk that went upward would claim it was.
     */
    const [punk] = await db.insert(genres).values({ name: 'Punk' }).returning();
    const [uk82] = await db
      .insert(genres)
      .values({ name: 'UK82', parentGenreId: punk.id })
      .returning();

    const artist = await insertArtist('Discharge');
    const record = await insertRecord('Hear Nothing', artist);
    await db.insert(recordGenres).values({ recordId: record, genreId: punk.id });

    const graph = await buildGraph({ genreId: uk82.id });

    expect(graph.nodes.map((n) => n.label)).not.toContain('Discharge');
  });

  it('agrees with the collection list on the same fixture', async () => {
    /**
     * **The seam, asserted directly.** The two paths answered the same question
     * differently for a year: identical `genreSubtree` copies in records and
     * want-list, and flat equality in the graph. Pinning the ANSWERS against
     * each other — rather than each against its own expectation — is what makes
     * a future divergence fail here rather than in a screenshot.
     */
    const [punk] = await db.insert(genres).values({ name: 'Punk' }).returning();
    const [uk82] = await db
      .insert(genres)
      .values({ name: 'UK82', parentGenreId: punk.id })
      .returning();

    const artist = await insertArtist('Discharge');
    const record = await insertRecord('Hear Nothing', artist);
    await db.insert(recordGenres).values({ recordId: record, genreId: uk82.id });

    const listed = await listRecords({
      limit: 50,
      offset: 0,
      sort: { field: 'title', direction: 'asc' },
      filters: { genreId: punk.id },
    });
    const graph = await buildGraph({ genreId: punk.id });

    const artistsInGraph = graph.nodes.filter((n) => n.type === 'artist');

    expect(listed.total, 'the list matches the record').toBe(1);
    expect(artistsInGraph, 'and so does the graph').toHaveLength(1);
  });
});

describe('buildGraph — priorityTier', () => {
  it('carries the minimum want-list priority across an artist', async () => {
    /**
     * §8.1's `priorityTier`, which survives the owned-only scoping: it is
     * want-list-derived metadata hung on an OWNED node, not a wanted node.
     */
    const artist = await insertArtist('Discharge');
    await insertRecord('Hear Nothing', artist);
    await db.execute(
      sql`INSERT INTO want_list (title, artist_id, priority) VALUES ('Why', ${artist}, 4)`,
    );
    await db.execute(
      sql`INSERT INTO want_list (title, artist_id, priority) VALUES ('Grave New World', ${artist}, 2)`,
    );

    const graph = await buildGraph({});

    expect(graph.nodes[0].priorityTier, 'the most urgent, not the last inserted').toBe(2);
  });

  it('is null for an artist with nothing on the want list', async () => {
    const artist = await insertArtist('Dire Straits');
    await insertRecord('Brothers in Arms', artist);

    const graph = await buildGraph({});

    expect(graph.nodes[0].priorityTier).toBeNull();
  });
});
