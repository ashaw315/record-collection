'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { holdScroll } from '@/components/scroll-hold';
import { NAV_TYPE } from '@/components/nav-type';
import { LABEL } from './grid-type';
import { MODAL_CONTROL_GAP, MODAL_LABEL_GAP, MODAL_LABEL_LINE, sleeveSquare, type SleeveFace } from './sleeve-modal';

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
/**
 * §M.6: "44 tall, a 1px ink box, no fill, no radius, border-box, with an
 * 11px mono uppercase ink label." Hover: "the label takes a 1px ink
 * underline, 3 below its baseline, and nothing else changes." Keyboard
 * focus: "a 2px ink outline, offset 2 outside the box, on keyboard focus
 * only." The label is the header's own type, as the top row's CLOSE is.
 */
const CONTROL = `${NAV_TYPE} box-border flex h-[44px] shrink-0 cursor-pointer items-center justify-center border border-foreground font-normal text-foreground decoration-1 underline-offset-[3px] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground`;

const FACE_NAME: Record<SleeveFace, string> = { front: 'Front', back: 'Back' };

export function SleeveModal({ onClose, front, back }: { onClose: () => void; front: string; back: string | null }) {
  const view = useRef<HTMLDivElement>(null);
  /* §M.4: "The sizes are taken once when the modal opens and do not change while it is open." */
  const [side] = useState(() => sleeveSquare(window.innerWidth, window.innerHeight));
  const [face, setFace] = useState<SleeveFace>('front');
  const shown = face === 'front' ? front : back;
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
          className={`${CONTROL} ml-auto w-[calc(5ch+0.6em+36px)]`}
        >
          Close
        </button>
      </div>
      {/*
        §M.4: the sleeve centred below the row, with the face label and the
        controls beneath it. The square is a box with a hairline edge, and
        every photograph is fitted inside it on paper, never cropped, so a
        face keeps its size and framing across a turn.
      */}
      <div data-sleeve-stage="" className="flex min-h-0 flex-1 flex-col items-center justify-center">
        <div data-sleeve="" data-face={face} className="relative box-border shrink-0 border border-border bg-background" style={{ width: side, height: side }}>
          {shown !== null && (
            // eslint-disable-next-line @next/next/no-img-element -- blob and data URLs the optimizer is not configured for, as in ImageGallery
            <img key={face} data-sleeve-face={face} src={shown} alt="" className="block h-full w-full object-contain" />
          )}
        </div>
        {/* §M.5: "a label beneath the sleeve names the face shown... It shows in every mode... the label is announced politely." */}
        <div data-face-label="" aria-live="polite" className={`${LABEL} shrink-0 leading-none`} style={{ marginTop: MODAL_LABEL_GAP, height: MODAL_LABEL_LINE }}>
          {FACE_NAME[face]}
        </div>
        <div data-sleeve-controls="" className="flex shrink-0" style={{ marginTop: MODAL_LABEL_GAP, gap: MODAL_CONTROL_GAP }}>
          {/* §M.6: "TURN OVER shows on the front and on the back, and keeps its label on both". */}
          <button type="button" data-sleeve-control="turn" onClick={() => setFace((now) => (now === 'front' ? 'back' : 'front'))} className={`${CONTROL} px-[18px]`}>
            Turn over
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
