import { describe, expect, it } from 'vitest';
import { layoutRow, project } from './geometry';
import { OUT_MS, RETURN_MS, ROTATION_START, SWING_MS, easeInOutCubic, gestureFaces, poseAt } from './gesture';
import { ARROW_LANE, LANDING_PAD } from './landing';
import { frameView, landedExtent, panFraction, panView } from './pan';

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

describe('landedExtent — the frame the landing needs: the cover with its arrows and the page’s padding', () => {
  it('is the landed cover’s extent, padded by the arrow lanes across and the page’s padding down', () => {
    const cover = gestureFaces(seat, poseAt(OUT_MS)).cover;
    const xs = cover.map(([x]) => x);
    const ys = cover.map(([, y]) => y);
    expect(landedExtent(seat)).toEqual({
      minX: Math.min(...xs) - LANDING_PAD - ARROW_LANE,
      maxX: Math.max(...xs) + LANDING_PAD + ARROW_LANE,
      minY: Math.min(...ys) - LANDING_PAD,
      maxY: Math.max(...ys) + LANDING_PAD,
    });
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
