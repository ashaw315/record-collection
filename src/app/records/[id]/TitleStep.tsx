'use client';

import { useEffect, useRef, useState } from 'react';
import { BANDS } from './band-geometry';
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
      /* The measure the title actually sets on. */
      const titleBox = real.current?.getBoundingClientRect();
      if (titleBox !== undefined && titleBox.width > 0) {
        measure.style.width = `${titleBox.width}px`;
        setProbeWidth(titleBox.width);
      }

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
      const cell = el.closest('[data-cell="identity"]');
      if (cell === null) return;

      /*
        The supply is the cell's own inner height; the demand at a step is
        everything the cell holds with the title at that size. Measured on a
        probe that carries the real title text at the real measure, so the
        line count is the one the browser will actually produce.
      */
      const supply = BANDS.identity;
      const below = el.nextElementSibling?.getBoundingClientRect().height ?? 0;

      /*
        **The line height is DERIVED from the size, not read back.**

        `line-height: 0.94` is unitless, so the computed value depends on the
        font size that is being varied -- reading it back mid-probe gave the
        ratio against the wrong size and the count came out low. At 144 the
        title measured 406px and was reported as two lines when it is three,
        which is exactly the step §33 says fails.
      */
      const LINE = 0.94;
      const linesAt = (size: number) => {
        measure.style.fontSize = `${size}px`;
        return Math.round(measure.getBoundingClientRect().height / (size * LINE));
      };
      const demandAt = (size: number) => {
        measure.style.fontSize = `${size}px`;
        return measure.getBoundingClientRect().height + artistStep(size) + below;
      };

      const chosen = titleStep({ linesAt, demandAt, supply });
      measure.style.fontSize = '';
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
