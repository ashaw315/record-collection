import Link from 'next/link';
import { deriveRecordColour } from '@/lib/colour/record-colour';
import { gridModules, type Diagonal } from './grid-modules';
import { LABEL } from './grid-type';

/**
 * The record detail's twelve-column grid (7a §2–§5).
 *
 * **A layout change, not a type change (§6).** The previous conversion was
 * role-preserving: every size got a matching role name, nothing moved, and the
 * deployed screen looked identical. So cells merge (six provenance fields become
 * one block), cells move (the year leaves the metadata list and becomes a
 * display module), and cells disappear (labels duplicating their content are
 * dropped rather than restyled).
 *
 * **Rules are borders on the cell that owns them (§2).** NOT a 1px gap with a
 * dark background showing through — that construction makes every rule
 * identical by force, and weight, absence and openings all have to differ per
 * edge. Three states: 6px structural, 1px detail, and **no rule, which is a
 * positive instruction** joining cells that are read together. The failure mode
 * §3 names is an implementer adding a hairline "for consistency" and silently
 * deleting the only device that joins cells.
 *
 * **Every cell and fact carries a stable handle** — `data-cell` and
 * `data-field`. `RecordDetail` had none, so every spec located its facts by
 * visible text; when this grid began stating the same facts, `getByText` became
 * ambiguous and **24 locators broke across six E2E files nobody had opened**.
 * Text is not a handle: it changes when the design changes, and a spec that
 * locates by it fails for reasons unrelated to what it checks. With these, a
 * failing locator means a fact actually MOVED.
 *
 * **The seam.** This covers the top of the screen only. `ImageGallery`,
 * `SnippetPanel` and `DeleteRecord` remain below it, unchanged and unstyled by
 * this grid, so the page reads as half-redesigned by design — the grid is the
 * thing to judge, not the page.
 */

export type GridRecord = {
  title: string;
  artistName: string;
  /** For the artist link: §10 makes "what else by this artist" one click. */
  artistId: string;
  labelName: string | null;
  formatName: string | null;
  catalogNumber: string | null;
  countryPressed: string | null;
  releaseYear: number | null;
  yearPressed: number | null;
  /** Name and id, because §10's "what else is like this" is one click. */
  genres: ReadonlyArray<{ id: string; name: string }>;
  purchasePrice: string | null;
  storeName: string | null;
  conditionMedia: string | null;
  conditionSleeve: string | null;
  marketMedian: string | null;
  marketLow: string | null;
  marketHigh: string | null;
  marketFetchedAt: Date | null;
  hasDiscogsRelease: boolean;
  journalEntry: { entry: string; entryDate: string } | null;
  coverUrl: string | null;
  spineColour: string | null;
};

/** §2: 18px cell padding; header cells 11px/14px. */
const CELL = 'p-[18px]';

/**
 * The diagonal that marks an empty module (§1.3).
 *
 * One line means NOT RECORDED — the owner can fill it. Crossed means NOT
 * APPLICABLE — they cannot, because no Discogs release exists for a market
 * figure to come from. Drawn corner to corner as SVG so it scales with whatever
 * the cell's height turns out to be.
 */
