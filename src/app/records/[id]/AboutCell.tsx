'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ABOUT_CHAR_BUDGET, ABOUT_CLAMP_LINES, ABOUT_LINES } from './about-cell';
import { LABEL } from './grid-type';

/**
 * The About in the frame's last cell, clamped only when it is longer than
 * the cell's ten lines.
 *
 * §33: "An About longer than ten lines — a hand edit, or one written before
 * this ruling — shows nine lines and more ↓, which opens the lower row's
 * editor with the full text. That is §28's precedent: a link to the rest,
 * never a silent cut."
 *
 * **Lines are measured, not counted from characters.** How many lines a text
 * sets to depends on where its words break, which only the browser knows: a
 * 555-character About renders to ten lines and a 552-character stand-in to
 * eleven. So a hidden, unclamped copy at the same measure is read after
 * paint, and the clamp follows what it says.
 *
 * **On the server the measured budget is the guess.** A long About must not
 * paint unclamped for a frame in a fixed-height cell, so the first render
 * clamps when the text is past `ABOUT_CHAR_BUDGET` and the measurement then
 * corrects it either way. The budget is the floor of the measured range, so
 * the guess errs toward clamping, which the measurement lifts.
 */
export function AboutCell({ text }: { text: string }) {
  const probe = useRef<HTMLParagraphElement>(null);
  const real = useRef<HTMLParagraphElement>(null);
  const [clamped, setClamped] = useState(text.length > ABOUT_CHAR_BUDGET);

  useEffect(() => {
    const el = probe.current;
    if (el === null) return;
    const measure = () => {
      /*
        **The probe must be the paragraph's width, not the cell's.** At
        `left: 0; right: 0` it spanned the cell's padding too -- 358px where
        the paragraph sets on 322 -- so Bitches Brew measured ten lines in
        the probe and drew eleven on the page, unclamped, with the Images
        foot flush to the cell's edge. Same defect as the title probe: a
        probe that is not the element measures something else. Width is
        read off the rendered paragraph so the two cannot disagree.
      */
      const width = real.current?.getBoundingClientRect().width;
      if (width !== undefined && width > 0) el.style.width = `${width}px`;
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
      const lines = Math.round(el.getBoundingClientRect().height / lineHeight);
      setClamped(lines > ABOUT_LINES);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el.parentElement ?? el);
    return () => observer.disconnect();
  }, [text]);

  return (
    <>
      <p
        ref={real}
        data-field="about"
        data-clamped={clamped ? '' : undefined}
        className="text-prose mt-[6px]"
        style={
          clamped
            ? { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: ABOUT_CLAMP_LINES, overflow: 'hidden' }
            : undefined
        }
      >
        {text}
      </p>
      {clamped && (
        /* The lower row is the About's editor; its Section carries id="snippet". */
        <Link href="#snippet" data-field="about-more" className={`${LABEL} mt-[2px] block`}>
          more ↓
        </Link>
      )}
      {/* The unclamped copy the measurement reads: same measure, never painted. */}
      <p
        ref={probe}
        aria-hidden="true"
        className="text-prose"
        style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none', left: 0, top: 0 }}
      >
        {text}
      </p>
    </>
  );
}
