import { describe, expect, it } from 'vitest';
import { layoutRow, project } from './geometry';
import { OUT_MS, PAN_MS, RETURN_MS, ROTATION_START, SWING_MS, easeInOutCubic, gestureFaces, outTime, poseAt, settled } from './gesture';
import { ARROW_LANE, LANDING_PAD } from './landing';
import { SEAT_CLEARANCE, clearanceShift, frameView, landedExtent, panFraction, panView, recordOffset } from './pan';
import { SPINE_WIDTH_MAX, frontFace } from './geometry';

/**
 * §W.22: the view pans; the gesture does not move. The record's transforms
 * stay exactly as §W.21 rules them, and the drawing region pans so that the
 * landing is in frame — on the swing's own ease and one clock, resolving to
 * zero when the landing is already in frame. A drift converted between the
 * wall's coordinates and the page's by moving the object, and negated
 * §W.21's shared fixed point; a pan converts by moving the viewport, which
 * the wall already does (§W.6).
 */
const seat = layoutRow([{ id: 'p', section: 'S' }], 0)[0];

/*
 * §W.26: the pan gains a target. 290 units of travel and 560px of cover are
 * each right in their own space and collide in the frame — the landed cover
 * covers its own empty seat, which §W.10 makes the mark of which record is
 * out and §W.22 the separation that replaces a scrim. Neither the travel
 * nor the cover moves; the pan settles where the empty seat clears the
 * cover's trailing edge, by §W.19's 55px. Mechanically the record carries a
 * horizontal offset from its gesture position that the pan pays for: the
 * view moves by the same amount, so the record's screen path is exactly the
 * gesture's and the wall slides under it.
 */
describe('clearanceShift — where the empty seat clears the cover’s trailing edge (§W.26)', () => {
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
  it('is the landed cover’s extent — shifted by the clearance (§W.26) — padded by the arrow lanes across and the page’s padding down', () => {
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

/*
  §W.22: pan, then pull (W.22/pan-one-clock). From the top shelf the two ran on one clock and
  compounded: on production the record fell 251px under a 277px pan. Apart, the view moves while
  the record holds its first pose, and the pull runs unchanged once the view has come to rest.
*/
describe('panView, the pan before the pull', () => {
  const pan = { forId: 'p', from: [0, -800] as [number, number], to: [-600, -500] as [number, number], at0: 1, apart: true };

  /* Fails against the one clock: the view must be at rest when the pull's own time is 0. */
  it('has finished when the pull begins, and stays there through it', () => {
    expect(panView(pan, { id: 'p', direction: 'out', ms: -PAN_MS })).toEqual([0, -800]);
    expect(panView(pan, { id: 'p', direction: 'out', ms: 0 })).toEqual([-600, -500]);
    expect(panView(pan, { id: 'p', direction: 'out', ms: 700 })).toEqual([-600, -500]);
    expect(panView(pan, { id: 'p', direction: 'out', ms: OUT_MS })).toEqual([-600, -500]);
  });

  /* Fails against the swing's ease, whose S starts slowly: §W.22 rules a curve that arrives at rest, so the pan is over most of its way by halfway. */
  it('arrives at rest, decelerating', () => {
    const half = panView(pan, { id: 'p', direction: 'out', ms: -PAN_MS / 2 });
    expect((half[0] - 0) / -600).toBeCloseTo(0.875, 5);
    const a = panView(pan, { id: 'p', direction: 'out', ms: -PAN_MS * 0.1 })[0];
    const b = panView(pan, { id: 'p', direction: 'out', ms: 0 })[0];
    expect(Math.abs(b - a)).toBeLessThan(2);
  });

  /* Fails against a return that pans while the record seats: §W.22, a put back seats the record and then pans back. */
  it('a put back holds the view until the record has seated, then pans', () => {
    const back = { forId: 'back:p', from: [-600, -500] as [number, number], to: [0, -800] as [number, number], at0: 1, apart: true };
    expect(panView(back, { id: 'p', direction: 'back', ms: 0, trail: PAN_MS })).toEqual([-600, -500]);
    expect(panView(back, { id: 'p', direction: 'back', ms: RETURN_MS, trail: PAN_MS })).toEqual([-600, -500]);
    expect(panView(back, { id: 'p', direction: 'back', ms: RETURN_MS + PAN_MS, trail: PAN_MS })).toEqual([0, -800]);
  });

  /* Fails against a re-roll that pans back and out again: one pan, from the first framing to the second's, belongs to the next pull. */
  it('a re-roll\'s put back does not pan, and the pull after it pans once', () => {
    const back = { forId: 'back:p', from: [-600, -500] as [number, number], to: [0, -800] as [number, number], at0: 1, apart: true };
    expect(panView(back, { id: 'p', direction: 'back', ms: RETURN_MS })).toEqual([-600, -500]);
    expect(settled({ id: 'p', direction: 'back', ms: RETURN_MS })).toBe(true);
  });
});

describe('the record under the pan', () => {
  /* Fails against a record that moves while the view does: the join has no hold, and the pull is unchanged. */
  it('holds its first pose through the pan, and the gesture\'s times do not move', () => {
    const lead = { id: 'p', direction: 'out' as const, ms: -PAN_MS / 2 };
    expect(outTime(lead)).toBe(0);
    expect(recordOffset(seat, lead)).toEqual([0, 0]);
    expect(settled(lead)).toBe(false);
    expect(settled({ id: 'p', direction: 'out', ms: OUT_MS })).toBe(true);
  });

  /* Fails against a put back that lets go of the record's clock early, which would cut the pan back off. */
  it('a put back with a trail is not settled until the pan back has run', () => {
    expect(settled({ id: 'p', direction: 'back', ms: RETURN_MS, trail: PAN_MS })).toBe(false);
    expect(settled({ id: 'p', direction: 'back', ms: RETURN_MS + PAN_MS, trail: PAN_MS })).toBe(true);
  });

  /* Fails against a figure drifting unseen: the duration is Adam's judgement, and total time is the trade. */
  it('makes a pull 1850ms and a re-roll 2712ms', () => {
    expect(PAN_MS).toBe(250);
    expect(PAN_MS + OUT_MS).toBe(1850);
    expect(Math.round(RETURN_MS + PAN_MS + OUT_MS)).toBe(2712);
  });
});
