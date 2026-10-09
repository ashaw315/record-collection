import { describe, expect, it } from 'vitest';
import { allowsTouchMove, holdScroll, holdTouch, type HoldRoot, type HoldTouchEvent, type HoldWindow } from './scroll-hold';

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

/**
 * Step 107, §T.3: "the page held in both directions". On Mobile Safari a
 * finger moved the page behind an open filter, the root's `overflow:
 * hidden` notwithstanding (Adam, 9 Oct). The hold against a finger is a
 * cancelled move, and this is the rule for which moves are cancelled.
 *
 * **The rule and its wiring on stubs, not the effect.** No engine here is
 * that Safari; `panel-hold-107.spec.ts` stages a root that does not hold
 * in Chromium, and the phone is Adam's to confirm.
 */
describe('allowsTouchMove: a finger moves the panel’s list and nothing else', () => {
  const list = (scrollTop: number) => ({ scrollTop, scrollHeight: 1408, clientHeight: 146 });

  /* Fails against a hold that lets a move through wherever it starts. */
  it('cancels a move that began off the panel, in either direction', () => {
    expect(allowsTouchMove(null, -40)).toBe(false);
    expect(allowsTouchMove(null, 40)).toBe(false);
  });

  /* Fails against a hold that cancels every move: the list could not be scrolled. */
  it('lets the list scroll while it has somewhere to go', () => {
    expect(allowsTouchMove(list(0), -40), 'finger up at the top: the list goes down').toBe(true);
    expect(allowsTouchMove(list(600), -40)).toBe(true);
    expect(allowsTouchMove(list(600), 40)).toBe(true);
    expect(allowsTouchMove(list(1262), 40), 'finger down at the foot').toBe(true);
  });

  /* Fails against a hold that lets every move on the panel through: at its limit the list hands the move to the page. */
  it('cancels a move past the list’s top or foot, and one on a list with nowhere to go', () => {
    expect(allowsTouchMove(list(0), 40), 'finger down at the top').toBe(false);
    expect(allowsTouchMove(list(1262), -40), 'finger up at the foot').toBe(false);
    expect(allowsTouchMove({ scrollTop: 0, scrollHeight: 88, clientHeight: 146 }, -40)).toBe(false);
    expect(allowsTouchMove({ scrollTop: 0, scrollHeight: 88, clientHeight: 146 }, 40)).toBe(false);
  });

  it('cancels a move with no vertical part', () => {
    expect(allowsTouchMove(list(600), 0)).toBe(false);
  });
});

describe('holdTouch: the moves are cancelled while it is on, and not after', () => {
  type Listener = (event: HoldTouchEvent) => void;
  function stage(scroller: { scrollTop: number; scrollHeight: number; clientHeight: number; contains: (n: unknown) => boolean } | null) {
    const on = new Map<string, { listener: Listener; passive: boolean | undefined }>();
    const doc = {
      addEventListener: (type: string, listener: Listener, options?: { passive?: boolean }) => { on.set(type, { listener, passive: options?.passive }); },
      removeEventListener: (type: string) => { on.delete(type); },
    };
    const release = holdTouch(doc, () => scroller);
    const move = (target: unknown, fromY: number, toY: number, fingers = 1) => {
      let prevented = false;
      const touches = (y: number) => Array.from({ length: fingers }, () => ({ clientY: y }));
      on.get('touchstart')?.listener({ target, touches: touches(fromY), cancelable: true, preventDefault: () => undefined });
      on.get('touchmove')?.listener({ target, touches: touches(toY), cancelable: true, preventDefault: () => { prevented = true; } });
      return prevented;
    };
    return { on, release, move };
  }
  const inside = {};
  const panel = (scrollTop: number) => ({ scrollTop, scrollHeight: 1408, clientHeight: 146, contains: (n: unknown) => n === inside });

  /* Fails against a passive listener: a passive move cannot be cancelled, and the browser says so and scrolls. */
  it('listens for the move as one it may cancel', () => {
    const s = stage(panel(0));
    expect(s.on.get('touchmove')?.passive).toBe(false);
  });

  it('cancels a drag on the page and lets one on the list through', () => {
    const s = stage(panel(300));
    expect(s.move({}, 400, 300), 'on the page').toBe(true);
    expect(s.move(inside, 600, 500), 'on the list').toBe(false);
  });

  /* Fails against a rule read from the move alone: where the finger went down decides, and it is on the panel here. */
  it('cancels a drag on the list past its top', () => {
    const s = stage(panel(0));
    expect(s.move(inside, 500, 600)).toBe(true);
  });

  it('leaves two fingers alone: a pinch is not a drag', () => {
    const s = stage(panel(0));
    expect(s.move({}, 400, 300, 2)).toBe(false);
  });

  it('released, it cancels nothing', () => {
    const s = stage(null);
    s.release();
    expect(s.on.size).toBe(0);
  });
});
