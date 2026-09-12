import { describe, expect, it } from 'vitest';
import {
  DEPTH,
  SHELF_GAP,
  SPINE_HEIGHT,
  SPINE_WIDTH_MAX,
  SPINE_WIDTH_MIN,
  shelfPolygon,
  spinePolygon,
  spineWidth,
} from './geometry';
import { shelfRuns, type ShelfSeat } from './shelf-runs';

/**
 * The geometry both wall components share (The Wall 5b §1).
 *
 * **This layer exists so the labelled component inherits its decisions rather
 * than re-making them.** A projection settled inside the overview's renderer is
 * one the 1:1 component cannot reuse, and two renderers that each decide a
 * spine's width produce a record that changes thickness when labels appear.
 */

describe('the wall proportions derive rather than being asserted', () => {
  /**
   * **240 is the wall's constant and the derivation is the point.** The design
   * file drew at 120 for convenience, adopted it as a constant, reasoned from
   * it, and produced its one wrong conclusion — that the wall carries no
   * labels. Deriving the bounds from SPINE_HEIGHT keeps them honest if it ever
   * changes; hardcoding 17 and 24 would not.
   */
  it('derives the width bounds from the spine height', () => {
    expect(SPINE_HEIGHT).toBe(240);
    expect(SPINE_WIDTH_MIN).toBe(Math.round(SPINE_HEIGHT / 14));
    expect(SPINE_WIDTH_MAX).toBe(Math.round(SPINE_HEIGHT / 10));
    expect(SPINE_WIDTH_MIN).toBe(17);
    expect(SPINE_WIDTH_MAX).toBe(24);
  });

  it('keeps every spine inside the real bounds', () => {
    for (let index = 0; index < 200; index += 1) {
      const width = spineWidth(`record-${index}`);
      expect(width, `record-${index}`).toBeGreaterThanOrEqual(SPINE_WIDTH_MIN);
      expect(width, `record-${index}`).toBeLessThanOrEqual(SPINE_WIDTH_MAX);
    }
  });

  /**
   * **Same record, same width, every call.** Both components ask independently,
   * and a record that is 19px in the overview and 21px at 1:1 is a record that
   * changes thickness when labels appear.
   */
  it('gives one record one width, stably', () => {
    expect(spineWidth('abc')).toBe(spineWidth('abc'));
    expect(spineWidth('abc')).not.toBe(spineWidth('xyz'));
  });
});

describe('the isometric projection', () => {
  /**
   * The shear IS the projection: the top edge rises to the right by
   * `width * tan(30°)`. The 1:1 component's pull resolves this to zero, so it
   * has to start from the same value this produces.
   */
  it('lifts the left edge by the isometric rise', () => {
    const points = spinePolygon(100, 50, 20);
    const [topLeft, topRight] = points;

    expect(topRight[0] - topLeft[0], 'the spine is `width` across').toBeCloseTo(20, 5);
    expect(topLeft[1] - topRight[1], 'the left edge sits lower by the rise').toBeCloseTo(
      20 * Math.tan(Math.PI / 6),
      5,
    );
  });

  it('keeps the two vertical edges parallel and SPINE_HEIGHT long', () => {
    const [topLeft, topRight, bottomRight, bottomLeft] = spinePolygon(0, 0, 22);

    expect(bottomLeft[1] - topLeft[1]).toBeCloseTo(SPINE_HEIGHT, 5);
    expect(bottomRight[1] - topRight[1]).toBeCloseTo(SPINE_HEIGHT, 5);
  });

  it('translates without reshaping', () => {
    const at0 = spinePolygon(0, 0, 19);
    const at100 = spinePolygon(100, 40, 19);

    for (const [index, point] of at100.entries()) {
      expect(point[0] - at0[index][0]).toBeCloseTo(100, 5);
      expect(point[1] - at0[index][1]).toBeCloseTo(40, 5);
    }
  });
});

/**
 * **§2's distinction, asserted at the layer that draws it.**
 *
 * > "Between groups, the outline stops and restarts — there is no shelf there.
 * > Within group 3, the outline runs unbroken under an empty slot — the shelf
 * > is still there and the record is not on it. Same mark, different owner."
 *
 * `shelfRuns` holds the invariant on run COUNTS. This is the same invariant one
 * layer out, on polygons — and this is the layer that actually draws the lie,
 * so a pull-into-break must fail here too rather than only upstream.
 */
