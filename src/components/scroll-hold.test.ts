import { describe, expect, it } from 'vitest';
import { holdScroll, type HoldRoot, type HoldWindow } from './scroll-hold';

/**
 * Step 86, §G.8: "Where holding the page removes a classic scrollbar, the
 * page's width is kept by the scrollbar's width, so the page does not shift
 * sideways when the menu opens."
 *
 * **This tests the computation and not the effect.** The harness produces no
 * classic scrollbar (two attempts: the page did not scroll, then a styled
 * 15px scrollbar measured 0), so no browser test can show the shift or its
 * absence. What is held here is the arithmetic and the restore, on stub
 * objects: the window's width against the root's is the scrollbar that was
 * actually there. Two things are outside it and expected, not shown: that
 * right padding on the root is the right place for every screen's layout,
 * and that the fixed panel spans the viewport whatever the root's padding.
 */

function stage(innerWidth: number, clientWidth: number, inline: { overflow?: string; paddingRight?: string } = {}) {
  const root: HoldRoot = { clientWidth, style: { overflow: inline.overflow ?? '', paddingRight: inline.paddingRight ?? '' } };
  const win: HoldWindow = {
    innerWidth,
    /* As a browser computes it: an inline padding is the computed one, and none is 0px. */
    getComputedStyle: () => ({ paddingRight: root.style.paddingRight === '' ? '0px' : root.style.paddingRight }),
  };
  return { root, win };
}

describe('holdScroll: the page is held, and keeps its width by the scrollbar it had', () => {
  /* Fails against the hold as built at d8eb24b, which sets overflow and nothing else: paddingRight stays ''. */
  it('a 15px scrollbar (window 500, root 485) is replaced by 15px of right padding', () => {
    const { root, win } = stage(500, 485);
    holdScroll(root, win);
    expect(root.style.overflow).toBe('hidden');
    expect(root.style.paddingRight).toBe('15px');
  });

  /* Fails against a hold that always writes a padding: '0px' is not ''. Passes against d8eb24b, which is right in this case; its line is the `bar > 0` guard. */
  it('no scrollbar (window 500, root 500) adds no padding, and still holds the page', () => {
    const { root, win } = stage(500, 500);
    holdScroll(root, win);
    expect(root.style.overflow).toBe('hidden');
    expect(root.style.paddingRight).toBe('');
  });

  /* Fails against a release that clears the padding it set: '' is not '10px'; and against a hold that overwrites the page's own padding: '15px' is not '25px'. */
  it('release restores the root exactly as it was, including padding and overflow it already had', () => {
    const { root, win } = stage(500, 485, { overflow: 'clip', paddingRight: '10px' });
    const release = holdScroll(root, win);
    expect(root.style.overflow).toBe('hidden');
    expect(root.style.paddingRight, 'the page’s own 10 and the scrollbar’s 15').toBe('25px');
    release();
    expect(root.style.overflow).toBe('clip');
    expect(root.style.paddingRight).toBe('10px');
  });

  /* Fails against a release that restores to a literal 0 or leaves the compensation behind. */
  it('release after a compensated hold leaves no inline padding where there was none', () => {
    const { root, win } = stage(500, 485);
    holdScroll(root, win)();
    expect(root.style.overflow).toBe('');
    expect(root.style.paddingRight).toBe('');
  });
});