function EmptyModule({
  cell,
  label,
  diagonal,
}: {
  cell: string;
  label: string;
  diagonal: Diagonal;
}) {
  return (
    <div className={`relative ${CELL}`} data-cell={cell} data-diagonal={diagonal}>
      <div className={LABEL}>{label}</div>
      {/*
        **A 1px hard-edged gradient, exactly as the target draws it** —
        `oklch(0.15 0.005 60)`, near-black, at a real pixel width.

        The first version was an SVG `line` at `strokeWidth="0.4"` inside a
        `viewBox="0 0 100 100"` with `preserveAspectRatio="none"`, which scales
        0.4 USER UNITS down to a fraction of a device pixel and anti-aliases to
        a faint grey. It read as a rendering artefact rather than a deliberate
        mark — which is the opposite of §1.3's claim that "three diagonals still
        read as markers". A gradient stop cannot be scaled away like that.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: [
            'linear-gradient(135deg,transparent calc(50% - 0.5px),oklch(0.15 0.005 60) calc(50% - 0.5px),oklch(0.15 0.005 60) calc(50% + 0.5px),transparent calc(50% + 0.5px))',
            ...(diagonal === 'crossed'
              ? [
                  'linear-gradient(45deg,transparent calc(50% - 0.5px),oklch(0.15 0.005 60) calc(50% - 0.5px),oklch(0.15 0.005 60) calc(50% + 0.5px),transparent calc(50% + 0.5px))',
                ]
              : []),
          ].join(','),
        }}
      />
    </div>
  );
}

export function RecordGrid({
  record,
  controls,
}: {
  record: GridRecord;
  /**
   * Edit and Delete, passed in rather than built here: `DeleteRecord` is a
   * client component with a confirmation dialog, and this is a server component
   * that formats facts. The grid owns WHERE they sit; the page owns what they
   * are.
   */
  controls?: React.ReactNode;
}) {
  const modules = gridModules(record);
  const colour = deriveRecordColour(record.spineColour);

  const pressingLine = [record.labelName, record.formatName, record.catalogNumber]
    .filter((part): part is string => part !== null)
    .join(' · ');

  const originLine = [record.countryPressed, record.releaseYear]
    .filter((part): part is string | number => part !== null)
    .join(', ');

  const provenance = [
    record.purchasePrice === null ? null : `Paid $${record.purchasePrice}`,
    record.storeName === null ? null : `at ${record.storeName}`,
    record.conditionMedia === null && record.conditionSleeve === null
      ? null
      : [
          record.conditionMedia === null ? null : `${record.conditionMedia} media`,
          record.conditionSleeve === null ? null : `${record.conditionSleeve} sleeve`,
        ]
          .filter((part): part is string => part !== null)
          .join(', '),
  ].filter((part): part is string => part !== null);

  /*
    §1.1: the provenance/journal edge carries no rule only while BOTH cells have
    content, because they are read as one block. When either empties the
    hairline returns — an empty cell must be bounded on all four sides, or its
    diagonal reads as a line struck through the block above it.
  */
  const joinProvenanceToJournal = !modules.provenance.empty && !modules.journal.empty;

  return (
    /*
      **No outer border, and the rules bleed to the viewport edge.** The first
      version was a bordered card floating in white margins, with every rule
      stopping at its edge — which reads as a panel on a background. §8: "the
      grid is visible and it directs. Rules are not a container." The page is a
      FRAGMENT of a larger grid, so the horizontals run the full width and
      nothing encloses them.

      The negative margin cancels the page's own padding; `page.tsx` keeps its
      max-width for the sections below the grid, so this is the one element that
      escapes it.
    */
    <div
      data-testid="record-grid"
      className="-mx-4 text-[oklch(0.19_0.008_60)]"
    >
      {/* Header: 2 / 8 / 2, a 1px strip under it. */}
      <div className="grid grid-cols-12 gap-0 border-b border-[oklch(0.19_0.008_60)]">
        <div className="col-span-2 px-[14px] py-[11px]">
          <Link href="/" className={`${LABEL} no-underline`}>
            Collection
          </Link>
        </div>
        <div className="col-span-8 px-[14px] py-[11px]" />
        {/*
          **The controls get a CELL** (columns 11–12), rather than floating in
          the right margin unaligned to anything. §2's header is 2/8/2 and this
          is the right-hand 2 — so Edit and Delete sit on the grid like
          everything else, and the 1px header strip runs under them.
        */}
        <div
          data-cell="controls"
          className="col-span-2 flex items-center justify-end gap-3 px-[14px] py-[11px]"
        >
          {controls}
        </div>
      </div>

      {/* Upper band: title/pressing left, the sleeve taking the right half. */}
      <div className="grid grid-cols-12 gap-0">
        <div className="col-span-6">
          {/*
            §3: NO rule between title and pressing — they are read together.
            Adding a hairline here deletes the only device that joins them.
          */}
          <div
            data-cell="identity"
            className={`${CELL} flex min-h-[96px] flex-col justify-end`}
          >
            {/*
              An `h1`, not a div. The old screen's title was the page's only
              level-1 heading, and deleting it left the record with no heading
              at all — which broke two delete specs and, more importantly, left
              a screen-reader user with no way to identify the page. §4 specifies
              this as 13/800; it says nothing about the element, and the heading
              costs nothing visually.
            */}
            <h1 data-field="title" className="text-prose font-extrabold">
              {record.title}
            </h1>
            <div data-field="artist" className="text-prose font-light">
              {/*
                A LINK, as it was before the grid. The deleted header linked the
                artist to the collection filtered by them, and §10 makes "what
                else do I have by this artist" one click rather than a search.
                Weight and size are §4's; only the element changed.
              */}
              <Link
                href={`/?artistId=${record.artistId}`}
                className="underline-offset-2 hover:underline"
              >
                {record.artistName}
              </Link>
            </div>
          </div>

          {modules.pressing.empty ? (
            <EmptyModule cell="pressing" label="Pressing" diagonal={modules.pressing.diagonal} />
          ) : (
            <div
              data-cell="pressing"
              className={`${CELL} flex min-h-[104px] flex-col justify-end`}
            >
              <div className={LABEL}>Pressing</div>
              {pressingLine !== '' && (
                <div data-field="pressing-line" className="text-prose">
                  {pressingLine}
                </div>
              )}
              {originLine !== '' && (
                <div data-field="origin" className="text-prose">
                  {originLine}
                </div>
              )}
              {/*
                **The pressing year, only when it says something the release
                year does not.** §1.2 folds the matching case into the display
                band's label ("Released · pressed the same year"), which leaves
                a DIFFERENT pressing year — or one on a record with no release
                year — with nowhere to appear at all. That is a fact about which
                pressing this is (CLAUDE.md §8), so it cannot silently vanish.
              */}
              {record.yearPressed !== null && !modules.pressing.pressedSameYear && (
                <div data-field="year-pressed" className="text-prose">
                  Pressed {record.yearPressed}
                </div>
              )}
              {modules.pressing.genres.length > 0 && (
                <div data-field="genres" className="text-prose">
                  {/*
                    LINKS, not text. The deleted "Filed under" section rendered
                    genre chips that filtered the collection, and §10 makes
                    "what else is like this" one click — dropping that was a
                    capability loss the grid's plain text would have hidden.
                    Set inline at 13px so §4's placement is unchanged.
                  */}
                  {modules.pressing.genres.map((genre, index) => (
                    <span key={genre.id}>
                      {index > 0 && ', '}
                      <Link href={`/?genreId=${genre.id}`} className="underline-offset-2 hover:underline">
                        {genre.name}
                      </Link>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/*
          §3's 6px structural vertical at the column-7 boundary: everything
          right of it is the record's own material. Not decoration — heavy
          weight must not be applied to a new edge without a claim of that kind.
        */}
        <div className="col-span-6 row-span-2 border-l-[6px] border-[oklch(0.19_0.008_60)]">
          {record.coverUrl !== null && (
            /*
              A plain `img`: the cover is a blob URL of unknown intrinsic size,
              and §7 records that Discogs caps at 600px — so there is no larger
              source for `next/image` to serve and nothing to optimise toward.
            */
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={record.coverUrl} alt="" className="block h-auto w-full" />
          )}
        </div>
      </div>

      {/* The display band: the 72 inside the filled module (§4, §5). */}
      <div className="grid grid-cols-12 gap-0">
        <div
          data-cell="year"
          className={`col-span-6 ${CELL} flex min-h-[186px] flex-col justify-end border-t-[6px] border-[oklch(0.19_0.008_60)]`}
          style={colour === null ? undefined : { background: colour.fill }}
        >
          <div className={LABEL}>
            {modules.pressing.pressedSameYear ? 'Released · pressed the same year' : 'Released'}
          </div>
          {/*
            §4: the 72 sits directly below its 11px label with nothing between
            them. The order is part of the placement — small label first, large
            figure beneath.
          */}
          <div data-field="year" className="text-display font-extrabold leading-[0.86]">
            {record.releaseYear}
          </div>
        </div>
        <div className="col-span-6" />
      </div>

      {/* Provenance and market, then the journal. */}
      <div className="grid grid-cols-12 gap-0">
        <div
          className={
            joinProvenanceToJournal
              ? 'col-span-6'
              : 'col-span-6 border-b border-[oklch(0.19_0.008_60)]'
          }
          data-join={joinProvenanceToJournal ? 'absent' : 'hairline'}
        >
          {modules.provenance.empty ? (
            <EmptyModule cell="provenance" label="Provenance" diagonal={modules.provenance.diagonal} />
          ) : (
            <div data-cell="provenance" className={`${CELL} min-h-[96px]`}>
              <div className={LABEL}>Provenance</div>
              {provenance.map((line) => (
                <div key={line} data-field="provenance-line" className="text-prose">
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="col-span-6 border-l-[6px] border-[oklch(0.19_0.008_60)]">
          {modules.market.empty ? (
            <EmptyModule cell="market" label="Market median" diagonal={modules.market.diagonal} />
          ) : (
            <div
              data-cell="market"
              className={`${CELL} flex min-h-[120px] flex-col justify-end`}
            >
              <div className={LABEL}>Market median</div>
              {/* §4: the only 40 on the page — one makes it an event. */}
              <div className="flex items-baseline gap-[14px]">
                <div data-field="market-median" className="text-headline font-extrabold leading-none">
                  ${record.marketMedian}
                </div>
                {record.marketLow !== null && record.marketHigh !== null && (
                  <div
                    data-field="market-range"
                    className="text-meta font-mono text-[oklch(0.55_0.008_60)]"
                  >
                    ${record.marketLow} to ${record.marketHigh}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-0">
        <div className="col-span-6">
          {modules.journal.empty ? (
            <EmptyModule cell="journal" label="Journal" diagonal={modules.journal.diagonal} />
          ) : (
            <div data-cell="journal" className={`${CELL} min-h-[96px]`}>
              <div className={LABEL}>Journal</div>
              <div data-field="journal-entry" className="text-prose">
                {record.journalEntry?.entry}
              </div>
            </div>
          )}
        </div>
        <div className="col-span-6 border-l-[6px] border-[oklch(0.19_0.008_60)]" />
      </div>
    </div>
  );
}
