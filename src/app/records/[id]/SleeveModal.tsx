'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { holdScroll } from '@/components/scroll-hold';
import { NAV_TYPE } from '@/components/nav-type';

/**
 * The record modal's view (§M.1): "a view of the object, not a dialog over
 * the page. It covers the whole viewport on opaque paper, with no dimming,
 * shadow or rounded panel... Its top row is 53, like the header's, with a
 * hairline below it and CLOSE at the right on the 18 inset."
 *
 * A dialog to assistive technology all the same: it takes the keyboard and
 * hides the page, and that is what the role says. Drawn in a portal on the
 * body, because the cover's cell is a size container with its overflow
 * hidden, and a view placed inside it is at the mercy of both.
 *
 * `onClose` is asked for; it does not close the view itself. Its owner
 * steps back through the history entry it added, and the entry going is
 * what closes it, so Back, CLOSE and Escape are one path.
 */
export function SleeveModal({ onClose, children }: { onClose: () => void; children?: React.ReactNode }) {
  const view = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    close.current?.focus();
    /* "The page beneath" does not scroll under the view, and keeps its width (§G.8's hold, the same function). */
    const release = holdScroll(document.documentElement, window);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      /* "Tab cycles within the modal while it is open." */
      const stops = Array.from(view.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])') ?? []);
      if (stops.length === 0) return;
      const at = stops.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey ? (at <= 0 ? stops.length - 1 : at - 1) : at === -1 || at === stops.length - 1 ? 0 : at + 1;
      event.preventDefault();
      stops[next].focus();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      release();
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return createPortal(
    <div ref={view} data-sleeve-modal="" role="dialog" aria-modal="true" aria-label="The sleeve" className="fixed inset-0 z-50 flex flex-col bg-background">
      <div data-sleeve-row="" className="box-border flex h-[53px] shrink-0 items-center border-b border-border px-[18px]">
        <button
          ref={close}
          type="button"
          data-sleeve-close=""
          onClick={onClose}
          className={`${NAV_TYPE} ml-auto box-border flex h-[44px] w-[calc(5ch+0.6em+36px)] shrink-0 cursor-pointer items-center justify-center border border-foreground font-normal text-foreground`}
        >
          Close
        </button>
      </div>
      <div data-sleeve-stage="" className="min-h-0 flex-1">
        {children}
      </div>
    </div>,
    document.body,
  );
}
