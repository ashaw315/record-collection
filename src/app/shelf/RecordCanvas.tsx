'use client';

import { useEffect } from 'react';
import type { ShelfRecord } from '@/lib/db/queries/shelf';
import { BoxCanvas } from '../plane/BoxCanvas';
import { resolveSkins } from '../plane/skins';
import type { ScreenRect } from '../plane/world-map';
import { ActionsPanel, FactsPanel } from '../plane/Panels';
import { factPanel } from '../plane/panel';

/**
 * §10b's record, rendered over the real wall — the integration this whole
 * strand of work was building toward.
 *
 * Everything from unit 15 onward ran on `/plane`, which uses placeholder spines
 * and never renders `Shelf.tsx`. So nothing had proven the rise's mapping
 * against the real wall's layout, its scroll container or its wrapping rows.
 * This is where that gets proven or found wanting.
 *
 * ---
 *
 * **Pointer events: one owner, everything else derived.**
 *
 * `Shelf` holds `pulledId`. That single value is the answer to "is a record
 * out", and this component takes it as `record === null`. There is deliberately
 * no second flag, no ref, and no CSS class toggled independently — a transparent
 * canvas over a wall of links is precisely the thing that can be present,
 * correct and silently eating every click, and the way that happens is two
 * pieces of state disagreeing about whether a record is out.
 *
 * So the overlay is `pointer-events: none` while nothing is pulled and
 * `pointer-events: auto` while something is, both computed from the same value
 * in one expression. Asserted where it matters — `elementFromPoint` over a
 * spine — rather than by reading the property, because `pointer-events` is
 * inherited and overridable and what counts is which element receives the
 * click.
 *
 * **Mounted always, rather than only while a record is out.** Mounting on
 * demand would rebuild the WebGL context on every pull, and the first frame
 * after a context is created is the slowest one there is — the rise would start
 * with a stutter exactly when it is most visible. The cost of an idle canvas is
 * a dirty-flag loop that renders nothing (unit 19), which is why that loop
 * exists.
 *
 * ---
 *
 * **Coordinates: `fixed`, and both rects read the same way.**
 *
 * Measured rather than assumed: the page scrolls while a record is out
 * (`body { overflow: visible }`, no scroll lock), and under 24px of scroll the
 * spine moves −24 while a `position: fixed` overlay moves 0. Those are two
 * different frames.
 *
 * The fix is NOT a scroll correction term — that is unit 18's defect, where a
 * document-relative `offsetTop` was paired with a viewport-relative `clientY`
 * and the difference drifted by exactly `scrollY`. Both the spine rect and the
 * canvas rect are read with `getBoundingClientRect`, which is viewport-relative
 * for both, so scroll cancels out of their difference and no scroll term
 * appears anywhere. The rects are re-read at pull time for the same reason.
 */
export function RecordCanvas({
  record,
  from,
  onClose,
}: {
  /** The record that is out, or `null`. THE source of truth for that question. */
  record: ShelfRecord | null;
  /** The slot it came out of, viewport-relative, measured at click time. */
  from: ScreenRect | null;
  onClose: () => void;
}) {
  const isOut = record !== null;

  /**
   * **Escape puts the record back**, and the effect is bound only while one is
   * out — derived from the same `isOut`, so there is still exactly one owner of
   * that question and no listener running over an empty wall.
   *
   * The CSS implementation had this and the first version of the overlay did
   * not; the full E2E caught it. Without it a keyboard user who pulls a record
   * has no way back except tabbing to a control, which passes every geometry
   * assertion while trapping someone.
   */
  useEffect(() => {
    if (!isOut) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOut, onClose]);

  return (
    <div
      data-testid="record-canvas"
      /*
        `fixed inset-0` so the canvas covers the viewport rather than the
        document: the record is a thing held up in front of the reader, not a
        thing pinned to a position on a long page.

        `pointer-events` derived from `isOut` and from nothing else. This is the
        whole contract in one expression, which is the point — there is no
        second place for it to disagree with itself.
      */
      className={`fixed inset-0 z-50 ${isOut ? 'pointer-events-auto' : 'pointer-events-none'}`}
      /*
        Hidden from assistive technology and from tests while empty. An always-
        mounted overlay that reports itself as visible would make "is a record
        out" ambiguous to exactly the readers who cannot see the answer.
      */
      aria-hidden={!isOut}
      style={{ visibility: isOut ? 'visible' : 'hidden' }}
    >
      {record !== null && (
        <>
          {/*
            The dimmed wall behind the record (§10b: "the shelf dimmed behind
            it"). Clicking it puts the record back, which is the gesture a
            reader reaches for first.
          */}
          <button
            type="button"
            data-testid="record-scrim"
            aria-label="Put the record back"
            onClick={onClose}
            /*
              Heavier than the CSS version's dim, because the thing being dimmed
              is already dark: measured at black/0.55 the wall behind still read
              as spine text through the panels. A scrim's job is to say "this is
              behind now", and against a dark wall that costs more opacity than
              against a page.
            */
            className="absolute inset-0 cursor-default bg-black/80"
          />

          <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-8 p-6">
            {/*
              **The panels get a ground of their own here, and did not on
              `/plane`.**

              They were built against a light workbench page, where text on the
              page background was legible. Over the wall they rendered as
              transparent text directly on the spines — measured
              `rgba(0,0,0,0)`, and unreadable, with spine glyphs showing through
              every line.

              A found integration gap rather than a design change: the panels
              are unchanged, what changed is that they now sit on something.
            */}
            <div className="pointer-events-auto rounded-xs bg-[#17140f]/95 p-4 shadow-2xl backdrop-blur-sm">
              <FactsPanel panel={factPanel(record)} />
            </div>

            <BoxCanvas
              /*
                Keyed on the record AND its slot, so pulling a second record
                starts a fresh rise rather than reusing a canvas that has
                already settled at the origin.
              */
              key={`${record.id}-${from?.left ?? 0}-${from?.top ?? 0}`}
              testId="record-box"
              skins={resolveSkins(record)}
              imprint={null}
              spineColour={record.spineColour}
              riseFrom={from}
              fill
            />

            <div className="pointer-events-auto rounded-xs bg-[#17140f]/95 p-4 shadow-2xl backdrop-blur-sm">
              <ActionsPanel />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
