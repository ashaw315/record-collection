import { useEffect, type RefObject } from 'react';

/**
 * **Freezes the page in place while a record is out (§10b, step 15 unit 5).**
 *
 * A pulled record is a modal-ish state — the wall is dimmed, the record is the
 * subject, "put back" is the way out — and the wall scrolling under a record
 * fixed to the camera separates them. On touch a one-finger drag scrolls the
 * page; nothing held it.
 *
 * **The scroll POSITION is preserved, not reset, and that is the load-bearing
 * part.** `overflow: hidden` on the body alone jumps to the top on some
 * browsers, which is the "wall re-centres and the slot moves" failure this lock
 * exists to avoid — arriving by accident rather than by choice. So the offset is
 * pinned: the body is fixed at `top: -scrollY`, and on release the scroll is
 * restored to exactly where it was. The wall stays where the record left it, so
 * putting the record back returns it to the same slot in view — the continuity
 * the rise establishes, extended to the return.
 *
 * This is a PRECONDITION of §10b's unbuilt touch-drag, not a substitute: a
 * finger on the record will not tilt it until that is built, but it also will
 * not scroll the page away, which is the ground the drag needs.
 */
export function useScrollLock(
  locked: boolean,
  options?: { restoreTo?: RefObject<number | null> },
): void {
  useEffect(() => {
    if (!locked) return;

    const scrollY = window.scrollY;
    const body = document.body;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };

    /*
      Fixed at the negated offset rather than `overflow: hidden` alone: the
      latter stops scrolling but lets the viewport jump to the top, which moves
      the wall out from under the record. Fixing the body at -scrollY keeps the
      rendered position identical.
    */
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';

    return () => {
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.left = previous.left;
      body.style.right = previous.right;
      body.style.width = previous.width;
      body.style.overflow = previous.overflow;
      /*
        **Restore to the PRE-RISE position, not where the lock began.** The lock
        began at the rise-scrolled position (the record centred); returning there
        would leave the wall where the rise moved it, not where the reader was.
        `restoreTo` carries the position captured before the rise scrolled, so
        "put back" returns the wall home and the return animation plays from
        there. Falls back to the lock position if no target is given.
        `'instant'` so the restore itself does not animate a scroll.
      */
      const target = options?.restoreTo?.current ?? scrollY;
      window.scrollTo({ top: target, behavior: 'instant' as ScrollBehavior });
    };
    /*
      Only `locked` drives lock/unlock. `options.restoreTo` is a stable ref read
      at UNLOCK time, not lock time — including it would re-run the whole
      lock/restore cycle on every render that changes it, which is wrong: the
      restore target should be read once, when the record returns.
    */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);
}
