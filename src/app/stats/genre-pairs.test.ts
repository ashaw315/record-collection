import { describe, expect, it } from 'vitest';
import { flattenPairs, genrePairs, type GenreCount } from './genre-pairs';

/**
 * A66's cases, taken from the real collection rather than invented:
 *
 *   `Jazz 3 · 4`    a parent holding less than its branch — the load-bearing one
 *   `Rock 10 · 10`  a branch walked that added nothing: the receipt
 *   `Punk 0 · 1`    nothing of its own, something below
 *   `Dub 1`         no branch, so no second figure at all
 *   `Black Metal 0` childless at depth 2, so one number — see A66's note
 *
 * **If those render identically under any implementation, the pair is not
 * carrying what it exists to carry**, which is what these assertions are for.
 */

/** The live shape, reduced to the branches under test. */
const ROWS: GenreCount[] = [
  { id: 'rock', name: 'Rock', parentGenreId: null, direct: 10 },
  { id: 'punk', name: 'Punk', parentGenreId: 'rock', direct: 0 },
  { id: 'uk82', name: 'UK82', parentGenreId: 'punk', direct: 1 },
  { id: 'ushc', name: 'US Hardcore', parentGenreId: 'punk', direct: 0 },
  { id: 'metal', name: 'Heavy Metal', parentGenreId: 'rock', direct: 1 },
  { id: 'black', name: 'Black Metal', parentGenreId: 'metal', direct: 0 },
  { id: 'jazz', name: 'Jazz', parentGenreId: null, direct: 3 },
  { id: 'fusion', name: 'Fusion', parentGenreId: 'jazz', direct: 3 },
  { id: 'dub', name: 'Dub', parentGenreId: null, direct: 1 },
];

/**
 * Which records sit under each genre DIRECTLY.
 *
 * Named ids rather than counts, because the subtree number deduplicates: `r1`
 * appears under both `Rock` and `UK82`, and a fold over `direct` would report
 * it twice.
 */
const RECORDS = new Map<string, ReadonlySet<string>>([
  ['rock', new Set(['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10'])],
  ['uk82', new Set(['r1'])],
  ['metal', new Set(['r2'])],
  ['jazz', new Set(['j1', 'j2', 'j3'])],
  ['fusion', new Set(['j1', 'j2', 'j4'])],
  ['dub', new Set(['d1'])],
]);

const tree = () => genrePairs(ROWS, RECORDS);

/** What a row puts on screen: a pair where a branch exists, one number where not. */
const render = (name: string) => {
  const node = find(name);
  return node.hasBranch ? `${node.direct} · ${node.subtree}` : String(node.direct);
};
const find = (name: string) => {
  const node = flattenPairs(tree()).find((row) => row.name === name);
  if (node === undefined) throw new Error(`${name} is not in the tree`);
  return node;
};

describe('the cases the pair exists to distinguish', () => {
  it('gives a parent holding less than its branch a differing pair', () => {
    // Jazz 3 · 4 — the second number is not redundant, and this is the row
    // that proves it in the COLLAPSED view, because Jazz is top-level.
    const jazz = find('Jazz');

    expect(jazz.direct).toBe(3);
    expect(jazz.subtree).toBe(4);
    expect(jazz.hasBranch, 'so it renders a pair').toBe(true);
  });

  it('gives a parent whose branch adds nothing a MATCHING pair, not one number', () => {
    /*
      Rock 10 · 10. The second number is a receipt: the branch was walked and
      added nothing. Rendering one number here would say the same thing as `Dub
      1`, which has no branch at all — the two states would become
      indistinguishable, and that is exactly what the pair exists to prevent.
    */
    const rock = find('Rock');

    expect(rock.direct).toBe(10);
    expect(rock.subtree).toBe(10);
    expect(rock.hasBranch, 'the branch exists, so the receipt is rendered').toBe(true);
  });

  it('gives a parent holding nothing of its own but something below it', () => {
    // Punk 0 · 1 — reachable only on expansion, since Punk sits under Rock.
    const punk = find('Punk');

    expect(punk.direct).toBe(0);
    expect(punk.subtree).toBe(1);
    expect(punk.hasBranch).toBe(true);
  });

  it('gives a genre holding nothing anywhere a zero pair, and keeps the row', () => {
    /*
      Black Metal renders `0`, not `0 · 0`: childless at depth 2, and a pair on
      a childless row asserts a walk that never happened. `/stats` is an account of the collection and its
      failure mode is hiding its own gaps — a genre created and never filled is
      such a gap, so the row stays and the zeros recede by taking muted.
    */
    const black = find('Black Metal');

    expect(black.direct).toBe(0);
    expect(black.subtree).toBe(0);
    expect(black.hasBranch, 'no children, so no second figure').toBe(false);
  });

  it('gives a childless genre ONE number, because a second would describe nothing', () => {
    // Dub 1. The absence of the second figure is the distinction; the row is
    // not marked in any other way.
    const dub = find('Dub');

    expect(dub.direct).toBe(1);
    expect(dub.hasBranch).toBe(false);
  });

  /**
   * **The discriminating assertion.** Each named case must be distinguishable
   * from the others by what it RENDERS, not merely by the numbers behind it. A
   * rendering that showed `direct` alone would make Rock and Dub identical; one
   * that showed `subtree` alone would make Punk and UK82 identical. `Dub 1` and
   * `Black Metal 0` share a FORMAT and differ in value, which is the fourth
   * case: one number is right for both, and the value is the information.
   */
  it('renders the four cases as four different things', () => {
    const rendered = [render('Jazz'), render('Rock'), render('Dub'), render('Black Metal')];

    expect(rendered).toEqual(['3 · 4', '10 · 10', '1', '0']);
    expect(new Set(rendered).size, 'four cases, four renderings').toBe(4);
  });

  /**
   * **A case that is reachable and UNOBSERVED**, which is not the same as
   * unreachable — the distinction §7a draws about states the schema permits.
   *
   * A parent WITH children whose every descendant is empty renders `0 · 0`: the
   * branch exists, so it is walked, and the walk finds nothing. No such genre
   * exists in the collection today, so nothing on screen demonstrates it, and
   * A66 names it rather than drawing it. The code handles it because it falls
   * out of the rule rather than because anything special was written for it —
   * which is exactly why it is worth pinning here.
   */
  it('renders a parent whose whole branch is empty as a walked zero pair', () => {
    const EMPTY_BRANCH: GenreCount[] = [
      { id: 'shell', name: 'Shell', parentGenreId: null, direct: 0 },
      { id: 'hollow', name: 'Hollow', parentGenreId: 'shell', direct: 0 },
    ];

    const [shell] = genrePairs(EMPTY_BRANCH, new Map());

    expect(shell.direct).toBe(0);
    expect(shell.subtree).toBe(0);
    expect(shell.hasBranch, 'the branch exists, so the zero is a receipt').toBe(true);

    /*
      The point of the case: this is NOT `Black Metal 0`. Same numbers, different
      format, because one was walked and the other had nothing to walk.
    */
    expect(`${shell.direct} · ${shell.subtree}`).toBe('0 · 0');
    expect(render('Black Metal'), 'the childless zero renders one number').toBe('0');
  });
});

