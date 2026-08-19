import { describe, expect, it } from 'vitest';
import { layoutWall, type WallSpine } from './wall-layout';
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

    const firstRow = wall.placed.filter((p) => p.row === 0);
    expect(firstRow.length).toBe(42);
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
    expect(wall.placed[41].row).toBe(0);
    expect(wall.placed[42].row).toBe(1);
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

    expect(wall.shelves.length, 'one shelf per row, including the partial one').toBe(2);
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

    expect(wall.height).toBeCloseTo(2 * (SPINE_HEIGHT + SHELF_EDGE), 5);
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
