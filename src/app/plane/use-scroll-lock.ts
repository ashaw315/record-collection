import { useEffect } from 'react';

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
export function useScrollLock(locked: boolean): void {
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
        Restore to EXACTLY where the lock began. `'instant'` so the return does
        not animate a scroll the user did not ask for.
      */
      window.scrollTo({ top: scrollY, behavior: 'instant' as ScrollBehavior });
    };
  }, [locked]);
}
