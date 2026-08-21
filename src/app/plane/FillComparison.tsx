'use client';

import { useEffect, useState } from 'react';
import { BoxCanvas } from './BoxCanvas';
import { WIDTH_CANDIDATES, recordSizeFor } from './fill-candidates';
import { recordSummary } from './summary';
import { SummaryCard } from './SummaryCard';
import { viewportAspect } from './wall-camera';
import { PANEL_GROUND } from '../shelf/panel-palette';
import type { FactPanel } from './panel';
import type { Skins } from './skins';

/**
 * **One candidate at a time, at the size it would actually be, with its card
 * beneath it.**
 *
 * SCAFFOLDING on `/plane`. Nothing here is imported by `/`, and
 * `WallScene.tsx` still passes the wall's aspect to its camera — the fill rule
 * is being CHOSEN, not applied.
 *
 * ## The question this page exists to answer
 *
 * *Which size makes the record read as the thing I just pulled out, with its
 * facts legible beneath it, on a screen I am holding.* **That is one question
 * about a PAIR** — not one about a record and another about a card.
 *
 * Everything below follows from that sentence:
 *
 * - **Full-bleed, one at a time.** The first version put three shrunken frames
 *   side by side in a scrolling column. Three thumbnails of an answer are a
 *   diagram of the comparison, not the comparison: a record at 55% of a 340px
 *   preview is not a record at 55% of a phone, and "does this read as the thing
 *   in my hands" cannot be asked of something the size of a stamp.
 * - **The card is rendered, not represented.** It is the real `FactsPanel` with
 *   the real record's facts, because "legible beneath it" is a question about
 *   type at a size, and a grey placeholder rectangle answers a different one.
 * - **The switcher is fixed at the bottom.** Thumb-reachable (§10), and it puts
 *   the three a single tap apart so they can be compared by flicking between
 *   them rather than by remembering the last one.
 *
 * ## What the captions may and may not do
 *
 * The previous version printed "119% wide · OVERFLOWS" beside a render that
 * showed nothing of the kind, because both the caption and the wrapper came
 * from `occupancy()` while the renderer ignored the wrapper — **the truth in
 * text and a lie in pixels** (NOTES, step 15 unit 4).
 *
 * So the caption here reports the **measured** rendered size, read back off the
 * DOM after layout, beside the intended one. Two numbers from two sources:
 * when they disagree, the instrument is broken, and that disagreement is
 * visible on the page rather than needing a test to find it.
 */

