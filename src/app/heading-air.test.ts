import { describe, expect, it } from 'vitest';
import { AIR_MARGIN, headingAir } from './heading-air';

/**
 * §T.6: "The heading's figure takes the air right of the band at the
 * largest height that air holds, and is drawn only where that height is at
 * least the height at which its construction's narrowest face clears §29's
 * 6px." "The air is measured after a 24 margin on every side where it meets
 * anything drawn: a control, type, an image, a rule or the header."
 *
 * The figures are the table's on the real collection at 1440 and 768
 * (`docs/captures/air-103/air.md`): the header's foot at 53, the band's
 * column ending at 463, Add record at 1343 to 1420 and 147 to 171 down, the
 * table's first type at 553.
 */
const wide = { headerFoot: 53, columnRight: 463, add: { left: 1343, top: 147, right: 1420, bottom: 171 }, listTop: 553, edge: 1440 };
const narrow = { headerFoot: 53, columnRight: 463, add: { left: 671, top: 147, right: 748, bottom: 171 }, listTop: 553, edge: 768 };

describe('the air right of the band', () => {
  it('the margin is 24', () => {
    expect(AIR_MARGIN).toBe(24);
  });

  /* Fails against air taken without the margin (880 by 500), or to the window's edge under Add record. */
  it('at 1440 runs from 24 right of the column to 24 left of Add record, and from 24 under the header to 24 above the list', () => {
    expect(headingAir(wide, 1, 100)).toMatchObject({ left: 487, top: 77, width: 832, height: 452 });
  });

  /* Fails against the same rectangle at every width: beside Add record at 768 it would be 160 wide. */
  it('at 768 starts 24 under Add record and runs to the window’s edge, because that holds the taller figure', () => {
    expect(headingAir(narrow, 1, 100)).toMatchObject({ left: 487, top: 195, width: 281, height: 334 });
  });

  it('with no Add record, runs to the edge from under the header', () => {
    expect(headingAir({ ...wide, add: null }, 1, 100)).toMatchObject({ left: 487, top: 77, width: 953, height: 452 });
  });
});

describe('the figure in the air', () => {
  /* Fails against a figure given the air's height whatever its width: a wide figure in narrow air would leave it. */
  it('is as tall as the air where its width fits, and as tall as the width allows where it does not', () => {
    expect(headingAir(wide, 1.5, 100)?.figure).toBe(452);
    expect(headingAir(narrow, 1.5, 100)?.figure).toBeCloseTo(281 / 1.5, 6);
  });

  /* Fails against a figure drawn wherever there is air. */
  it('is not drawn where that height is under its clearing height, and is at exactly it', () => {
    expect(headingAir(wide, 1, 452)).not.toBeNull();
    expect(headingAir(wide, 1, 452.1)).toBeNull();
    expect(headingAir(narrow, 1.5, 281 / 1.5 + 0.1)).toBeNull();
  });

  /* A phone: the column is the window's width, so there is nothing right of it. */
  it('is not drawn where there is no air: the column reaches the window’s edge', () => {
    expect(headingAir({ headerFoot: 53, columnRight: 370, add: { left: 293, top: 147, right: 370, bottom: 171 }, listTop: 553, edge: 390 }, 1, 50)).toBeNull();
  });

  it('is not drawn where the list starts above the air’s top', () => {
    expect(headingAir({ ...wide, listTop: 90 }, 1, 10)).toBeNull();
  });
});