describe('subtree counts', () => {
  it('deduplicates a record reachable by two paths', () => {
    /*
      §7.1 as arithmetic. `r1` is filed under Rock directly AND under UK82
      beneath it; Rock's subtree is 10, not 11. A fold over `direct` would
      report 12 — this is why the walk carries record ids rather than counts.
    */
    expect(find('Rock').subtree).toBe(10);
  });

  it('counts a record once per genre even when two children share it', () => {
    // Jazz holds j1..j3; Fusion holds j1, j2 and j4. The union is four.
    expect(find('Jazz').subtree).toBe(4);
  });

  it('rolls a grandchild up to the top', () => {
    // UK82's r1 reaches Punk, and Punk has nothing of its own.
    expect(find('Punk').subtree).toBe(1);
  });
});

describe('the tree survives a cycle in the data', () => {
  /**
   * `parent_genre_id` has no cycle constraint — no CHECK can traverse rows — so
   * the only guard is `wouldCreateCycle` on `PATCH /api/genres/:id`. If that is
   * ever bypassed, an unguarded walk here does not return a wrong number, it
   * does not return at all. `genreSubtree`'s `UNION` makes the same argument in
   * SQL; this is its JS counterpart.
   */
  const CYCLIC: GenreCount[] = [
    { id: 'a', name: 'A', parentGenreId: 'c', direct: 1 },
    { id: 'b', name: 'B', parentGenreId: 'a', direct: 1 },
    { id: 'c', name: 'C', parentGenreId: 'b', direct: 1 },
    { id: 'loose', name: 'Loose', parentGenreId: null, direct: 2 },
  ];
  const CYCLIC_RECORDS = new Map<string, ReadonlySet<string>>([
    ['a', new Set(['x'])],
    ['b', new Set(['y'])],
    ['c', new Set(['z'])],
    ['loose', new Set(['p', 'q'])],
  ]);

  it('terminates rather than hanging', () => {
    // The assertion is that this line is reached at all.
    const nodes = genrePairs(CYCLIC, CYCLIC_RECORDS);

    expect(Array.isArray(nodes)).toBe(true);
  });

  it('renders every genre exactly once, including the ones in the loop', () => {
    const names = flattenPairs(genrePairs(CYCLIC, CYCLIC_RECORDS)).map((n) => n.name);

    expect(new Set(names).size, 'no genre is duplicated by the loop').toBe(names.length);
    expect(names).toContain('Loose');
  });

  it('leaves an acyclic branch correct while a cycle exists elsewhere', () => {
    // The realistic bad state: one broken branch, the rest fine. A guard that
    // coped by refusing to walk anything would pass the two above.
    const nodes = flattenPairs(genrePairs(CYCLIC, CYCLIC_RECORDS));
    const loose = nodes.find((n) => n.name === 'Loose');

    expect(loose?.direct).toBe(2);
    expect(loose?.subtree).toBe(2);
  });
});

describe('shape', () => {
  it('collapses to top level, ordered by name', () => {
    expect(tree().map((node) => node.name)).toEqual(['Dub', 'Jazz', 'Rock']);
  });

  it('carries depth so a row can be indented without recomputing it', () => {
    expect(find('Rock').depth).toBe(0);
    expect(find('Punk').depth).toBe(1);
    expect(find('UK82').depth).toBe(2);
  });

  it('keeps every genre, including those holding nothing anywhere', () => {
    const names = flattenPairs(tree()).map((n) => n.name);

    expect(names, 'an account does not hide its own gaps').toContain('Black Metal');
    expect(names).toContain('US Hardcore');
    expect(names).toHaveLength(ROWS.length);
  });
});
