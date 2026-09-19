import { describe, expect, it } from 'vitest';
import { layoutRow, project } from './geometry';
import { OUT_MS, RETURN_MS, ROTATION_START, SWING_MS, easeInOutCubic, gestureFaces, poseAt } from './gesture';
import { ARROW_LANE, LANDING_PAD } from './landing';
import { SEAT_CLEARANCE, clearanceShift, frameView, landedExtent, panFraction, panView, recordOffset } from './pan';
import { SPINE_WIDTH_MAX, frontFace } from './geometry';

/**
 * §11.22: the view pans; the gesture does not move. The record's transforms
 * stay exactly as §11.21 rules them, and the drawing region pans so that the
 * landing is in frame — on the swing's own ease and one clock, resolving to
 * zero when the landing is already in frame. A drift converted between the
 * wall's coordinates and the page's by moving the object, and negated
 * §11.21's shared fixed point; a pan converts by moving the viewport, which
 * the wall already does (§11.6).
 */
const seat = layoutRow([{ id: 'p', section: 'S' }], 0)[0];

/*
 * §11.26: the pan gains a target. 290 units of travel and 560px of cover are
 * each right in their own space and collide in the frame — the landed cover
 * covers its own empty seat, which §11.10 makes the mark of which record is
 * out and §11.22 the separation that replaces a scrim. Neither the travel
 * nor the cover moves; the pan settles where the empty seat clears the
 * cover's trailing edge, by §11.19's 55px. Mechanically the record carries a
 * horizontal offset from its gesture position that the pan pays for: the
 * view moves by the same amount, so the record's screen path is exactly the
 * gesture's and the wall slides under it.
 */
describe('clearanceShift — where the empty seat clears the cover’s trailing edge (§11.26)', () => {
  it('is the horizontal shift, to the left, that puts the seat’s near edge 55px past the landed cover’s right edge — and zero if it already is', () => {
    expect(SEAT_CLEARANCE).toBe(55);
    const cover = gestureFaces(seat, poseAt(OUT_MS)).cover;
    const coverRight = Math.max(...cover.map(([x]) => x));
    const seatLeft = Math.min(...frontFace(seat).map(([x]) => x));
    /* The seat sits 251 right of the foot and the cover reaches 560: inside it by about 309, so the shift is about −364. */
    expect(seatLeft).toBeLessThan(coverRight);
    /* One number for every seat — measured at the widest spine, so a narrower seat clears by more and a neighbour's framing differs by exactly the pitch. */
    const widest = { ...seat, width: SPINE_WIDTH_MAX };
    const widestCover = gestureFaces(widest, poseAt(OUT_MS)).cover;
    expect(clearanceShift(seat)).toBeCloseTo(Math.min(...frontFace(widest).map(([x]) => x)) - SEAT_CLEARANCE - Math.max(...widestCover.map(([x]) => x)), 9);
    expect(clearanceShift({ ...seat, width: 8 })).toBe(clearanceShift({ ...seat, width: 17 }));
    expect(clearanceShift(seat)).toBeLessThan(-300);
    expect(clearanceShift(seat)).toBeGreaterThan(-400);
    /* And this seat, at its own width, clears by at least 55. */
    expect(seatLeft - (coverRight + clearanceShift(seat))).toBeGreaterThanOrEqual(SEAT_CLEARANCE - 1e-9);
  });

  it('rides the pan’s own ease: the record’s offset is zero at rest, the shift at the swing’s end, and it unwinds on the return', () => {
    const shift = clearanceShift(seat);
    expect(recordOffset(seat, { id: 'p', direction: 'out', ms: 0 })).toEqual([0, 0]);
    expect(recordOffset(seat, { id: 'p', direction: 'out', ms: 546 })[0]).toBeCloseTo(shift * easeInOutCubic(ROTATION_START), 9);
    expect(recordOffset(seat, { id: 'p', direction: 'out', ms: SWING_MS })).toEqual([shift, 0]);
    expect(recordOffset(seat, { id: 'p', direction: 'out', ms: OUT_MS })).toEqual([shift, 0]);
    expect(recordOffset(seat, { id: 'p', direction: 'back', ms: 0 })).toEqual([shift, 0]);
    expect(recordOffset(seat, { id: 'p', direction: 'back', ms: RETURN_MS })[0]).toBeCloseTo(0, 9);
    /* One ease with the view: the offset's fraction IS the pan's fraction at every state. */
    for (const ms of [200, 546, 900, 1300]) expect(recordOffset(seat, { id: 'p', direction: 'out', ms })[0] / shift).toBeCloseTo(panFraction({ id: 'p', direction: 'out', ms }), 12);
  });
});

