/** The parts of the root element and the window the hold reads and writes, so it can be tested on stubs. */
export type HoldRoot = { clientWidth: number; style: { overflow: string; paddingRight: string } };
export type HoldWindow<R extends HoldRoot = HoldRoot> = { innerWidth: number; getComputedStyle: (el: R) => { paddingRight: string } };

/**
 * §G.8: "The page beneath is held where it was", and "where holding the page
 * removes a classic scrollbar, the page's width is kept by the scrollbar's
 * width, so the page does not shift sideways."
 *
 * The scrollbar is measured, the window's width less the root's, because the
 * compensation must equal the one that was actually there: a reserved gutter
 * (`scrollbar-gutter: stable`) shifts a page too short to scroll the other
 * way. The release puts back the inline values it found and not blanks, so a
 * page with its own padding is not left shifted after the menu closes.
 */
export function holdScroll<R extends HoldRoot>(root: R, win: HoldWindow<R>): () => void {
  const { overflow, paddingRight } = root.style;
  const bar = win.innerWidth - root.clientWidth;
  if (bar > 0) {
    const own = Number.parseFloat(win.getComputedStyle(root).paddingRight);
    root.style.paddingRight = `${(Number.isFinite(own) ? own : 0) + bar}px`;
  }
  root.style.overflow = 'hidden';
  return () => {
    root.style.overflow = overflow;
    root.style.paddingRight = paddingRight;
  };
}

/** The part of a scrolling box the touch hold reads. */
export type HoldScroller = { scrollTop: number; scrollHeight: number; clientHeight: number };
export type HoldTouchEvent = { target: unknown; touches: ArrayLike<{ clientY: number }>; cancelable: boolean; preventDefault: () => void };
type HoldTouchDocument = {
  addEventListener: (type: 'touchstart' | 'touchmove', listener: (event: HoldTouchEvent) => void, options?: { passive?: boolean }) => void;
  removeEventListener: (type: 'touchstart' | 'touchmove', listener: (event: HoldTouchEvent) => void) => void;
};

/**
 * Whether a finger's move is let through: only one that began on the
 * scrolling box and that the box can still follow. `dy` is how far the
 * finger has gone down the screen, so a positive one asks for what is above.
 * At its limit the box would hand the move on to the page, so it is cancelled
 * there too; `overscroll-behavior` says the same where it is honoured.
 */
export function allowsTouchMove(scroller: HoldScroller | null, dy: number): boolean {
  if (scroller === null || dy === 0) return false;
  if (dy > 0) return scroller.scrollTop > 0;
  return scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight;
}

/**
 * §T.3's hold against a finger. `overflow: hidden` on the root does not stop
 * a finger moving the page on Mobile Safari (Adam, 9 Oct, step 107), so the
 * move itself is cancelled, which that engine does honour. The page is not
 * repositioned to hold it, so its scroll offset is never given up and there
 * is nothing to restore when the hold comes off.
 */
export function holdTouch<S extends HoldScroller & { contains: (node: never) => boolean }>(doc: HoldTouchDocument, scroller: () => S | null): () => void {
  let startY = 0;
  let within: S | null = null;
  const onStart = (event: HoldTouchEvent) => {
    if (event.touches.length !== 1) return;
    startY = event.touches[0].clientY;
    const box = scroller();
    within = box !== null && box.contains(event.target as never) ? box : null;
  };
  const onMove = (event: HoldTouchEvent) => {
    /* Two fingers are a pinch, which is the reader's and not a drag of the page. */
    if (event.touches.length !== 1) return;
    if (!allowsTouchMove(within, event.touches[0].clientY - startY) && event.cancelable) event.preventDefault();
  };
  doc.addEventListener('touchstart', onStart, { passive: true });
  doc.addEventListener('touchmove', onMove, { passive: false });
  return () => {
    doc.removeEventListener('touchstart', onStart);
    doc.removeEventListener('touchmove', onMove);
  };
}
