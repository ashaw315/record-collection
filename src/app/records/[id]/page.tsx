import { displayedCover, imagesShown, newestOfType } from './gallery-order';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';
import { DeleteRecord } from './DeleteRecord';
import { NAV_TYPE } from '@/components/nav-type';
import { ImageGallery } from './ImageGallery';
import { MarketPanel } from '@/app/market/MarketPanel';
import { PriceHistory } from './PriceHistory';
import { ExtendedGrid } from './Section';
import { isAnthropicConfigured } from '@/lib/llm/client';
import { RecordJournal } from './RecordJournal';
import { RecordDetail } from './RecordDetail';
import { RecordPage8a } from './RecordPage8a';
import { pressingLine } from './page-record';
import { recordLadder } from '@/lib/colour/record-ladder';
import { Section } from './Section';
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

  /*
    §25's figures take three of the ladder's steps as faces and §26's flats
    take tint or base, so the sections that host them get the whole ladder.
  */
  const ladder = recordLadder(record.spineColour);

  return (
    <>
      {/*
        §24: the record's two verbs ride the nav's `actions` slot, in this
        order, and this page is the only one that fills it. 11px mono
        uppercase in ink — the nav's own type — so they cost no height. Delete
        record asks before it acts, naming the record, which is how §13's
        worry (the app's only irreversible act in chrome) is kept.
      */}
      <AppHeader
        actions={
          <>
            <Link
              data-control="edit"
              href={`/records/${id}/edit`}
              /* §24: the nav's own type, the header's string itself (step 80). */
              className={`${NAV_TYPE} text-foreground no-underline hover:underline`}
            >
              Edit
            </Link>
            <DeleteRecord
              recordId={id}
              title={record.title}
              imageCount={record.images.length}
              journalCount={record.journalEntries.length}
            />
          </>
        }
      />

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
          {/*
            **The composition's edge, which is what §9.1's rules bleed to.**

            §9.1: section boundaries bleed to the composition's edge — the
            viewport up to the 1728 cap, the capped container beyond it. The cap
            reached the frame and not §9, so at 3440 the frame sat at 1728@856
            while every section below started at 0: one grid rendered at two
            widths, with the frame appearing to start a long way in from the
            left. Invisible at 1440, where the two are identical.

            Capping HERE rather than per section is what makes them one
            composition: the frame and the region share this element, so a
            section cannot bleed to a different edge from the frame above it.
            The rules still run edge to edge — that edge is now the
            composition's rather than the window's.

            `relative` also gives §9.2's edge fields the region to attach to,
            so they leave the composition rather than the viewport.
          */}
          {/*
            **The cap is §30's and lives in the stylesheet.** An inline
            `max-width` beats every rule that lacks `!important`, so a cap
            here pins the page at 1440 and §30's wider grids silently do
            nothing — measured at 1680, where the page stayed 1440.
            `data-page-measure` is what `widePageStylesheet` addresses.
          */}
          <div data-page-measure="" className="relative mx-auto min-w-0">
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
                /* §33: the About is §10b's snippet, `records.snippet`. */
                about: record.snippet,
                aboutEditedAt: record.snippetEditedAt === null ? null : new Date(record.snippetEditedAt).toISOString(),
                /* §62: what the page shows, and the covers it does not; the delete dialog above still counts every row, since it deletes every row. */
                imageCount: imagesShown(record.images).shown,
                earlierCovers: imagesShown(record.images).earlierCovers,
                /* §61: the newest cover, not the first; the shelf (`shelf.ts`) reads the same. */
                coverUrl: displayedCover(record.images)?.url ?? null,
                backUrl: newestOfType(record.images, 'back')?.url ?? null,
                spineColour: record.spineColour,
              }}
              writingConfigured={isAnthropicConfigured()}
            />

            {/*
              **§13 removed the chrome band that sat here.** Edit is on the
              frame's eyebrow line and Delete is the region's last row, so the
              container had nothing left to hold — §8.1 having already deleted
              its only other occupant. Deleting it gives §9's region its height
              back, which is §W.28's move on the shelf arriving here.
            */}

            {/*
              **`RecordDetail` carries its own measure now**, because it holds
              both a converted §9.1 section — which must reach the composition's
              edge — and the sections still on the old stacked column, which
              still need a reading width. The split lives inside it while the
              conversion is partway done.
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

            {/*
              **§26’s five rows.** The region is one twelve-column grid and
              every section is placed into it BY NAME (`region-rows.ts`), so
              source order here is the reading order while the spans are
              §28’s list, stated in one place. The air columns belong to rows
              rather than to sections, so `ExtendedGrid` renders its own.

              §26 also reorders the sections: Market joins Acquisition and
              Tags in row 2, and Images and About drop below Price history.
              The previous order was §10b’s outward-in reading — the images
              describe the object, the snippet the music, the journal living
              with it — which §26’s rows supersede.
            */}
            <ExtendedGrid ladder={ladder}>
              <RecordDetail record={record} base={ladderBase} ladder={ladder} />

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
              {/*
                **The market section, which never got the primitive.** It is
                `pair` by §9.1's shapes — a figure and the action that refreshes
                it — and unmarked by §9.3, because the frame shows the median in
                full and this only refreshes it.

                Wrapped here rather than inside `MarketPanel`: that component is
                shared with `/want-list`, where a row is not a §9 section and has
                no grid to sit on. `labelled={false}` hands the heading to the
                section's label span instead of drawing a second one.
              */}
              {record.pressing?.discogsReleaseId != null && (
                <Section
                  name="market"
                  title="What it goes for now"
                  base={ladderBase}
                  shape="pair"
                  ladder={ladder}
                >
                  <MarketPanel
                    discogsReleaseId={record.pressing?.discogsReleaseId ?? null}
                    label="What it goes for now"
                    labelled={false}
                    autoLoad
                  />
                  <div />
                </Section>
              )}

              <PriceHistory
                base={ladderBase}
                ladder={ladder}
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

              {/* §53 (step 61): Images hosts the base quarter-disc, so it takes the ladder like the sections that carry figures. */}
              <ImageGallery recordId={id} images={record.images} base={ladderBase} ladder={ladder} />
              {/* §53 (step 60a): the About is read and written in the frame's About cell; the lower row is gone. */}
              <RecordJournal
                base={ladderBase}
                ladder={ladder}
                recordId={id}
                /* §33 (d): the note the frame's entry displaced leads this section. */
                leadNote={record.notes ?? null}
                entries={record.journalEntries.map((entry) => ({
                  id: entry.id,
                  entryDate: entry.entryDate,
                  note: entry.note,
                }))}
              />
            </ExtendedGrid>

          </div>
        </div>
      </main>
    </>
  );
}
