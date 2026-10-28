'use client';

import { useRouter } from 'next/navigation';
import { useState, useSyncExternalStore } from 'react';
import { DisclosureMark } from '@/app/disclosure-mark';
import { INK, LABEL_TYPE } from '@/app/records/[id]/grid-type';
import type { ImportRun } from '@/lib/db/queries/import-runs';
import { parseApiError } from '@/lib/api/messages';
import { lastImportLine, reportLines } from './import-report';

/**
 * Steps 158 and 159, §T.6 (Design, 28 Oct): the Discogs collection import on
 * Manage (SPEC §12 step 18 unit E, §5 `POST /api/discogs/import-collection`).
 *
 * "A section of its own between hairlines, below the duplicate review and
 * above the section names." The control is IMPORT FROM DISCOGS, "a §9.3
 * label, as ADD RECORD is"; while the import runs it reads IMPORTING… at
 * the label's drawn width, the longer reading reserved beneath as SEARCH
 * DISCOGS reserves its own (step 150), and it cannot be pressed again.
 *
 * The report is four lines in one form (step 159), each a disclosure on
 * §T.6's 44 line under both pointers in the type of Manage's row names, its
 * list closed to start, its entries in the second lines' type and colour.
 * A run that fails as a whole draws no lines: it takes the section's one
 * failure line in the reserved slot, as look up's credential line does
 * (step 150), and the last report stays beneath it. The report survives
 * leaving Manage: the page reads the last run and passes it here, drawn
 * beneath the line naming when it finished; the next run replaces it.
 */
export function ImportFromDiscogs({ lastRun }: { lastRun: ImportRun | null }) {
  const router = useRouter();
  const [importing, setImporting] = useState(false);
  const [run, setRun] = useState<ImportRun | null>(lastRun);
  const [failure, setFailure] = useState<string | null>(null);

  async function start() {
    setImporting(true);
    setFailure(null);
    try {
      const response = await fetch('/api/discogs/import-collection', { method: 'POST' });
      if (!response.ok) {
        const error = parseApiError(await response.json().catch(() => null));
        setFailure(error?.message ?? 'The import could not be started.');
        return;
      }
      setRun((await response.json()) as ImportRun);
      router.refresh();
    } catch {
      setFailure('Could not reach the server. Nothing was imported.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <section data-testid="discogs-import" className="mb-5 border-y border-border py-4">
      {/*
        A §9.3 label: the label type in ink, no box, its 44 line under both
        pointers. `min-h` and not `h`, with the line set to 44 under a coarse
        pointer, so a wrapped label is 44 a line as the section names are.
        The longer reading is reserved unseen in the same cell, so IMPORTING…
        does not narrow the control.
      */}
      <button
        type="button"
        data-import-control=""
        disabled={importing}
        onClick={() => void start()}
        className={`${LABEL_TYPE} ${INK} grid min-h-[44px] items-center text-left decoration-1 underline-offset-[3px] hover:underline disabled:no-underline pointer-coarse:leading-[44px]`}
      >
        <span aria-hidden="true" className="invisible col-start-1 row-start-1">Import from Discogs</span>
        <span data-import-reading="" className="col-start-1 row-start-1">{importing ? 'Importing…' : 'Import from Discogs'}</span>
      </button>

      {/* The reserved slot: one line, there before any run, so a whole-run failure moves nothing and the last report stays beneath it. */}
      <p role="status" data-import-status="" title={failure ?? undefined} className="line-clamp-1 min-h-[1lh] text-prose text-destructive">
        {failure ?? null}
      </p>

      {run !== null && <ImportReport run={run} />}
    </section>
  );
}

/** The browser's zone for the run's line; the server renders nothing for it, so the two never disagree. */
const subscribeNever = () => () => undefined;

/**
 * The last run: the line naming when it finished, then the four lines in
 * the drawn order, each a disclosure closed to start under §T.1's +; a part
 * with nothing keeps its line at 0 with no +.
 */
export function ImportReport({ run }: { run: ImportRun }) {
  const when = useSyncExternalStore(subscribeNever, () => lastImportLine(run.finishedAt), () => null);
  return (
    <div data-import-report="">
      {/* Manage's second line's type and colour: the line says which run this is, and is not the answer itself. */}
      <p data-import-when="" className="min-h-[1lh] text-meta text-[oklch(0.44_0.008_70)]">
        <time dateTime={run.finishedAt}>{when}</time>
      </p>
      <ul>
        {reportLines(run.report).map((line) => (
          <li key={line.key} data-import-line={line.key}>
            {line.count === 0 ? (
              /* The 44 line of its siblings, in the row names' type, with no + because there is nothing to open. */
              <p data-import-summary="" className={`inline-flex h-[44px] items-center text-detail ${INK}`}>{line.sentence}</p>
            ) : (
              <details className="group">
                <summary data-import-summary="" className={`inline-flex h-[44px] cursor-pointer list-none items-center gap-2 text-detail ${INK} underline-offset-2 hover:underline [&::-webkit-details-marker]:hidden`}>
                  {line.sentence}
                  <DisclosureMark open="details" />
                </summary>
                {/* An open list's entries take the type and colour of Manage's second lines. */}
                <ul data-import-items="" className="mb-2 ml-[18px] text-meta text-[oklch(0.44_0.008_70)]">
                  {line.items.map((item, i) => (
                    <li key={i} className="py-0.5">{item}</li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
