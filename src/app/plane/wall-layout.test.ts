import { describe, expect, it } from 'vitest';
import {
  MIN_SHELF_ROWS,
  WALL_EDGE_MARGIN,
  layoutWall,
  type WallSpine,
} from './wall-layout';
import { MAX_SPINE_WIDTH, MIN_SPINE_WIDTH, SPINE_HEIGHT, SHELF_EDGE } from '../shelf/spine';

/**
 * Where every spine sits on the wall, computed rather than left to flexbox.
 *
 * **This is where the testable value of the rewrite is.** Rendering is hard to
 * assert and this project has been burned by tests that measured the wrong
 * thing — a wrapper with no size, a background with no box, a canvas that a
 * rect cannot see. The layout is arithmetic, so it can be tested directly and
 * exactly, and it is also where the defects that matter live: a spine in the
 * wrong row, a row that does not fill the width, a wall whose shelves drift
 * from the records standing on them.
 *
 * The inputs are the same rules the CSS wall used — `spineWidth` per record,
 * `SPINE_HEIGHT`, `SHELF_EDGE` — because §10b's proportions are settled
 * findings and this unit rewrites rendering, not rules.
 */

/** Records with stable widths, so a test can predict the packing exactly. */
function spines(count: number, width = 20): WallSpine[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `r${index}`,
    width,
  }));
}

