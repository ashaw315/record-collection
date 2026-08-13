import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';
import { DeleteRecord } from './DeleteRecord';
import { ImageGallery } from './ImageGallery';
import { MarketPanel } from '@/app/market/MarketPanel';
import { PriceHistory } from './PriceHistory';
import { RecordJournal } from './RecordJournal';
import { RecordDetail } from './RecordDetail';
import { listPricesForRecord } from '@/lib/db/queries/prices';
import { hydrateRecord } from '@/lib/db/queries/records';
import { isUuid } from '@/lib/api/errors';

/**
 * SPEC.md §10 `/records/:id`.
 *
 * Reads on the server through the same `hydrateRecord` the §5.2 endpoint uses,
 * rather than fetching its own JSON: one query layer, one shape, and no chance
 * of the screen and the API disagreeing about what a record is.
 */

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/records/[id]'>) {
  const { id } = await params;
  if (!isUuid(id)) return { title: 'Record not found · Record Collection' };

  const record = await hydrateRecord(id);
  if (record === undefined) return { title: 'Record not found · Record Collection' };

  // The tab title is how you tell two open records apart.
  return { title: `${record.artist.name} – ${record.title} · Record Collection` };
}

export default async function RecordPage({ params, searchParams }: PageProps<'/records/[id]'>) {
  const { id } = await params;
  const { cover } = await searchParams;

  /**
   * A non-UUID is a 404, not a 500.
   *
   * Without this the id reaches Postgres and fails the uuid cast, which
   * surfaces as a server error on a page — a blank screen rather than the
   * "not found" this actually is. The §5.2 endpoint returns 400 for the same
   * input because a caller sending nonsense should be told; a PERSON following
   * a stale link is better served by the not-found page, and the distinction is
   * the same one parseCollectionParams makes.
   */
  if (!isUuid(id)) notFound();

  const record = await hydrateRecord(id);
  if (record === undefined) notFound();

  /**
   * The FULL history, not §5.2's hydrated `latestPrice`.
   *
   * The hydrated read returns one row by design — the detail screen's headline
   * figure. §10's sparkline needs every observation, and this is a server
   * component, so it is one more query rather than a client fetch.
   */
  const prices = await listPricesForRecord(id);

  return (
    <>
      <AppHeader />

      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        {/* Back to the collection, not browser-back: the reader may have
            arrived from a link or a fresh tab, where back goes nowhere useful. */}
        <Link
          href="/"
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          ← Collection
        </Link>

        <div className="mt-3 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <RecordDetail record={record} />

            {/*
              §10's "images gallery". Rendered here rather than inside
              RecordDetail because it is interactive — uploads and deletes make
              it a client component, and RecordDetail is a server component that
              formats already-fetched facts.
            */}
            {/*
              Said plainly, and only on a genuine failure.
              
              The import never fails over a cover (§5.7) — but never failing is
              not the same as never telling. Without this the record saves, the
              gallery is empty, and nothing distinguishes "Discogs had no cover"
              from "we tried and could not". The second is retryable, and worth
              a sentence.
            */}
            {cover === 'failed' && (
              <p
                data-testid="cover-notice"
                role="status"
                className="mt-6 rounded-xs border border-border px-3 py-2 text-sm text-muted-foreground"
              >
                The cover art could not be fetched from Discogs. The record saved normally — you
                can add an image below.
              </p>
            )}

            <ImageGallery recordId={id} images={record.images} />

            {/*
              §10's journal. After the gallery because the images describe the
              object and the journal describes living with it.
            */}
            {/*
              Before the journal: the sparkline is about the object's value,
              which sits with the other facts, while the journal is about
              living with it.
            */}
            {/*
              §10a's third placement: "Has this appreciated since I bought it?"
              — the market beside what was PAID, which sits in Acquisition above.
              Auto-loaded because this is one record the user already owns, not
              a list.
            */}
            <MarketPanel
              discogsReleaseId={record.pressing?.discogsReleaseId ?? null}
              label="What it goes for now"
              autoLoad
            />

            <PriceHistory
              observations={prices.map((row) => ({
                id: row.id,
                price: row.price,
                priceType: row.priceType ?? 'used',
                recordedAt: row.recordedAt,
              }))}
            />

            <RecordJournal
              recordId={id}
              entries={record.journalEntries.map((entry) => ({
                id: entry.id,
                entryDate: entry.entryDate,
                note: entry.note,
              }))}
            />
          </div>
          {/*
            Delete sits UNDER Edit and reads as a link rather than a button:
            §7.3's precedent is that a destructive action must be deliberate,
            and giving it the same visual weight as Edit invites the misclick
            the confirmation then has to catch.
          */}
          <div className="mt-1 flex shrink-0 flex-col items-end">
            <Link
              href={`/records/${id}/edit`}
              className="rounded-xs border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
            >
              Edit
            </Link>
            <DeleteRecord
              recordId={id}
              title={record.title}
              imageCount={record.images.length}
              journalCount={record.journalEntries.length}
            />
          </div>
        </div>
      </main>
    </>
  );
}
