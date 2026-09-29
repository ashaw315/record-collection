'use client';

import Link from 'next/link';
import { useLayoutEffect, useRef, useState } from 'react';
import { contentHeight, genresRun, shouldCollapse, type Genre } from './genres-run';

/**
 * The format line and the genres run, as one component because §4.2's collapse
 * moves content from the second onto the first.
 *
 * **A client component because the collapse is decided by layout.** Whether the
 * content overflows its cell is not known until the title has wrapped, and a
 * server component cannot know how many lines a 72px title takes in a 412px
 * measure. So it renders the run in full, measures once the cell has laid out,
 * and collapses if the content still does not fit — which is exactly §4.2's
 * order: the gap and the ornament track have already given by the time this
 * measures anything.
 *
 * Re-measured on resize, and stable across it: the run's own height is
 * remembered from the expanded render, so a collapsed cell can ask "would it
 * fit if I put the run back?" without putting it back.
 */
export function GenresRun({
  formatLine,
  genres,
  editHref,
  runClassName,
}: {
  formatLine: string | null;
  genres: readonly Genre[];
  /** The pressing editor the count opens. */
  editHref: string;
  runClassName: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const runHeight = useRef(0);
  const collapsedRef = useRef(false);

  useLayoutEffect(() => {
    const el = host.current;
    if (el === null || genres.length === 0) return;

    const content = el.closest('[data-track="content"]');
    /*
      **By name, not by position.** This was `content.parentElement`, which
      is the right box for the wrong reason: two elements carried
      `data-cell="identity"` and the relationship held only because the inner
      grid happened to be the track's parent.
    */
    const cell = content?.closest('[data-cell="identity-content"]');
    if (!(content instanceof HTMLElement) || !(cell instanceof HTMLElement)) return;

    const measure = () => {
      const style = getComputedStyle(cell);
      const available =
        cell.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);

      /* Remember what the run costs while it is on the page. */
      if (!collapsedRef.current) {
        const run = el.querySelector<HTMLElement>('[data-field="genres"]');
        if (run !== null) {
          const runStyle = getComputedStyle(run);
          runHeight.current = run.offsetHeight + parseFloat(runStyle.marginTop);
        }
      }

      /*
        **The demand is the children's sum (Adam's ruling, 24 Sep).** The
        track is a flex column with `justify-content: space-between`, so it
        always fills its row and turns the remainder into a gap — its height
        and its `scrollHeight` both report the budget rather than the demand,
        and measured on the route the collection's worst title and an
        ordinary record came out 512 and 511, one pixel apart for records
        274px apart in content.

        §4.2's mechanism gives the measure: the pressing block anchors to the
        floor, the title flows from the top, and "the two can never push each
        other" holds because the gap absorbs the title's growth. A gap that
        absorbs growth has a minimum of zero, so the demand is the two blocks
        on their own heights.
      */
      const needed =
        contentHeight({
          /* §45's tint field is the gap made visible -- ground, not demand. Summed, it filled the track and read as "exactly fitting", which collapsed the run on every record with room (29 Sep). Marks are never demand. */
          childHeights: Array.from(content.children).filter((child) => !child.matches('[data-mark], [data-ground]')).map((child) => {
            const box = child.getBoundingClientRect();
            const childStyle = getComputedStyle(child);
            return box.height + parseFloat(childStyle.marginTop) + parseFloat(childStyle.marginBottom);
          }),
        }) + (collapsedRef.current ? runHeight.current : 0);

      /*
        §28: the give order applies only where the band has a fixed height.
        Read from the BAND rather than assumed from a width, so the fork's
        own stylesheet decides and this cannot drift from it.
      */
      const band = cell.closest('[data-band]');
      /*
        **Whether the band's DECLARED height is the one it got.** §18's fork
        overrides `height` with `auto !important` in the stylesheet, which
        leaves the inline attribute saying 547 while the box renders at 387 —
        so neither `style.height` nor a width threshold answers this. The
        band is on its fixed height only when the two agree.
      */
      const declared = band instanceof HTMLElement ? parseFloat(band.style.height) : Number.NaN;
      const fixedHeight =
        band instanceof HTMLElement &&
        !Number.isNaN(declared) &&
        Math.abs(band.getBoundingClientRect().height - declared) < 1;

      const next = shouldCollapse({ needed, available, fixedHeight });
      if (next !== collapsedRef.current) {
        collapsedRef.current = next;
        setCollapsed(next);
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(cell);
    return () => observer.disconnect();
  }, [genres.length]);

  const run = genresRun(genres, collapsed);

  return (
    <div ref={host} className="contents">
      {formatLine !== null && (
        <div data-field="format" className="text-prose font-medium">
          {formatLine}
          {run.hidden > 0 && (
            /*
              The count, appended to a line already set so it costs no height.
              Underlined and opening the pressing editor — the page's vocabulary
              for a fact that exists and is not shown, shared with the frame's
              `Images N Manage →` line.
            */
            <>
              {' · '}
              <Link href={editHref} className="underline underline-offset-2">
                <span data-field="genre-count">{run.hidden}</span>
                {run.hidden === 1 ? ' genre' : ' genres'}
              </Link>
            </>
          )}
        </div>
      )}
      {run.shown.length > 0 && (
        <div data-field="genres" className={runClassName}>
          {run.shown.map((genre, index) => (
            <span key={genre.id}>
              {index > 0 && ', '}
              <Link href={`/?genreId=${genre.id}`} className="underline-offset-2 hover:underline">
                {genre.name}
              </Link>
            </span>
          ))}
        </div>
      )}
      {formatLine === null && run.hidden > 0 && (
        /* No format line to append to: the count stands where the run stood. */
        <div className="text-prose">
          <Link href={editHref} className="underline underline-offset-2">
            <span data-field="genre-count">{run.hidden}</span>
            {run.hidden === 1 ? ' genre' : ' genres'}
          </Link>
        </div>
      )}
    </div>
  );
}