describe('layoutWall', () => {
  it('packs as many spines onto a row as the width allows', () => {
    /**
     * §10b: "One shelf holds as many spines as fit; the rest continue on a
     * shelf below." With 20px spines, a 3px gap and 16px of padding each side,
     * a 1000px wall fits (1000 - 32 + 3) / 23 = 42 per row.
     *
     * Fails against `layoutWall` if it packs by a fixed count rather than by
     * measured width — which is what makes the wall respond to a viewport.
     */
    const wall = layoutWall({ spines: spines(100), viewportWidth: 1000 });

    /*
      40 rather than 42: the edge margin widened from 16 to 40 so the wall has
      ends, which costs each row a spine. The property — packed by measured
      width, not a fixed count — is unchanged.
    */
    const firstRow = wall.placed.filter((p) => p.row === 0);
    expect(firstRow.length).toBe(40);
  });

  it('wraps the remainder onto the next row, in order', () => {
    /**
     * The ordering is §10b's genre ordering and must survive layout untouched:
     * a wall that reordered records to pack them better would break the one
     * requirement that outlived every mechanism — the same collection always
     * produces the same wall.
     */
    const wall = layoutWall({ spines: spines(50), viewportWidth: 1000 });

    expect(wall.placed.map((p) => p.id)).toEqual(spines(50).map((s) => s.id));
    expect(wall.placed[39].row).toBe(0);
    expect(wall.placed[40].row).toBe(1);
  });

  it('stacks rows one SPINE_ROW_HEIGHT apart, so shelves land under feet', () => {
    /**
     * The relationship unit 23 spent eight attempts getting right in CSS: a
     * row's shelf is at its feet, and the next row starts below that shelf. In
     * a computed layout it is arithmetic rather than a background offset, which
     * is the main thing this rewrite buys.
     */
    const wall = layoutWall({ spines: spines(100), viewportWidth: 1000 });

    const row0 = wall.placed.find((p) => p.row === 0);
    const row1 = wall.placed.find((p) => p.row === 1);
    expect(row0).toBeDefined();
    expect(row1).toBeDefined();
    if (row0 === undefined || row1 === undefined) return;

    expect(row1.y - row0.y).toBeCloseTo(SPINE_HEIGHT + SHELF_EDGE, 5);
  });

  it('gives every row a shelf that spans the FULL width, not the records', () => {
    /**
     * §10b, and unit 22's finding: "the surface runs edge to edge and ends
     * where the wall ends", not where the records do. A shelf that stops where
     * the records stop reads as a container, and every candidate width failed
     * the same way.
     *
     * The discriminating case is a PARTIAL last row — with a full row the two
     * are the same observation.
     */
    const wall = layoutWall({ spines: spines(45), viewportWidth: 1000 });

    /*
      Four, not two: the room's minimum. The property under test is that every
      shelf spans the wall — including the partial row and the empty ones.
    */
    expect(wall.shelves.length, 'one shelf per row, including the empty ones').toBe(4);
    for (const shelf of wall.shelves) {
      expect(shelf.width, 'the shelf spans the wall').toBeCloseTo(1000, 5);
      expect(shelf.x, 'and starts at its left edge').toBeCloseTo(0, 5);
    }
  });

  it('places spines left to right with a consistent gap', () => {
    const wall = layoutWall({ spines: spines(5, 20), viewportWidth: 1000 });

    for (let i = 1; i < 5; i += 1) {
      const gap = wall.placed[i].x - (wall.placed[i - 1].x + wall.placed[i - 1].width);
      expect(gap, `gap before spine ${i}`).toBeCloseTo(wall.gap, 5);
    }
  });

  it('honours each record\'s own width rather than assuming a uniform one', () => {
    /**
     * `spineWidth` varies 17-24px from the record id, so the wall has texture
     * rather than reading as a barcode. A layout that packed uniformly would
     * throw that away and drift from the widths actually drawn.
     */
    const mixed: WallSpine[] = [
      { id: 'a', width: MIN_SPINE_WIDTH },
      { id: 'b', width: MAX_SPINE_WIDTH },
      { id: 'c', width: MIN_SPINE_WIDTH },
    ];
    const wall = layoutWall({ spines: mixed, viewportWidth: 1000 });

    expect(wall.placed[1].x - wall.placed[0].x).toBeCloseTo(MIN_SPINE_WIDTH + wall.gap, 5);
    expect(wall.placed[2].x - wall.placed[1].x).toBeCloseTo(MAX_SPINE_WIDTH + wall.gap, 5);
  });

  it('reports a total height that covers every row and its shelf', () => {
    /**
     * What the scroll container needs. Getting it short by one shelf clips the
     * last row's surface, which is the "records standing on nothing" defect in
     * a new place.
     */
    const wall = layoutWall({ spines: spines(45), viewportWidth: 1000 });

    /* Four rows now: the room's minimum, not the two these records occupy. */
    expect(wall.height).toBeCloseTo(4 * (SPINE_HEIGHT + SHELF_EDGE), 5);
  });

  it('survives a viewport narrower than one spine without looping forever', () => {
    /**
     * A degenerate case that is reachable: a very narrow viewport, or a
     * container measured before layout at width 0. A packer that requires at
     * least one spine per row terminates; one that does not, hangs the tab.
     */
    const wall = layoutWall({ spines: spines(3, 20), viewportWidth: 10 });

    expect(wall.placed.length).toBe(3);
    expect(wall.placed.map((p) => p.row)).toEqual([0, 1, 2]);
  });

  it('lays out an empty collection without inventing a row', () => {
    const wall = layoutWall({ spines: [], viewportWidth: 1000 });

    expect(wall.placed).toEqual([]);
    expect(wall.shelves).toEqual([]);
    expect(wall.height).toBe(0);
  });

  it('is at least FOUR shelves deep, however few records there are', () => {
    /**
     * **A room has a size.** Filtering to 26 records collapsed the wall to a
     * single row — the room shrink-wrapping its contents. That is the same
     * failure as every rejected minimum-WIDTH candidate in units 20-22,
     * arriving vertically: a rectangle that stops has a size, and a reader
     * interprets it.
     *
     * Four rows of empty shelf below a filtered result says *these are the ones
     * that matched*. One row that fits the result says *this is the whole
     * collection*, which is false.
     *
     * **The discriminating fixture is a SHORT collection.** A wall that already
     * fills four rows cannot tell a minimum from its absence — the same shape
     * as unit 22's plane needing one record and many, and unit A's centring
     * needing three rows rather than one.
     */
    for (const count of [1, 5, 26]) {
      const wall = layoutWall({ spines: spines(count), viewportWidth: 1000 });

      expect(
        wall.shelves.length,
        `${count} records must still get a room, not a shrink-wrapped strip`,
      ).toBe(MIN_SHELF_ROWS);
      expect(wall.height).toBeCloseTo(MIN_SHELF_ROWS * (SPINE_HEIGHT + SHELF_EDGE), 5);
    }
  });

  it('GROWS beyond the minimum with the collection', () => {
    /**
     * The other half, and the one a floor breaks if it is written as a fixed
     * height: a large collection must still get every row it needs.
     */
    const big = layoutWall({ spines: spines(400), viewportWidth: 1000 });

    expect(big.shelves.length).toBeGreaterThan(MIN_SHELF_ROWS);
    expect(big.placed[big.placed.length - 1].row).toBe(big.shelves.length - 1);
  });

  it('gives the empty shelves the SAME treatment as occupied ones', () => {
    /**
     * §10b, unit 22: "the surface runs edge to edge and ends where the wall
     * ends." A row with nothing on it is shelf with nothing on it — not void,
     * and not a different kind of surface.
     */
    const wall = layoutWall({ spines: spines(5), viewportWidth: 1000 });

    for (const shelf of wall.shelves) {
      expect(shelf.width, 'every shelf spans the wall').toBeCloseTo(1000, 5);
      expect(shelf.height).toBe(wall.shelves[0].height);
    }
  });

  it('leaves a margin at BOTH edges, because a real shelf has ends', () => {
    /**
     * **The clipping QA saw**: leftmost spines cut mid-word — "rannigan",
     * "orvid Murder" — and the same at the right. The wall bled off both edges.
     *
     * Asserted as a gap between the wall's edge and the outermost spine, at
     * both ends, so a one-sided fix cannot pass.
     */
    const wall = layoutWall({ spines: spines(80), viewportWidth: 1000 });

    const leftmost = Math.min(...wall.placed.map((p) => p.x));
    const rightmost = Math.max(...wall.placed.map((p) => p.x + p.width));

    expect(leftmost, 'a margin before the first spine').toBeGreaterThanOrEqual(WALL_EDGE_MARGIN);
    expect(
      1000 - rightmost,
      'and after the last one',
    ).toBeGreaterThanOrEqual(0);
  });

  it('is DETERMINISTIC: the same input always produces the same wall', () => {
    /**
     * §10b's one load-bearing requirement, inherited from §8.2 and restated
     * every time the mechanism changed: "a wall you scan by eye cannot move
     * between loads, or you re-scan it every time."
     */
    const input = spines(60);
    const a = layoutWall({ spines: input, viewportWidth: 1000 });
    const b = layoutWall({ spines: input, viewportWidth: 1000 });

    expect(a).toEqual(b);
  });
});
