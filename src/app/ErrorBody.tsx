'use client';

import { HAIRLINE, INK, LABEL_TYPE } from '@/app/records/[id]/grid-type';

/**
 * What a page that failed draws (step 142, Design, 12 Oct): "the 40 heading
 * Something went wrong., one sentence in the label colour saying the page
 * could not load, and two §9.3 controls: TRY AGAIN, and the way back to the
 * Collection." "With no ornament and no figure. The app's own failure is not
 * a place for decoration. The heading names no route, because the sentence
 * and the controls carry it."
 *
 * One body for both boundaries: `error.tsx` sets it under the app's header,
 * and `global-error.tsx`, for a failure of the header or the layout itself,
 * "draws the same heading, sentence and controls on paper with no header".
 *
 * The way back is a plain anchor and not the router's link: where this is
 * drawn something has already failed, and a full load of `/` asks nothing
 * of what failed. TRY AGAIN is absent only where there is nothing to retry
 * with (the probe's stand-in for the bare fallback).
 */
const CONTROL = `${LABEL_TYPE} ${INK} box-border flex h-[44px] items-center justify-center border ${HAIRLINE} px-[18px] decoration-1 underline-offset-[3px] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground`;

export function ErrorBody({ retry }: { retry?: () => void }) {
  return (
    <div data-error-screen="">
      <h1 className="font-heading text-headline font-semibold tracking-tight">Something went wrong.</h1>
      <p className="mt-1 text-prose text-[oklch(0.44_0.008_70)]">This page could not load.</p>
      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" onClick={() => (retry === undefined ? window.location.reload() : retry())} className={`${CONTROL} bg-transparent`}>
          Try again
        </button>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full load, on purpose: see above. */}
        <a href="/" className={CONTROL}>
          Collection
        </a>
      </div>
    </div>
  );
}
