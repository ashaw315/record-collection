'use client';

import { useEffect, useRef, useState } from 'react';
import { STEP_GAP, TITLE_PAIRS, TITLE_STEPS, artistStep, fieldHeight, titlePair } from './title-steps';

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
      const block = el.parentElement;
      const track = el.closest('[data-track="content"]');
      if (!(cell instanceof HTMLElement) || block === null || track === null) return;
      const cellStyle = getComputedStyle(cell);
      /* §40: the cell may be taller than the band's 1440 constant above the fork; the supply never is. */
      /*
        §45 (step 53): both axes are the RENDERED track, at every window. The
        supply is the content track's inner height (the cell's, less its
        padding; the track fills the cell's row) and the measure is the track's
        width. Two constants stood here, 510 and 412 -- "a figure written at
        one size and never re-derived" -- and the ladder chose on height alone,
        so Gaucho set 512 wide in a 412 box at 144.
      */
      const supply = cell.clientHeight - parseFloat(cellStyle.paddingTop) - parseFloat(cellStyle.paddingBottom);
      const measureWidth = track instanceof HTMLElement ? track.clientWidth : 0;
      const outer = (child: Element) => {
        const b = child.getBoundingClientRect();
        const s = getComputedStyle(child);
        return b.height + parseFloat(s.marginTop) + parseFloat(s.marginBottom);
      };
      /*
        Everything the track holds besides this holder: the title block's
        other children (the eyebrow) AND the track's other blocks (the
        pressing block). This read `el.parentElement`'s children only -- the
        title block's -- so `below` was the 17px eyebrow and never the
        pressing block, and a three-line title stepped to 96 at a demand of
        485 in 511 that rendered at 588. The line cap masked it: every step
        that overflowed also set in four lines, and §33 withdrew the cap.
        `e2e/title-ladder-33.spec.ts` now reads `below` off the page.
      */
      /* §45's tint field is the gap made visible -- ground, not demand. Summed, it read as content and the ladder fell to 72/40 on every record with a ladder (found 29 Sep). Marks and ground are never demand. */
      const below = [
        ...Array.from(block.children).filter((child) => child !== el),
        ...Array.from(track.children).filter((child) => child !== block && !child.matches('[data-mark], [data-ground]')),
      ].reduce((sum, child) => sum + outer(child), 0);

      /* The title's measure. */
      if (measureWidth > 0) {
        measure.style.width = `${measureWidth}px`;
        if (artistProbe.current !== null) artistProbe.current.style.width = `${measureWidth}px`;
        setProbeWidth(measureWidth);
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
      /* The widest line the title sets at a size: a word wider than the measure is the width term's refusal. */
      const widestAt = (size: number) => {
        measure.style.fontSize = `${size}px`;
        let widest = 0;
        const walk = (node: Node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            const range = document.createRange();
            range.selectNodeContents(node);
            for (const rect of range.getClientRects()) widest = Math.max(widest, rect.width);
          } else node.childNodes.forEach(walk);
        };
        walk(measure);
        return widest;
      };
      const overflowsAt = (size: number) => widestAt(size) > measureWidth + 0.5;
      const artistLinesAt = (artistSize: number) => {
        if (artistMeasure === null) return 1;
        artistMeasure.style.fontSize = `${artistSize}px`;
        return Math.max(1, Math.round(artistMeasure.getBoundingClientRect().height / artistSize));
      };
      const seen = TITLE_PAIRS.map((pair) => ({ size: pair.title, artist: pair.artist, lines: linesAt(pair.title), demand: Math.round(demandAt(pair.title)), widest: Math.round(widestAt(pair.title) * 10) / 10, artistLines: artistLinesAt(pair.artist) }));
      const pair = titlePair({ demandAt, supply, overflowsAt, artistLinesAt });
      /*
        The field's terms, from the SAME probe measurements the pair was chosen
        on, before the probes are reset: the title stack is the title and the
        artist at the chosen pair, and the gap is what the supply leaves after
        the chosen demand and the ladder's own STEP_GAP. Reading the rendered
        ground instead sized the field on the first pass against the initial
        step, and until the observer fired the field sat under the title that
        had since grown -- page8a-marks caught it covering "Grave New World"
        by 86px on the probe page.
      */
      const chosenDemand = demandAt(pair.title);
      const titleH = measure.getBoundingClientRect().height;
      const artistH = artistMeasure === null ? artistStep(pair.title) : artistMeasure.getBoundingClientRect().height;
      const fieldTerms = { gap: supply - chosenDemand - STEP_GAP, stack: titleH + artistH };
      measure.style.fontSize = '';
      if (artistMeasure !== null) artistMeasure.style.fontSize = '';
      el.setAttribute(
        'data-ladder',
        JSON.stringify({ supply, measure: measureWidth, below: Math.round(below), steps: seen, chosen: pair.title, pair: { title: pair.title, artist: pair.artist }, artistLowered: pair.artistLowered, fonts: document.fonts.status }),
      );
      setStep(pair.title);
      /*
        §49 (step 57), re-bounded by §50 and §52 (step 58): the tint field,
        sized from the type and the mark. Its ground wrapper is the flex
        leftover between the blocks; the paint hangs STEP_GAP below the title
        block (§51, step 59) and is the smallest of the gap the ladder leaves, the title
        stack (this host: title and artist) and the construction's minimum ink
        over the field's width, which the server computed from the record's
        own scene and stamped on the paint. Past 4 : 1 nothing is drawn: a
        band that thin reads as a rule, and a 1px ground over the hairline
        read as a double rule, not a plane.
      */
      const ground = track.querySelector<HTMLElement>('[data-ground]');
      const field = ground?.querySelector<HTMLElement>('[data-mark="identityField"]') ?? null;
      if (ground !== null && field !== null) {
        const cap = Number(field.getAttribute('data-field-cap'));
        const sized = fieldHeight({ gap: fieldTerms.gap, stack: fieldTerms.stack, cap: Number.isFinite(cap) ? cap : 0 });
        /* Suppressed is zero height IN the box, not display none: a mark taken out of layout reads as a zero rect at the page's origin, which page8a-marks reports as escaping its cell. */
        /* Floored to the tenth, never rounded: §50 says at most the ink, and rounding up by 0.05 put Gaucho 17px² over it. */
        field.style.height = sized.drawn ? `${Math.floor(sized.height * 10) / 10}px` : '0px';
        field.setAttribute('data-field-state', sized.drawn ? 'drawn' : 'suppressed');
        field.setAttribute('data-field-term', sized.term);
        field.setAttribute('data-field-gap', String(Math.round(fieldTerms.gap * 10) / 10));
        field.setAttribute('data-field-stack', String(Math.round(fieldTerms.stack * 10) / 10));
        field.setAttribute('data-field-aspect', Number.isFinite(sized.aspect) ? sized.aspect.toFixed(2) : 'none');
      }
    };

    choose();
    const observer = new ResizeObserver(choose);
    observer.observe(el.parentElement ?? el);
    const track = el.closest('[data-track="content"]');
    if (track !== null) observer.observe(track);
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

export { STEP_GAP, TITLE_STEPS };
