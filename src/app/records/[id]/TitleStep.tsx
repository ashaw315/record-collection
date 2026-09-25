'use client';

import { useEffect, useRef, useState } from 'react';
import { MAX_LINES, STEP_GAP, TITLE_STEPS, artistStep, titleStep } from './title-steps';

/**
 * §33's display ladder, applied by measuring rather than by counting
 * characters.
 *
 * **Both inputs are measurements the browser alone has.** How many lines a
 * title sets to at 144px depends on the face, its tracking and the measure;
 * how tall the cell's content then is depends on everything below it. A
 * character-count estimate would be the declared-value defect this build
 * keeps catching -- a test of its own input.
 *
 * So the step is chosen after paint: the title is rendered at each candidate
 * size in turn, off-screen, and the first that satisfies both of §33's
 * conditions wins. Four measurements on one element, once per record.
 */
export function TitleStep({
  title,
  artist,
  children,
}: {
  title: string;
  artist: React.ReactNode;
  /** Everything below the title block, whose height is the cell's demand. */
  children?: React.ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLHeadingElement>(null);
  const artistProbe = useRef<HTMLDivElement>(null);
  const real = useRef<HTMLHeadingElement>(null);
  const [probeWidth, setProbeWidth] = useState<number | undefined>(undefined);
  /*
    **72 until measured, not the largest.** A record that paints at 144 and
    settles to 72 is a visible jump on every load; the other direction only
    ever grows into space that was already empty. 72 is also what the build
    drew before §33, so an unmeasured render is the old page rather than a
    wrong one.
  */
  const [step, setStep] = useState<number>(72);

  useEffect(() => {
    const el = host.current;
    const measure = probe.current;
    if (el === null || measure === null) return;

    const choose = () => {
      /*
        **The BAND's height, which is a constant, not a measured box.**

        Two wrong answers came before this one. `parentElement` is a 412px
        text-measure wrapper whose height is just the type's -- 164 against
        the band's 547 -- so every step above 72 was refused. Measuring the
        identity cell instead gives 662, because the cell has no fixed height
        and GROWS with the title currently in it: measuring the thing the
        title inflates is a feedback loop, and it chose 144 by reading the
        space 144 had just made.

        The supply §33 means is the space the band gives the record, which
        §23 fixes at `BANDS.identity`. A constant cannot be inflated by what
        is measured against it.
      */
      /*
        **Supply and demand, measured the way the genres run measures them.**

        Supply was `BANDS.identity`, the band, and demand was the title, the
        artist and `el.nextElementSibling` -- which is not the pressing block,
        so `below` read 0 and every step was judged on the type alone. The
        ladder published its view: at 120 it saw 470 in 547 and chose it, and
        the cell rendered at 593 with the genres run collapsed.

        Both are now the content track's, as `GenresRun` reads them: supply is
        the identity-content cell's box less its padding, and demand is the
        sum of the track's children with this holder's own height replaced by
        the probes at each step. The run is inside the pressing block, so a
        step is chosen only where the run still fits expanded -- the ladder
        can never force the give order; only 72 not fitting can.
      */
      const cell = el.closest('[data-cell="identity-content"]');
      const track = el.parentElement;
      if (!(cell instanceof HTMLElement) || track === null) return;
      const cellStyle = getComputedStyle(cell);
      const supply = cell.clientHeight - parseFloat(cellStyle.paddingTop) - parseFloat(cellStyle.paddingBottom);
      const outer = (child: Element) => {
        const b = child.getBoundingClientRect();
        const s = getComputedStyle(child);
        return b.height + parseFloat(s.marginTop) + parseFloat(s.marginBottom);
      };
      const below = Array.from(track.children).filter((child) => child !== el).reduce((sum, child) => sum + outer(child), 0);

      /* The title's measure. */
      const titleBox = real.current?.getBoundingClientRect();
      if (titleBox !== undefined && titleBox.width > 0) {
        measure.style.width = `${titleBox.width}px`;
        if (artistProbe.current !== null) artistProbe.current.style.width = `${titleBox.width}px`;
        setProbeWidth(titleBox.width);
      }

      /* The title's unitless leading; derived from the size, never read back mid-probe. */
      const LINE = 0.94;
      const linesAt = (size: number) => {
        measure.style.fontSize = `${size}px`;
        return Math.round(measure.getBoundingClientRect().height / (size * LINE));
      };
      /*
        **The artist is measured too, not assumed to be one line.** The
        demand counted the artist as `artistStep(size)` -- a single line --
        so an artist that wraps was under-counted by every line past the
        first. Measured: an artist that broke at its hyphens into three
        lines of 80px let the ladder choose 144 for a demand it read as 569
        and that rendered at 750, in a 547 cell; the genres collapsed and two
        specs lost the field. A real two-line artist under-counts the same
        way. §33's demand is what the cell holds, so the artist's rendered
        height at each step is read off a second probe, sized at its own
        step, on the same measure.
      */
      const artistMeasure = artistProbe.current;
      const demandAt = (size: number) => {
        measure.style.fontSize = `${size}px`;
        let artistHeight = artistStep(size);
        if (artistMeasure !== null) {
          artistMeasure.style.fontSize = `${artistStep(size)}px`;
          artistHeight = artistMeasure.getBoundingClientRect().height;
        }
        return measure.getBoundingClientRect().height + artistHeight + below;
      };

      /*
        **What the ladder measured is published, per step.** A choice made
        from measurements that cannot be seen afterwards is a choice nobody
        can check; the E2E reads this back and asserts the chosen step's
        demand is within supply.
      */
      const seen = TITLE_STEPS.map((size) => ({ size, lines: linesAt(size), demand: Math.round(demandAt(size)) }));
      const chosen = titleStep({ linesAt, demandAt, supply });
      measure.style.fontSize = '';
      if (artistMeasure !== null) artistMeasure.style.fontSize = '';
      el.setAttribute(
        'data-ladder',
        JSON.stringify({ supply, below: Math.round(below), steps: seen, chosen, fonts: document.fonts.status }),
      );
      setStep(chosen);
    };

    choose();
    const observer = new ResizeObserver(choose);
    observer.observe(el.parentElement ?? el);
    return () => observer.disconnect();
  }, [title]);

  return (
    <>
      <div ref={host} data-title-step={step}>
        <h1
          ref={real}
          data-field="title"
          className="font-extrabold tracking-[-0.02em]"
          style={{
            fontSize: step,
            lineHeight: 0.94,
            textWrap: 'balance',
            hyphens: 'none',
          }}
        >
          {title}
        </h1>
        <div
          data-field="artist"
          className="font-extrabold"
          style={{ fontSize: artistStep(step), lineHeight: 1, textWrap: 'balance', hyphens: 'none' }}
        >
          {artist}
        </div>

        {/* The artist's probe: its own step, same measure, never painted. */}
        <div
          ref={artistProbe}
          aria-hidden="true"
          className="font-extrabold"
          style={{
            position: 'absolute',
            visibility: 'hidden',
            pointerEvents: 'none',
            left: 0,
            top: 0,
            width: probeWidth,
            lineHeight: 1,
            textWrap: 'balance',
            hyphens: 'none',
          }}
        >
          {artist}
        </div>
        {/*
          The probe: the same string at the same measure and face, sized in
          turn and never painted. `aria-hidden` and out of flow, so it adds
          no height and is not read.
        */}
        <h1
          ref={probe}
          aria-hidden="true"
          className="font-extrabold tracking-[-0.02em]"
          style={{
            position: 'absolute',
            visibility: 'hidden',
            pointerEvents: 'none',
            left: 0,
            top: 0,
            /*
              **The probe must set on the TITLE's measure, not the holder's.**
              At `width: 100%` it measured 479px where the title sets at 412,
              so "Loss Of Life" fitted two lines at 144 in the probe and took
              three on the page -- the ladder then chose a step that does not
              fit. Set from the rendered title's own box, so the two cannot
              disagree.
            */
            width: probeWidth,
            lineHeight: 0.94,
            textWrap: 'balance',
            hyphens: 'none',
          }}
        >
          {title}
        </h1>
      </div>
      {children}
    </>
  );
}

export { MAX_LINES, STEP_GAP, TITLE_STEPS };
