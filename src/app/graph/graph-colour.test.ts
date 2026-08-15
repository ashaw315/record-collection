import { describe, expect, it } from 'vitest';
import { topLevelAncestors, colourForAncestor, artistGenreAncestors } from './graph-colour';

/**
 * SPEC.md §8.1: "Colour by top-level ancestor genre."
 *
 * The payload gives each genre node a `parentGenreId` and nothing else, so the
 * ancestor is WALKED, not looked up — and the walk is the only real logic on
 * this screen, which is why it lives in a pure module rather than inside the
 * simulation component.
 *
 * §8's genre rule is the reason it matters: UK82, US hardcore, horror punk and
 * psychobilly are different scenes. Colouring by top-level ancestor groups them
 * under Punk visually while §7.1 keeps them distinct in the data — flattening
 * the hierarchy anywhere else would be the error §8 warns about.
 */

describe('topLevelAncestors', () => {
  it('maps a root genre to itself', () => {
    const map = topLevelAncestors([{ id: 'punk', parentGenreId: null }]);

    expect(map.get('punk')).toBe('punk');
  });

  it('walks a child to its root', () => {
    const map = topLevelAncestors([
      { id: 'punk', parentGenreId: null },
      { id: 'uk82', parentGenreId: 'punk' },
    ]);

    expect(map.get('uk82')).toBe('punk');
  });

  it('walks a grandchild the whole way up', () => {
    // Punk > UK82 > a hypothetical sub-scene. The walk cannot stop at one hop.
    const map = topLevelAncestors([
      { id: 'punk', parentGenreId: null },
      { id: 'uk82', parentGenreId: 'punk' },
      { id: 'deeper', parentGenreId: 'uk82' },
    ]);

    expect(map.get('deeper')).toBe('punk');
  });

  it('keeps two separate trees apart', () => {
    const map = topLevelAncestors([
      { id: 'punk', parentGenreId: null },
      { id: 'uk82', parentGenreId: 'punk' },
      { id: 'blues', parentGenreId: null },
      { id: 'delta', parentGenreId: 'blues' },
    ]);

    expect(map.get('uk82')).toBe('punk');
    expect(map.get('delta')).toBe('blues');
  });

  it('treats a parent missing from the payload as a root', () => {
    /**
     * Real: `genreId` subsets the graph, so a child can be present while its
     * parent is filtered out. Following a dangling id would return undefined
     * and leave the node uncoloured for no reason the user could see.
     */
    const map = topLevelAncestors([{ id: 'uk82', parentGenreId: 'punk' }]);

    expect(map.get('uk82')).toBe('uk82');
  });

  it('terminates on a cycle instead of hanging the render', () => {
    /**
     * `genres.parent_genre_id` has no cycle constraint, so a→b→a is storable.
     * An unguarded walk here is an infinite loop inside a render — the browser
     * tab freezes and the screen never appears, which is a far worse failure
     * than a wrong colour.
     */
    const map = topLevelAncestors([
      { id: 'a', parentGenreId: 'b' },
      { id: 'b', parentGenreId: 'a' },
    ]);

    expect(map.get('a')).toBeDefined();
    expect(map.get('b')).toBeDefined();
  });

  it('terminates on a self-referencing genre', () => {
    const map = topLevelAncestors([{ id: 'a', parentGenreId: 'a' }]);

    expect(map.get('a')).toBe('a');
  });
});

describe('colourForAncestor', () => {
  it('gives the same ancestor the same colour every time', () => {
    // The graph must not reshuffle its palette between loads.
    expect(colourForAncestor('punk', ['punk', 'blues'])).toBe(
      colourForAncestor('punk', ['punk', 'blues']),
    );
  });

  it('gives different ancestors different colours', () => {
    const ancestors = ['punk', 'blues', 'reggae'];
    const colours = ancestors.map((a) => colourForAncestor(a, ancestors));

    expect(new Set(colours).size).toBe(3);
  });

  it('is stable regardless of the order ancestors arrive in', () => {
    /**
     * The ancestor list comes from payload order, which is ordered by name —
     * but a `genreId` subset changes which genres are present, and a colour
     * that shifts when an unrelated genre is filtered out would make the two
     * views look like different data.
     */
    expect(colourForAncestor('punk', ['blues', 'punk'])).toBe(
      colourForAncestor('punk', ['punk', 'blues']),
    );
  });

  it('returns a neutral colour for a node with no ancestor', () => {
    // An artist whose records carry no genre stays grey (§8.1).
    expect(colourForAncestor(null, ['punk'])).toBeTruthy();
  });
});