describe('the shelf outline tells the truth about groups', () => {
  const SHELF: ShelfSeat[] = [
    { id: 'a1', section: 'Jazz' },
    { id: 'b1', section: 'Punk' },
    { id: 'a2', section: 'Jazz' },
    { id: 'b2', section: 'Punk' },
    { id: 'a3', section: 'Jazz' },
    { id: 'b3', section: 'Punk' },
  ];

  /** Runs laid end to end, as a shelf lays them. */
  const layOut = (pulled: string | null) => {
    let x = 0;
    return shelfRuns(SHELF, pulled).map((run) => {
      const polygon = shelfPolygon(run, x, 0);
      x += run.seatCount * SPINE_WIDTH_MAX;
      return polygon;
    });
  };

  it('draws one polygon per run', () => {
    const polygons = layOut(null);

    expect(polygons).toHaveLength(2);
    for (const polygon of polygons) {
      expect(polygon, 'a shelf outline is a quadrilateral').toHaveLength(4);
    }
  });

  /**
   * **THE assertion this layer exists for.** A record pulled from the middle of
   * a run leaves the shelf unbroken beneath it: ONE polygon, not two. Two would
   * be the wall saying a group ended where none did.
   */
  it('draws ONE polygon for a run with a seat emptied', () => {
    const seated = layOut(null);
    const pulled = layOut('a2');

    expect(pulled, 'a pull must not add an outline').toHaveLength(seated.length);
  });

  it('draws TWO polygons when a section boundary genuinely separates them', () => {
    // The other absence: different groups, so the outline stops and restarts.
    const polygons = layOut(null);

    expect(polygons).toHaveLength(2);
    expect(polygons[0], 'runs at different positions are different polygons').not.toEqual(
      polygons[1],
    );
  });

  it('never draws a shorter outline for a pulled run than for the seated one', () => {
    /*
      The shelf is still there and the record is not on it — so the outline
      under a pulled record keeps its extent. A shorter polygon is the same lie
      as a split one, drawn as a gap at the end instead of the middle.
    */
    const [seatedJazz] = layOut(null);
    const [pulledJazz] = layOut('a2');

    const width = (polygon: ReadonlyArray<readonly [number, number]>) =>
      Math.max(...polygon.map(([x]) => x)) - Math.min(...polygon.map(([x]) => x));

    expect(width(pulledJazz)).toBeCloseTo(width(seatedJazz), 5);
  });
});

describe('the shelf meets the spines standing on it', () => {
  /**
   * **Caught by looking, not by measuring.** The first rendering at true size
   * showed the outlines floating below the spines and sagging away from them —
   * and every existing test passed, because they all asked about run COUNTS and
   * never about whether the shelf touches the records.
   *
   * That is the fixture-adequacy failure in a new place: the assertions were
   * about the right invariant and no assertion described the surface itself.
   */
  const run = shelfRuns(
    Array.from({ length: 3 }, (_, index) => ({ id: `r${index}`, section: 'A' })),
    null,
  )[0];

  it('starts where the spines end, including the isometric lift', () => {
    const spine = spinePolygon(0, 0, SPINE_WIDTH_MAX);
    const shelf = shelfPolygon(run, 0, 0);

    /* The spine's lower-RIGHT corner is the shelf's upper-right corner. */
    const spineFootRight = spine[2];
    const shelfTopRight = shelf[1];

    expect(shelfTopRight[1], 'the shelf top meets the spine foot').toBeCloseTo(
      spineFootRight[1],
      5,
    );
  });

  it('rises at the projection rate, not in proportion to its length', () => {
    /*
      The defect the drawing showed: rise was computed from the run's whole
      span, so a forty-seat shelf sagged forty times as far as a one-seat one.
      The shelf's rise is a property of its DEPTH under the projection.
    */
    const short = shelfPolygon(run, 0, 0);
    const longRun = shelfRuns(
      Array.from({ length: 30 }, (_, index) => ({ id: `x${index}`, section: 'A' })),
      null,
    )[0];
    const long = shelfPolygon(longRun, 0, 0);

    const rise = (polygon: ReadonlyArray<readonly [number, number]>) =>
      polygon[0][1] - polygon[1][1];

    expect(rise(long), 'a longer shelf does not sag further').toBeCloseTo(rise(short), 5);
  });
});

describe('the shelf gap is provisional', () => {
  /**
   * **Authored, not measured — and pinned here so it cannot become settled by
   * being used.** See the comment on SHELF_GAP: it was written rather than read
   * off the scene, then doubled with everything else during the 120→240
   * rescale, which transformed an assumption instead of re-deriving it.
   */
  it('is the value the density drawings were computed against', () => {
    expect(SHELF_GAP).toBe(48);
  });

  it('composes the shelf pitch the density work reported', () => {
    // 688 = 400 climb + 240 spine + 48 gap. Stated so a change to the gap moves
    // a number someone has to look at rather than silently re-rendering.
    expect(400 + SPINE_HEIGHT + SHELF_GAP).toBe(688);
  });
});

describe('depth', () => {
  it('is the drawing\'s 52, giving the 1:12 mean proportion', () => {
    expect(DEPTH).toBe(52);
    const meanWidth = (SPINE_WIDTH_MIN + SPINE_WIDTH_MAX) / 2;
    expect(SPINE_HEIGHT / meanWidth).toBeCloseTo(11.7, 1);
  });
});