describe('landedExtent — the frame the landing needs: the cover with its arrows and the page’s padding', () => {
  it('is the landed cover’s extent — shifted by the clearance (§11.26) — padded by the arrow lanes across and the page’s padding down', () => {
    const cover = gestureFaces(seat, poseAt(OUT_MS)).cover;
    const xs = cover.map(([x]) => x + clearanceShift(seat));
    const ys = cover.map(([, y]) => y);
    expect(landedExtent(seat)).toEqual({
      minX: Math.min(...xs) - LANDING_PAD - ARROW_LANE,
      maxX: Math.max(...xs) + LANDING_PAD + ARROW_LANE,
      minY: Math.min(...ys) - LANDING_PAD,
      maxY: Math.max(...ys) + LANDING_PAD,
    });
    /* Framed canonically, the seat is on screen at least 55px clear of the cover: the view's left plus the lane and pad, the cover, the clearance. */
    const [vx] = frameView(landedExtent(seat), { width: 900, height: 700 });
    const seatLeft = Math.min(...frontFace(seat).map(([x]) => x));
    const coverRightOnScreen = Math.max(...xs) - vx;
    expect(seatLeft - vx - coverRightOnScreen).toBeGreaterThanOrEqual(SEAT_CLEARANCE - 1e-9);
    /* And it is where the gesture puts it: left of the seat and below, +y projecting down-left. */
    const [sx] = project(seat.x, seat.y, seat.z);
    expect(landedExtent(seat).minX).toBeLessThan(sx);
  });
});

describe('frameView — the view that frames a landing the same way every time', () => {
  const size = { width: 800, height: 700 };

  it('puts the landing’s extent at the view’s left and centres it vertically', () => {
    expect(frameView({ minX: -350, maxX: 200, minY: -600, maxY: -300 }, size)).toEqual([-350, -800]);
    expect(frameView({ minX: 100, maxX: 500, minY: -1000, maxY: -700 }, size)).toEqual([100, -1200]);
  });

  it('differs by exactly the seat pitch for the next seat along, which is what lands a neighbour in the same screen position', () => {
    const [a, b] = layoutRow([{ id: 'a', section: 'S' }, { id: 'b', section: 'S' }], 0);
    const va = frameView(landedExtent(a), size);
    const vb = frameView(landedExtent(b), size);
    const [dx, dy] = project(b.x + b.width, 0, 0).map((v, i) => v - project(a.x + a.width, 0, 0)[i]);
    expect(vb[0] - va[0]).toBeCloseTo(dx, 9);
    expect(vb[1] - va[1]).toBeCloseTo(dy, 9);
  });
});

describe('panView — the view rides the swing’s ease out, and retraces to the pre-gesture view on the return', () => {
  const pan = { forId: 'p', from: [0, -800] as [number, number], to: [-250, -680] as [number, number], at0: 1 };

  it('is the start at 0, the landing’s framing from the swing’s end through the finish, e(k) between', () => {
    expect(panView(pan, { id: 'p', direction: 'out', ms: 0 })).toEqual([0, -800]);
    const join = panView(pan, { id: 'p', direction: 'out', ms: ROTATION_START * SWING_MS });
    expect(join[0]).toBeCloseTo(-250 * easeInOutCubic(ROTATION_START), 9);
    expect(join[1]).toBeCloseTo(-800 + 120 * easeInOutCubic(ROTATION_START), 9);
    expect(panView(pan, { id: 'p', direction: 'out', ms: SWING_MS })).toEqual([-250, -680]);
    expect(panView(pan, { id: 'p', direction: 'out', ms: OUT_MS })).toEqual([-250, -680]);
  });

  it('on the return runs from the landing’s framing back to where the gesture began, arriving exactly', () => {
    const back = { forId: 'p', from: [-250, -680] as [number, number], to: [0, -800] as [number, number], at0: 1 };
    expect(panView(back, { id: 'p', direction: 'back', ms: 0 })).toEqual([-250, -680]);
    const half = panView(back, { id: 'p', direction: 'back', ms: RETURN_MS * 0.5 });
    expect(half[0]).toBeCloseTo(-250 + 250 * (1 - panFraction({ id: 'p', direction: 'back', ms: RETURN_MS * 0.5 })), 6);
    expect(panView(back, { id: 'p', direction: 'back', ms: RETURN_MS })).toEqual([0, -800]);
  });

  it('a return begun mid-swing is continuous: scaled from where it began', () => {
    const state = { id: 'p', direction: 'back' as const, ms: RETURN_MS * (1 - 400 / OUT_MS) };
    const at0 = panFraction(state);
    const back = { forId: 'p', from: [-100, -750] as [number, number], to: [0, -800] as [number, number], at0 };
    expect(panView(back, state)).toEqual([-100, -750]);
    expect(panView(back, { ...state, ms: RETURN_MS })).toEqual([0, -800]);
  });
});
