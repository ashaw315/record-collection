import { describe, expect, it } from 'vitest';
import {
  CARD_SHARE,
  WIDTH_CANDIDATES,
  distanceFillHeight,
  distanceFillSmaller,
  distanceForStackedCard,
  occupancy,
  recordSizeFor,
} from './fill-candidates';
import { viewportAspect } from './wall-camera';

/**
 * The three fill rules, constrained where arithmetic CAN decide.
 *
 * §10b's actual standard — "it was on the shelf a moment ago and now it is in
 * your hands" — is visual, and the comparison page is what answers it. These
 * tests pin the properties a candidate must have to be worth looking at, so a
 * candidate that overflows the frame never reaches the developer's eye.
 */

const PHONE = viewportAspect({ width: 390, height: 844 });
const DESKTOP = viewportAspect({ width: 1280, height: 900 });

/**
 * **The size rule: frame in, record dimensions out.**
 *
 * The block that stood here tested the three RESERVATION candidates — how much
 * of the frame to hold back for facts. That question was dissolved rather than
 * answered: a summary card's height is a constant, so the reservation is known
 * and the remaining question is how wide the record should be. Those tests are
 * gone rather than adjusted, because a test kept past the question it asks
 * starts passing for a reason nobody chose.
 */
describe('recordSizeFor', () => {
  const PHONE_FRAME = { width: 390, height: 844 };
  const CARD = 0.22;

  it('takes the requested fraction of the width when height allows', () => {
    const { size, limitedBy } = recordSizeFor({
      frame: PHONE_FRAME,
      widthFraction: 0.9,
      cardFraction: CARD,
    });

    expect(size).toBeCloseTo(351, 0);
    expect(limitedBy).toBe('width');
  });

  /**
   * **A squat frame is where the width rule alone goes wrong**, and it is the
   * case a portrait phone never exercises — a landscape phone or a short
   * desktop window has less height than width, so 90% of the width would push
   * the record through the card.
   *
   * Fails against a `recordSizeFor` returning `frame.width * widthFraction`
   * unconditionally, which is the obvious implementation and the one that
   * reintroduces the overflow this whole unit started from, on a different
   * axis.
   */
  it('clamps to the height when the frame is squat, leaving the card its room', () => {
    const landscape = { width: 844, height: 390 };
    const { size, limitedBy } = recordSizeFor({
      frame: landscape,
      widthFraction: 0.9,
      cardFraction: CARD,
    });

    expect(limitedBy, 'the height is what binds here').toBe('height');
    expect(size).toBeCloseTo(390 * (1 - CARD), 0);
    expect(size, 'and it never exceeds what the card leaves').toBeLessThanOrEqual(
      390 * (1 - CARD) + 0.001,
    );
  });

  it('never returns a record taller than the room left by the card', () => {
    for (const frame of [PHONE_FRAME, { width: 1280, height: 900 }, { width: 844, height: 390 }]) {
      for (const widthFraction of [0.9, 0.95, 1]) {
        const { size } = recordSizeFor({ frame, widthFraction, cardFraction: CARD });
        expect(
          size,
          `${frame.width}x${frame.height} @ ${widthFraction}: fits the card's room`,
        ).toBeLessThanOrEqual(frame.height * (1 - CARD) + 0.001);
        expect(size, `${frame.width}x${frame.height} @ ${widthFraction}: fits the width`).toBeLessThanOrEqual(
          frame.width + 0.001,
        );
      }
    }
  });

  it('offers three widths spanning the object/full-bleed boundary', () => {
    expect(WIDTH_CANDIDATES.map((c) => c.widthFraction)).toEqual([0.9, 0.95, 1]);
  });
});

describe('B is a no-op on a landscape aperture', () => {
  /**
   * **The blast-radius claim, asserted rather than argued.** On a desktop the
   * smaller frame dimension IS the height, so B reduces to A exactly — which is
   * what makes B safe to adopt without re-judging the desktop wall.
   *
   * Fails against any `distanceFillSmaller` that scales by the aspect
   * unconditionally rather than by `min(1, aspect)`.
   */
  it('matches A exactly when the frame is wider than tall', () => {
    expect(distanceFillSmaller(DESKTOP)).toBeCloseTo(distanceFillHeight(), 9);
  });

  it('differs from A when the frame is taller than wide', () => {
    /*
      The inverse, or the test above is vacuous: a `distanceFillSmaller` that
      ignored its argument entirely would satisfy it.
    */
    expect(distanceFillSmaller(PHONE)).toBeGreaterThan(distanceFillHeight());
  });
});

describe('C serves the card, which is the constraint the number exists for', () => {
  /**
   * §10b puts every fact in the panel because the faces carry artwork only, and
   * on a phone the panel stacks beneath the record. So the record must leave
   * `CARD_SHARE` of the frame's height free.
   *
   * Fails against a `distanceForStackedCard` that ignores `CARD_SHARE`.
   */
  it('leaves the card its share of the frame height on a phone', () => {
    const { height } = occupancy(distanceForStackedCard(PHONE), PHONE);
    expect(height, 'record takes no more than its share').toBeLessThanOrEqual(1 - CARD_SHARE + 0.001);
  });

  it('leaves the card its share on a desktop too', () => {
    const { height } = occupancy(distanceForStackedCard(DESKTOP), DESKTOP);
    expect(height).toBeLessThanOrEqual(1 - CARD_SHARE + 0.001);
  });

  /**
   * **`CARD_SHARE` is the quantity that decides, not merely a quantity
   * present.** Caught by mutation: replacing `CARD_SHARE` with `FRAME_FILL`
   * left all eleven tests green, because on a phone the WIDTH constraint
   * dominates (byWidth 2149 vs byHeight 1294) and the desktop assertion had
   * enough slack to accept 55% as well as 66%.
   *
   * A test that passes whatever the constant says is decorative. This one
   * asserts the height EXACTLY where `CARD_SHARE` binds, so changing it moves
   * this number.
   */
  it('sizes the record to exactly its share where the height constraint binds', () => {
    const { height } = occupancy(distanceForStackedCard(DESKTOP), DESKTOP);
    expect(height, 'the record takes precisely what CARD_SHARE leaves').toBeCloseTo(
      1 - CARD_SHARE,
      6,
    );
  });

  it('is bigger than B on a phone, which is the reason it exists', () => {
    /*
      B's cost is that the record gets small — 25% of the frame's height, most
      of the frame empty. C trades some of that back. If this ever inverts, C
      has stopped being a distinct option and the comparison is down to two.
    */
    const c = occupancy(distanceForStackedCard(PHONE), PHONE);
    const b = occupancy(distanceFillSmaller(PHONE), PHONE);
    expect(c.height).toBeGreaterThan(b.height);
  });
});
