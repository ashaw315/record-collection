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
