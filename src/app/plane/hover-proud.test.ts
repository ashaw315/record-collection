import { describe, expect, it } from 'vitest';
import { PROUD_DEPTH, proudOffset, shouldRedraw } from './hover-proud';

/**
 * How proud a spine sits when the pointer is over it.
 *
 * §10b's hover, closest to the reference: hovering pushes a record proud of the
 * wall, the way you push one out with a finger to read it before deciding. The
 * thing that pops is the thing that will come out, so the click is legible in
 * advance.
 *
 * **The pure part is the DECISION, not the animation** — given which spine is
 * hovered, what offset does each spine have. That is arithmetic and is tested
 * directly; the easing over time is the render loop's business.
 *
 * **One owner.** A single hovered id, with every spine's offset derived from
 * it, rather than per-spine state that can disagree. Crossing the wall quickly
 * touches forty spines, and per-spine state is the shape that has failed here
 * every time it has been built.
 */

describe('proudOffset', () => {
  it('pushes the hovered spine forward and nothing else', () => {
    /**
     * The whole behaviour in one assertion. Fails against any implementation
     * that moves neighbours too — which is a plausible "nice" variation and is
     * not what a shelf does.
     */
    expect(proudOffset({ id: 'a', hoveredId: 'a' })).toBeCloseTo(PROUD_DEPTH, 5);
    expect(proudOffset({ id: 'b', hoveredId: 'a' })).toBe(0);
  });

  it('returns every spine to the wall when nothing is hovered', () => {
    expect(proudOffset({ id: 'a', hoveredId: null })).toBe(0);
  });

  it('has exactly ONE spine proud at a time, however many are asked', () => {
    /**
     * **The discriminating property for "one owner".** Crossing the wall fast
     * touches forty spines; if each carried its own state, several could be
     * proud at once or one could stick. Deriving every offset from a single
     * hovered id makes that unrepresentable rather than merely unlikely.
     *
     * Swept across a whole row rather than checked on two spines, because "only
     * one" is a property of the SET and a two-spine check cannot see it.
     */
    const ids = Array.from({ length: 40 }, (_, i) => `r${i}`);

    for (const hoveredId of [null, 'r0', 'r17', 'r39']) {
      const proud = ids.filter((id) => proudOffset({ id, hoveredId }) > 0);
      expect(proud.length, `hovering ${hoveredId ?? 'nothing'}`).toBe(hoveredId === null ? 0 : 1);
    }
  });

  it('comes proud by less than a record comes OUT', () => {
    /**
     * "Proud, not pulled." Enough to read as the object responding, not enough
     * to look like the rise has started — the two motions must not be
     * confusable, or hover reads as a half-finished click.
     */
    expect(PROUD_DEPTH).toBeGreaterThan(0);
    expect(PROUD_DEPTH, 'a nudge, not a pull').toBeLessThan(60);
  });
});

describe('shouldRedraw', () => {
  /**
   * **The discipline that keeps hover free.** The current wall costs ZERO draws
   * across 60 fast pointer moves, because there is no hover handler at all. A
   * naive implementation raycasts and renders on every `pointermove` across 125
   * spines.
   *
   * Raycast on move — that is cheap and unavoidable — but mark the scene dirty
   * only when the hovered spine CHANGES. The eased motion then runs on its own
   * and settles to zero, which is the dirty-flag reasoning recorded before any
   * three.js work began.
   */
  it('does not redraw while the pointer sits on the same spine', () => {
    /**
     * The half that matters. A pointer resting on a spine delivers move events
     * on any jitter, and redrawing for each is the cost this exists to avoid.
     */
    expect(shouldRedraw({ previous: 'a', next: 'a' })).toBe(false);
  });

  it('redraws when the pointer moves onto a different spine', () => {
    expect(shouldRedraw({ previous: 'a', next: 'b' })).toBe(true);
  });

  it('redraws when the pointer leaves the wall entirely', () => {
    /**
     * The case an "only when there is a new spine" check misses: leaving must
     * put the last spine back, and that is a change like any other.
     */
    expect(shouldRedraw({ previous: 'a', next: null })).toBe(true);
  });

  it('does not redraw while the pointer is over nothing', () => {
    /**
     * Moving across empty shelf — the space to the right of a partial last row,
     * or below the records on a short wall — is ordinary, and it must be as free
     * as resting on a spine.
     */
    expect(shouldRedraw({ previous: null, next: null })).toBe(false);
  });
});
