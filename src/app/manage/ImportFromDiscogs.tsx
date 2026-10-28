'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DisclosureMark } from '@/app/disclosure-mark';
import { INK, LABEL_TYPE } from '@/app/records/[id]/grid-type';
import type { CollectionReport } from '@/lib/db/queries/collection-import';
import { parseApiError } from '@/lib/api/messages';
import { failureSentence, reportLines } from './import-report';

/**
 * Step 158, §T.6 (Design, 28 Oct): the Discogs collection import on Manage
 * (SPEC §12 step 18 unit E, §5 `POST /api/discogs/import-collection`).
 *
 * "A section of its own between hairlines, below the duplicate review and
 * above the section names": it acts on the whole collection, so it stands
 * with the page-level things beneath the heading, after the review because
 * an import can add to it. The control is IMPORT FROM DISCOGS, "a §9.3
 * label, as ADD RECORD is"; while the import runs it reads IMPORTING… at
 * the label's drawn width, the longer reading reserved beneath as SEARCH
 * DISCOGS reserves its own (step 150), and it cannot be pressed again. The
 * report is drawn beneath the control and a later import replaces it.
 *
 * The report lives in this component's state and nowhere else: §T.6 leaves
 * whether it survives leaving Manage unruled, and today it does not. After
 * a run the page is refreshed, so the artist list and the duplicate review
 * show what the import added.
 */
export function ImportFromDiscogs() {
  const router = useRouter();
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<CollectionReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setImporting(true);
    setError(null);
    try {
      const response = await fetch('/api/discogs/import-collection', { method: 'POST' });
      if (!response.ok) {
        const failure = parseApiError(await response.json().catch(() => null));
        setError(failure?.message ?? 'The import could not be started.');
        return;
      }
      setReport((await response.json()) as CollectionReport);
      router.refresh();
    } catch {
      setError('Could not reach the server. Nothing was imported.');
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
        onClick={() => void run()}
        className={`${LABEL_TYPE} ${INK} grid min-h-[44px] items-center text-left decoration-1 underline-offset-[3px] hover:underline disabled:no-underline pointer-coarse:leading-[44px]`}
      >
        <span aria-hidden="true" className="invisible col-start-1 row-start-1">Import from Discogs</span>
        <span data-import-reading="" className="col-start-1 row-start-1">{importing ? 'Importing…' : 'Import from Discogs'}</span>
      </button>

      {report !== null && <ImportReport report={report} />}

      {error !== null && (
        <p role="alert" data-import-error="" className="mt-2 text-meta text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

/**
 * The three lines, each list under §T.1's + and closed to start, "so a long
 * report never pushes the section names out of view"; a part with nothing
 * keeps its line at 0 with no +.
 */
export function ImportReport({ report }: { report: CollectionReport }) {
  const failure = failureSentence(report);
  return (
    <>
      <ul data-import-report="" className="mt-3 text-meta">
        {reportLines(report).map((line) => (
          <li key={line.key} data-import-line={line.key} className="mt-1 first:mt-0">
            {line.count === 0 ? (
              <p data-import-summary="" className="inline-flex min-h-[24px] items-center pointer-coarse:min-h-[44px]">{line.sentence}</p>
            ) : (
              <details className="group">
                <summary data-import-summary="" className="inline-flex min-h-[24px] cursor-pointer list-none items-center gap-2 underline-offset-2 hover:underline pointer-coarse:min-h-[44px] [&::-webkit-details-marker]:hidden">
                  {line.sentence}
                  <DisclosureMark open="details" />
                </summary>
                <ul data-import-items="" className="mt-1 mb-2 ml-[18px] text-muted-foreground">
                  {line.items.map((item, i) => (
                    <li key={i} className="py-0.5">{item}</li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>
      {failure !== null && (
        <p role="alert" data-import-error="" className="mt-2 text-meta text-destructive">
          {failure}
        </p>
      )}
    </>
  );
}
