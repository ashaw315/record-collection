import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';
import { DeleteRecord } from './DeleteRecord';
import { ImageGallery } from './ImageGallery';
import { MarketPanel } from '@/app/market/MarketPanel';
import { PriceHistory } from './PriceHistory';
import { SnippetPanel } from './SnippetPanel';
import { isAnthropicConfigured } from '@/lib/llm/client';
import { RecordJournal } from './RecordJournal';
import { RecordDetail } from './RecordDetail';
import { RecordPage8a } from './RecordPage8a';
import { pressingLine } from './page-record';
import { recordLadder } from '@/lib/colour/record-ladder';
import { MAX_GRID_WIDTH } from './band-geometry';
import { LABEL } from './grid-type';
import { marketFigures } from './market-median';
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

  /* §4's 40px figure, and it must be the number it claims to be. */
  const figures = marketFigures(prices.map((row) => row.price));

  /*
    §5.5's base step, derived once here and passed down: the frame draws from it
    and §9.3's rail bars take the same value, so the colour below the fold is
    the colour above it rather than a second derivation that could drift.

    Null when the record has no cover — §5.3 keeps the coverless record's marks
    but the ladder has no hue to invent, so those sections draw no bar.
  */
  const ladderBase = recordLadder(record.spineColour)?.base ?? null;

  return (
    <>
      <AppHeader />

      {/*
        **No padding above 8a, and nothing between it and the nav.**

        8a's four bands budget the 900px screen exactly — 53 of nav and 847 of
        record — so anything inserted above it pushes the tail below the fold
        while 8a's own height stays correct. Measured on the first run of the
        no-scroll assertion: `py-6`, a `← Collection` link and the controls row
        put 8a at y=145.5 instead of 53, costing 92.5px of a budget with no
        slack.

        The chrome did not have to go: it had to go BELOW the seam, where the
        sections that are meant to scroll already live.
      */}
      <main className="w-full">
        <div>
          <div className="min-w-0">
            {/*
              **8a, on the route rather than on a probe.**

              Every assertion 8a passed was made against `/wall/probe/page8a`,
              which renders this component from literals. The route went on
              rendering `RecordGrid` — so the cap that "was not applying" was a
              probe measured against a screen that never had one, and the three
              symptoms reported from the rendered page (stretched, cover cropped,
              dead band) were all `RecordGrid` having no cap by design.

              The seam is unchanged: 8a covers the top of the screen and the
              gallery, snippet, market and journal below it are as they were.
            */}
            <RecordPage8a
              record={{
                id: record.id,
                title: record.title,
                artistName: record.artist.name,
                artistId: record.artist.id,
                /*
                  Composed by a tested function rather than inline: the probe
                  supplied this as a string, so how it handles four nullable
                  columns was never exercised. See `page-record.test.ts`.
                */
                pressingLine: pressingLine({
                  labelName: record.label?.name ?? null,
                  catalogNumber: record.pressing?.catalogNumber ?? null,
                  countryPressed: record.pressing?.countryPressed ?? null,
                  yearPressed: record.pressing?.yearPressed ?? null,
                }),
                formatLine: record.format?.name ?? null,
                matrixRunout: record.pressing?.matrixRunout ?? null,
                releaseYear: record.releaseYear,
                yearPressed: record.pressing?.yearPressed ?? null,
                genres: record.genres.map((genre) => ({ id: genre.id, name: genre.name })),
                purchasePrice: record.purchasePrice,
                storeName: record.store?.name ?? null,
                conditionMedia: record.conditionMedia,
                conditionSleeve: record.conditionSleeve,
                /* Through `marketFigures`, not `prices[0]` — see below. */
                marketMedian: figures?.median ?? null,
                marketLow: figures?.low ?? null,
                marketHigh: figures?.high ?? null,
                hasDiscogsRelease: record.pressing?.discogsReleaseId != null,
                journalEntry:
                  record.journalEntries.length === 0
                    ? null
                    : {
                        entry: record.journalEntries[0].note,
                        entryDate: String(record.journalEntries[0].entryDate),
                      },
                note: record.notes,
                imageCount: record.images.length,
                coverUrl: record.images.find((image) => image.imageType === 'cover')?.url ?? null,
                spineColour: record.spineColour,
              }}
            />

            {/*
              **The chrome sits below 8a, because the screen above it is spoken
              for.** Edit, Delete and the way back are real controls and none of
              them is in 8a's drawing — its bands are identity / record / tail
              and it draws no controls cell. Putting them here keeps the 900px
              screen whole without inventing a cell to hold them, which would be
              a design decision made to fit an existing control.
            */}
            <div
              data-testid="record-controls"
              className="mx-auto flex items-center justify-between gap-3 px-[14px] py-4"
              style={{ maxWidth: MAX_GRID_WIDTH }}
            >
              {/* Back to the collection, not browser-back: the reader may have
                  arrived from a link or a fresh tab, where back goes nowhere. */}
              <Link
                href="/"
                className="text-meta text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                ← Collection
              </Link>

              <div className="flex items-center gap-3">
                <Link
                  href={`/records/${id}/edit`}
                  className={`${LABEL} no-underline hover:underline`}
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

            {/*
              **`RecordDetail` carries its own measure now**, because it holds
              both a converted §9.1 section — which must reach the composition's
              edge — and the sections still on the old stacked column, which
              still need a reading width. The split lives inside it while the
              conversion is partway done.
            */}
            <RecordDetail record={record} base={ladderBase} />

            {/*
              **No measure wrapper: §9.1 replaced it.** The rail is what holds
              the region together, and a max-width here would inset the section
              rules — making the region's only structural element the wrong kind
              of edge by §3's vocabulary. The old `max-w-3xl` went with the last
              section that needed it.
            */}

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
                className="mt-6 rounded-xs border border-border px-3 py-2 text-prose text-muted-foreground"
              >
                The cover art could not be fetched from Discogs. The record saved normally — you
                can add an image below.
              </p>
            )}

            {/*
              A DIFFERENT sentence, because it is a different fact. Reporting
              this as "could not be fetched from Discogs" blamed a service that
              answered perfectly well, and "you can add an image below" pointed
              at an upload that fails on the same missing token — the one action
              guaranteed not to work.
            */}
            {cover === 'unconfigured' && (
              <p
                data-testid="cover-notice-unconfigured"
                role="status"
                className="mt-6 rounded-xs border border-border px-3 py-2 text-prose text-muted-foreground"
              >
                The record saved normally, but this deployment has no image storage configured, so
                no cover was kept and uploads are unavailable.
              </p>
            )}

            <ImageGallery recordId={id} images={record.images} base={ladderBase} />

            {/*
              §10b's snippet. Between the gallery and the journal deliberately:
              the images describe the object, the snippet describes the MUSIC,
              and the journal describes living with it — outward-in.
            */}
            <SnippetPanel
              recordId={id}
              snippet={record.snippet}
              snippetEditedAt={record.snippetEditedAt}
              configured={isAnthropicConfigured()}
              base={ladderBase}
            />

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
              base={ladderBase}
              // The same id the panel above is built from, so the empty state
              // cannot point at a control that did not render.
              hasMarketPanel={record.pressing?.discogsReleaseId != null}
              observations={prices.map((row) => ({
                id: row.id,
                price: row.price,
                /**
                 * No `?? 'used'` fallback. `price_type` is NOT NULL in the
                 * database and `.notNull()` in Drizzle, so `row.priceType` is
                 * non-nullable and the branch was unreachable — and it defaulted
                 * to the ONE type §7.6 sums into estimated value, so a null
                 * arriving here would have become evidence of what a record is
                 * worth. Dead, and wrong in the direction that inflates.
                 */
                priceType: row.priceType,
                recordedAt: row.recordedAt,
              }))}
            />

            <RecordJournal
              base={ladderBase}
              recordId={id}
              entries={record.journalEntries.map((entry) => ({
                id: entry.id,
                entryDate: entry.entryDate,
                note: entry.note,
              }))}
            />
          </div>
        </div>
      </main>
    </>
  );
}