export function FillComparison({
  skins,
  imprint,
  spineColour,
  panel,
  recordId,
}: {
  skins: Skins;
  imprint: string | null;
  spineColour: string | null;
  panel: FactPanel;
  /** The record the summary links to — §10b's detail page, not a modal. */
  recordId: string;
}) {
  /*
    Measured rather than assumed: the whole defect was an aspect taken from the
    wrong box. Re-measured on resize so rotating a phone re-answers it.
  */
  const [aspect, setAspect] = useState<number | null>(null);
  const [active, setActive] = useState<'A' | 'B' | 'C'>('A');

  /** What the record ACTUALLY rendered at, read back after layout. */
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null);

  /** The frame's own pixel size ON THIS DEVICE, which is not a constant. */
  const [frameSize, setFrameSize] = useState<{ w: number; h: number } | null>(null);

  /**
   * The summary card's rendered height.
   *
   * **Measured, not declared.** The claim this whole rebuild rests on is that
   * it does not vary with the record; measuring it means the page shows the
   * real reservation rather than an assumed one, and
   * `e2e/summary-card.spec.ts` asserts the invariance separately.
   */
  const [cardHeight, setCardHeight] = useState<number | null>(null);

  useEffect(() => {
    const measure = () =>
      setAspect(viewportAspect({ width: window.innerWidth, height: window.innerHeight }));
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  /*
    Read the rendered box back off the DOM, so the caption's second number comes
    from the layout engine rather than from the arithmetic that was supposed to
    drive it. This is the check that would have caught three identical 273px
    canvases immediately.
  */
  useEffect(() => {
    if (aspect === null) return;
    const read = () => {
      const frame = document.querySelector('[data-fill-frame]') as HTMLElement | null;
      const box = document.querySelector('[data-fill-box]') as HTMLElement | null;
      if (!frame || !box || frame.clientWidth === 0) return;
      setMeasured({
        w: (box.clientWidth / frame.clientWidth) * 100,
        h: (box.clientHeight / frame.clientHeight) * 100,
      });
      setFrameSize({ w: Math.round(frame.clientWidth), h: Math.round(frame.clientHeight) });
      const card = document.querySelector('[data-fill-card]') as HTMLElement | null;
      if (card) setCardHeight(card.clientHeight);
    };
    const id = window.setTimeout(read, 60);
    return () => window.clearTimeout(id);
  }, [aspect, active]);

  if (aspect === null) return null;

  const candidates = WIDTH_CANDIDATES;
  const candidate = candidates.find((c) => c.key === active) ?? candidates[0];

  /*
    The card's share of the frame, which is a CONSTANT now that the card is a
    summary. Measured off the rendered card rather than declared, so the
    reservation stays honest if the card's type or padding changes.
  */
  /*
    **Everything below the record, not just the card.** The card is 91px, but
    beneath it sit its top margin and the switcher's reserved strip — and a
    reservation covering only the card left the card itself overflowing the
    frame at 1280 (709px into a 686px frame). The record must clear all of it.

    `SWITCHER_STRIP` matches the `pb-20` on the column below; `CARD_GAP` matches
    the card's `mt-3`. Both are stated here rather than measured because they
    are constants of THIS layout, and a measurement of them would be a
    measurement of the thing being set.
  */
  const SWITCHER_STRIP = 80;
  const CARD_GAP = 12;
  const belowRecord = (cardHeight ?? 91) + CARD_GAP + SWITCHER_STRIP;
  const cardFraction = frameSize === null ? 0.3 : belowRecord / frameSize.h;
  const intendedW = candidate.widthFraction * 100;
  const summary = recordSummary(panel, recordId);

  /*
    Applied against the measured frame once there is one; before the first
    measurement the width fraction stands alone, which is correct rather than a
    fallback — the clamp can only bind once the frame's height is known.
  */
  const sized =
    frameSize === null
      ? null
      : recordSizeFor({
          frame: { width: frameSize.w, height: frameSize.h },
          widthFraction: candidate.widthFraction,
          cardFraction,
        });
  const renderedSize = sized === null ? null : Math.round(sized.size);


  return (
    <section data-testid="fill-comparison" className="mt-10">
      <h2 className="font-heading text-lg font-semibold">Pulled-record size</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        One at a time, at full size, with the card beneath. Which reads as the record
        you just pulled out, with its facts legible?
      </p>

      {/*
        **The frame is the VIEWPORT'S ASPECT, and carries no padding of its
        own.** Both were caption bugs and both mattered:

        - It was `min(78svh, 780px)` tall at whatever width the page gave it,
          so its shape (0.518) was not the viewport's (0.462). The caption's
          height came from `occupancy()` — a fraction of the 3D FRUSTUM — and
          the measurement from a square CSS box over the CSS frame. A frustum
          fraction and a layout fraction cannot agree unless the two frames are
          the same shape. Now they are.
        - Padding on this element made `width: 86%` resolve against the content
          box (308px of 340), so every candidate rendered ~10% smaller than its
          label. The padding moved to the children.

        `svh` is deliberately gone as the height driver: it resolves differently
        on a phone than in a desktop window of the same nominal size, so a
        number chosen on one was wrong on the other (NOTES).
      */}
      <div
        data-fill-frame
        data-testid="fill-frame"
        className="relative mt-4 w-full overflow-hidden rounded-xs border border-border"
        style={{ aspectRatio: String(aspect), backgroundColor: PANEL_GROUND }}
      >
        <div className="flex h-full flex-col items-center pb-20">
          {/*
            The record. `data-fill-box` is what the measurement reads, and the
            wrapper owns the geometry now that `BoxCanvas` fills its container.
          */}
          <div
            data-fill-box
            data-testid={`fill-box-${candidate.key}`}
            className="mt-3 shrink-0"
            /*
              **Sized through `recordSizeFor`, not by the width alone.** A
              record is square, so its height follows its width and a squat
              frame (a landscape phone, a short desktop window) would otherwise
              push it through the card. The rule clamps to whatever the card
              leaves — the same overflow as this unit's original defect,
              arriving on the other axis.
            */
            /*
              **Sized in PIXELS, not as a percentage with `aspectRatio: 1`.**
              That combination silently defeated the height clamp: at 1280 the
              width resolved to 593px, `aspectRatio` made the element 593 tall
              in a 686px frame, and the card was pushed to 902px — entirely
              outside the frame and invisible. `recordSizeFor` had computed the
              correct clamp and the CSS overrode it, which is precisely the
              shape of `BoxCanvas` ignoring its container one step earlier in
              this unit.

              A square in explicit pixels cannot be overridden by the box it
              sits in.
            */
            style={
              renderedSize === null
                ? { width: `${intendedW}%`, aspectRatio: '1' }
                : { width: `${renderedSize}px`, height: `${renderedSize}px` }
            }
          >
            <BoxCanvas
              /*
                Keyed on the candidate so switching rebuilds the scene at the
                new size. The record fills the WHOLE element now
                (`frameFill={1}`) and the element carries the candidate's width,
                so element-size and record-size are one number — before, the
                camera sat at its default and the record was 55% of whatever
                element it was handed, which is the "100% caption, 55% record"
                defect (NOTES).
              */
              key={candidate.key}
              skins={skins}
              imprint={imprint}
              spineColour={spineColour}
              label={`Candidate ${candidate.key}`}
              testId={`fill-canvas-${candidate.key}`}
              fill
              frameFill={1}
            />
          </div>

          {/*
            **The summary card, stacked beneath** (NOTES, step 15 unit 3: "the
            panels stack rather than flank"). Its height is a constant, which is
            what makes the reservation above knowable rather than a guess.
          */}
          <div
            data-fill-card
            data-testid={`fill-card-${candidate.key}`}
            className="mt-3 w-full shrink-0"
          >
            <SummaryCard summary={summary} />
          </div>
        </div>

        {/* Thumb-reachable, and one tap between candidates. */}
        <div className="absolute inset-x-0 bottom-0 flex gap-2 p-3">
          {candidates.map((c) => (
            <button
              key={c.key}
              type="button"
              data-testid={`fill-pick-${c.key}`}
              aria-pressed={c.key === active}
              onClick={() => setActive(c.key)}
              className={`min-h-11 flex-1 rounded-xs border text-sm ${
                c.key === active
                  ? 'border-foreground bg-foreground/10 font-medium text-foreground'
                  : 'border-border text-muted-foreground'
              }`}
            >
              {c.key}
            </button>
          ))}
        </div>
      </div>

      {/*
        **The frame's own pixel size is printed**, because `svh`/`aspect-ratio`
        resolve differently per device and a reading taken elsewhere is a
        reading about elsewhere. A desktop number is then visibly a desktop
        number rather than silently standing in for the phone's.
      */}
      <p className="mt-2 font-mono text-xs text-muted-foreground">
        {candidate.key} — {candidate.label}
        <br />
        record {intendedW.toFixed(0)}% of frame width
        {measured !== null && (
          <>
            {' · '}measured {measured.w.toFixed(0)}%
            {sized?.limitedBy === 'height' && ' (clamped by the card\u2019s room)'}
            {sized?.limitedBy !== 'height' &&
              Math.abs(measured.w - intendedW) > 2 &&
              ' ← DISAGREE'}
          </>
        )}
        {frameSize !== null && (
          <>
            <br />
            frame {frameSize.w}×{frameSize.h}px on this device · viewport aspect{' '}
            {aspect.toFixed(3)}
          </>
        )}
        {cardHeight !== null && (
          <>
            <br />
            card {cardHeight}px ({(cardFraction * 100).toFixed(0)}% of frame) — constant,
            whatever the record holds
          </>
        )}
      </p>
    </section>
  );
}
