import { LABEL_INK } from '@/app/records/[id]/grid-type';
import { PAPER_CSS } from '@/lib/colour/paper';
import { notFound } from 'next/navigation';
import { ConstructionStill } from '@/app/records/[id]/ConstructionStill';
import { listRecordsForSheet } from '@/lib/db/queries/records';

/**
 * **The sheet: every real record's construction, side by side and still.**
 *
 * Both of the generator's faults — the centre-weighted cluster and the narrow
 * size band — were invisible until tiles sat next to each other, and a sheet is
 * the only instrument that has caught anything in this generator. So it exists
 * as a route rather than as a one-off capture, and it draws the REAL ids: a
 * synthetic id exercises the hash but not the collection.
 *
 * 404s in production; comes out with the other harnesses.
 */
export const dynamic = 'force-dynamic';

export default async function ConstructionSheetPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  const records = await listRecordsForSheet();

  return (
    <main className="p-[20px]">
      <h1 className="mb-[14px] font-mono text-[11px] tracking-[0.10em] uppercase">
        Construction sheet · {records.length} records · one frame, forms move inside it
      </h1>
      <div className="grid grid-cols-6 gap-[10px]">
        {records.map((record) => (
          <figure key={record.id} data-sheet-tile={record.id} className="m-0">
            <div
              className="border border-border"
              style={{ aspectRatio: '300 / 340', background: PAPER_CSS }}
            >
              <ConstructionStill recordId={record.id} spineColour={record.spineColour} />
            </div>
            <figcaption className="mt-[4px] font-mono text-[10px]" style={{ color: LABEL_INK }}>
              {record.title.slice(0, 22)}
            </figcaption>
          </figure>
        ))}
      </div>
    </main>
  );
}
