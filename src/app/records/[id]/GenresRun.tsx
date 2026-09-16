'use client';

import Link from 'next/link';
import { useLayoutEffect, useRef, useState } from 'react';
import { genresRun, shouldCollapse, type Genre } from './genres-run';

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
    const cell = content?.parentElement;
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

      /* The content's full height with the run shown, whichever state it is in. */
      const needed = content.scrollHeight + (collapsedRef.current ? runHeight.current : 0);

      const next = shouldCollapse({ needed, available });
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