describe('artistGenreAncestors — the §8.1 two-hop walk', () => {
  /**
   * §8.1 as amended: artists are coloured by their top-level ancestor genre,
   * walked `artist → genre → root` over the `has_genre` and `genre_parent`
   * edges, "using the genre with the most of that artist's owned records and
   * breaking ties by name so the same collection always colours the same way".
   *
   * Derived from the edges rather than a payload field, for the reason §8.1
   * gives for `shared_member`: a stored association can disagree with the edges
   * that duplicate it.
   */

  const GENRES = [
    { id: 'genre:punk', label: 'Punk', parentGenreId: null },
    { id: 'genre:uk82', label: 'UK82', parentGenreId: 'punk' },
    { id: 'genre:rock', label: 'Rock', parentGenreId: null },
  ];

  function hasGenre(artist: string, genre: string, weight: number) {
    return { source: artist, target: genre, type: 'has_genre' as const, weight };
  }

  it('walks an artist through one genre to its root', () => {
    const map = artistGenreAncestors(GENRES, [hasGenre('artist:a', 'genre:uk82', 3)]);

    expect(map.get('artist:a'), 'UK82 rolls up to Punk').toBe('genre:punk');
  });

  it('maps an artist on a root genre to that genre', () => {
    const map = artistGenreAncestors(GENRES, [hasGenre('artist:a', 'genre:rock', 1)]);

    expect(map.get('artist:a')).toBe('genre:rock');
  });

  it('picks the genre with the MOST of that artist\'s records', () => {
    /**
     * The tie-break's main clause. An artist with one Rock record and four UK82
     * records is a punk artist that happens to own a Rock record, and colouring
     * by whichever edge arrived first would be arbitrary.
     */
    const map = artistGenreAncestors(GENRES, [
      hasGenre('artist:a', 'genre:rock', 1),
      hasGenre('artist:a', 'genre:uk82', 4),
    ]);

    expect(map.get('artist:a')).toBe('genre:punk');
  });

  it('breaks a tie by genre NAME, not by edge order', () => {
    /**
     * §8.1's determinism clause. Two genres at equal weight must resolve the
     * same way every load — and the payload's edge order must not decide it, or
     * an unrelated change upstream repaints the graph.
     */
    const forward = artistGenreAncestors(GENRES, [
      hasGenre('artist:a', 'genre:rock', 2),
      hasGenre('artist:a', 'genre:uk82', 2),
    ]);
    const reversed = artistGenreAncestors(GENRES, [
      hasGenre('artist:a', 'genre:uk82', 2),
      hasGenre('artist:a', 'genre:rock', 2),
    ]);

    expect(forward.get('artist:a')).toBe(reversed.get('artist:a'));
    // "Rock" < "UK82" by name, so Rock wins and it is its own root.
    expect(forward.get('artist:a')).toBe('genre:rock');
  });

  it('leaves an artist with no genre edge absent from the map', () => {
    // §8.1: "An artist whose records carry no genre stays grey — that is an
    // honest absence, not a gap to fill."
    const map = artistGenreAncestors(GENRES, [hasGenre('artist:a', 'genre:uk82', 1)]);

    expect(map.has('artist:b')).toBe(false);
    expect(colourForAncestor(map.get('artist:b') ?? null, ['genre:punk'])).toBe(
      colourForAncestor(null, ['genre:punk']),
    );
  });

  it('ignores link types that are not has_genre', () => {
    /**
     * `member_of` and `influence` also have an artist as `source`. Treating any
     * edge as a genre association would colour an artist by whatever artist
     * they influence — a genre claim invented from a lineup fact, which is the
     * §8 flattening hazard.
     */
    const map = artistGenreAncestors(GENRES, [
      { source: 'artist:a', target: 'artist:b', type: 'influence', weight: 5 },
      { source: 'artist:a', target: 'artist:c', type: 'member_of', weight: 2 },
    ]);

    expect(map.size).toBe(0);
  });

  it('ignores a has_genre edge pointing at an unknown genre', () => {
    // A `genreId` subset can drop the genre node while an edge survives
    // upstream; following it would key the colour to a node nobody can see.
    const map = artistGenreAncestors(GENRES, [hasGenre('artist:a', 'genre:missing', 9)]);

    expect(map.has('artist:a')).toBe(false);
  });

  it('gives two scenes under one parent the SAME colour root', () => {
    /**
     * **The defect that sent unit 12f back to the query layer.** UK82 and US
     * Hardcore are both children of Punk, so §8.1's "colour by top-level
     * ancestor" makes them one colour family. On the rendered graph they came
     * out blue and amber.
     *
     * The cause was never in this walk — it was that `buildGraph` emitted a
     * genre node only for genres with directly-tagged owned records, so a Punk
     * carrying none was absent and each child became its own root. The payload
     * now emits ancestors, so Punk is HERE, and this test states the property
     * with the parent present.
     */
    const genres = [
      { id: 'genre:punk', label: 'Punk', parentGenreId: null },
      { id: 'genre:uk82', label: 'UK82', parentGenreId: 'punk' },
      { id: 'genre:hc', label: 'US Hardcore', parentGenreId: 'punk' },
    ];

    const map = artistGenreAncestors(genres, [
      hasGenre('artist:a', 'genre:uk82', 4),
      hasGenre('artist:b', 'genre:hc', 3),
    ]);

    expect(map.get('artist:a')).toBe('genre:punk');
    expect(map.get('artist:a')).toBe(map.get('artist:b'));
  });

  it('still treats a genuinely absent parent as a root', () => {
    /**
     * The dangling-parent guard, which the payload fix does NOT make dead: a
     * `genreId` subset can still drop a parent, and following it would key the
     * colour to a node nobody can see. Kept as its own test so the two cases
     * stay visibly distinct.
     */
    const map = artistGenreAncestors(
      [{ id: 'genre:uk82', label: 'UK82', parentGenreId: 'punk' }],
      [hasGenre('artist:a', 'genre:uk82', 4)],
    );

    expect(map.get('artist:a')).toBe('genre:uk82');
  });

  it('is unaffected by a cycle in the genre hierarchy', () => {
    // The walk delegates to topLevelAncestors, which is cycle-guarded; this
    // asserts the artist path inherits that rather than looping on its own.
    const cyclic = [
      { id: 'genre:a', label: 'A', parentGenreId: 'b' },
      { id: 'genre:b', label: 'B', parentGenreId: 'a' },
    ];

    const map = artistGenreAncestors(cyclic, [hasGenre('artist:x', 'genre:a', 1)]);

    expect(map.get('artist:x')).toBeDefined();
  });
});
