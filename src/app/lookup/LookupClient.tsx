'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { marketSummary, type MarketView } from './market-summary';
import type { SpreadSummary } from '@/lib/discogs/version-spread';

/** §10a layer 3's response: the summary plus how much of the master it covers. */
type SpreadResponse = SpreadSummary & {
  checked: number;
  total: number;
  /** Per-version floors keyed by release id — the table joins on these. */
  prices?: Record<string, number | null>;
};
import { OwnershipBadge } from './OwnershipBadge';
import { VersionTable, type VersionWithOwnership } from './VersionTable';
import type { OwnershipPayload } from '@/lib/discogs/ownership-payload';

/**
 * SPEC.md §10 `/lookup` — the in-store screen.
 *
 * §5.7's opening line is the whole design: "the user fills in a structured form
 * describing a record they are HOLDING, and gets back the specific pressing."
 * A bare `q` search cannot do that — 920 results for `artist=Discharge` in the
 * captured fixture, 5,315 live for a broader query — so the form leads with the
 * fields that actually identify a pressing.
 *
 * **The form comes first and fits above the fold on a phone.** It is the reason
 * the page exists; results are what happens after. Someone standing in a shop
 * should not scroll to start.
 *
 * §13: no result links out to a purchase page. Marketplace prices may be shown
 * as information; a path to buy may not exist anywhere in this app.
 */

type SearchResult = {
  discogsId: number;
  type: 'release' | 'master';
  masterId: number | null;
  title: string;
  artist: string | null;
  thumbUrl: string | null;
  year: number | null;
  country: string | null;
  label: string | null;
  catalogNumber: string | null;
  formats: string[];
  formatText: string | null;
  isReissue: boolean;
  communityHave: number | null;
  communityWant: number | null;
  ownership: OwnershipPayload;
};

/**
 * The fields §5.7 lists, in the order a collector reaches for them.
 *
 * Catalog number leads because it is printed on the object in the user's hand
 * and narrows hardest — but it narrows to an ALBUM, not a pressing. Measured
 * live 2026-08-25: `?catno=EKS-74007` returns 197 results, all one master. The
 * hint says narrowest rather than strongest for that reason; the header copy
 * was corrected at the same time.
 *
 * **Barcode is demoted below artist and title, deliberately.** It narrows
 * further than a catalogue number WHERE IT EXISTS, and on this collection it
 * usually does not: barcodes did not appear on LPs until the mid-1980s, so for
 * a collector buying first-wave punk and 1960s pressings the field is blank on
 * most of the shelf. Ranking it second gave prominent real estate to a field
 * that is empty for the common case. It stays present — §5.7 documents it, and
 * it is genuinely the best field for a modern reissue.
 */
const FIELDS = [
  { name: 'catno', label: 'Catalog no.', hint: 'On the spine or sleeve — narrows hardest' },
  { name: 'artist', label: 'Artist' },
  { name: 'title', label: 'Title' },
  /**
   * **Promoted to the arrival screen after QA on the live page**, above
   * barcode and beside the catalogue number.
   *
   * It does more real work in a shop than any other refinement: it is printed
   * on the label of essentially every pressing ever made, it is unambiguous,
   * and unlike a catalogue number it is not reused across decades of
   * repressings. A Doors search returning 530 matches drops to a handful once
   * the country is known.
   */
  { name: 'country', label: 'Country', hint: 'On the label — cuts a big result set fast' },
  { name: 'barcode', label: 'Barcode', hint: 'Mid-1980s onward — blank on older pressings' },
  /**
   * FOUND IN REAL USE, and the reason the full twelve matter: a Carpenters
   * search returned 32 results, most of them CDs and cassettes. A popular
   * album exists on every medium and only one of them is in the user's hand,
   * so "Vinyl" narrows more than another text field would.
   *
   * Placed high for that reason — it is a filter almost every search wants.
   */
  { name: 'format', label: 'Format', hint: 'e.g. Vinyl, LP, 45 RPM, 180 Gram' },
  { name: 'label', label: 'Label' },
  { name: 'year', label: 'Year' },
  /**
   * The remaining §5.7 parameters. Lower because they narrow less reliably —
   * Discogs' genre and style are contributor-entered and inconsistent — but
   * present, because a form missing a documented parameter is a search the
   * user cannot express.
   */
  { name: 'genre', label: 'Genre' },
  { name: 'style', label: 'Style', hint: 'The specific scene — Hardcore, UK82, Psychobilly' },
  { name: 'track', label: 'Track', hint: 'Useful when the sleeve is missing' },
  { name: 'q', label: 'Anything', hint: 'Freeform — combine with the fields above' },
] as const;

/**
 * **What you type standing in a shop, holding the record.**
 *
 * §5.7's screen is an in-store lookup, and these five are what is on the object
 * in your hand: the catalogue number off the spine (the narrowest match), the
 * artist and title off the sleeve, the country off the label, and the format —
 * the last two both earn their place for measured reasons recorded above, a
 * Carpenters search returning 32 results mostly on CD and cassette when only
 * one medium is in the hand, and a Doors search returning 530 that the country
 * alone cuts to a handful.
 *
 * The remaining seven are refinements. They stay reachable behind a disclosure
 * rather than being removed: §5.7 documents all twelve, and a form missing a
 * documented parameter is a search the user cannot express.
 */
const ESSENTIAL_FIELDS = ['catno', 'artist', 'title', 'country', 'format'] as const;

type FieldName = (typeof FIELDS)[number]['name'];

const EMPTY: Record<FieldName, string> = {
  catno: '',
  barcode: '',
  artist: '',
  title: '',
  format: '',
  label: '',
  country: '',
  year: '',
  genre: '',
  style: '',
  track: '',
  q: '',
};

export function LookupClient() {
  const formId = useId();
  const [values, setValues] = useState<Record<FieldName, string>>(EMPTY);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | undefined>();
  const [searching, setSearching] = useState(false);
  /**
   * **The form collapses once there are results, and the results take the
   * screen.**
   *
   * Reported from a phone as "I tap search and nothing happens": the request
   * returned 200 and the results rendered below a full screen of form, so a
   * successful search looked identical to a dead button. Scrolling to the
   * results was the smaller fix and it treats the symptom — the screen you look
   * at after submitting would still be the query you just typed.
   *
   * So after a search the query becomes a summary line you can tap to reopen,
   * and the answer is what is on screen. Re-opened automatically when a search
   * fails or returns nothing, because then the query IS the thing to look at.
   */
  const [queryOpen, setQueryOpen] = useState(true);
  const [refinementsOpen, setRefinementsOpen] = useState(false);

  /**
   * A TEST-SUPPORT AFFORDANCE, and deliberately so — the same one RecordForm
   * carries, for the same reason. WebKit reaches the DOM before React
   * hydrates, so a spec that fills a field in that window sets a value React
   * never sees. Waiting on a rendered control does not help: the markup is
   * server-rendered, so its presence proves nothing about handlers.
   *
   * Set through the ref rather than through state: the DOM attribute IS the
   * external system, which is the case react-hooks/set-state-in-effect names
   * as the legitimate use of an effect, and it avoids a render purely to
   * publish a flag no React code reads.
   */
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    formRef.current?.setAttribute('data-hydrated', 'true');
  }, []);

  const anyTerm = Object.values(values).some((value) => value.trim() !== '');

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (!anyTerm) {
      // §5.7 requires at least one term. Said here rather than round-tripping
      // for a 400 the user cannot act on any faster.
      setError('Enter at least one search term.');
      return;
    }

    setSearching(true);
    setError(undefined);

    const query = new URLSearchParams();
    for (const [name, value] of Object.entries(values)) {
      if (value.trim() !== '') query.set(name, value.trim());
    }

    try {
      const response = await fetch(`/api/discogs/search?${query.toString()}`);
      const body = await response.json();

      if (!response.ok) {
        setError(body?.error?.message ?? 'Search failed.');
        setResults(null);
        setQueryOpen(true);
        return;
      }

      setResults(body.data);
      setTotal(body.meta.total);
      /* Nothing found means the query is what needs attention, not the answer. */
      setQueryOpen(body.meta.total === 0);
    } catch {
      setError('Could not reach the server.');
      setResults(null);
      setQueryOpen(true);
    } finally {
      setSearching(false);
    }
  }

  const renderField = (field: (typeof FIELDS)[number]) => (
    <div key={field.name} className="space-y-1">
      <label htmlFor={field.name} className="block text-xs text-muted-foreground uppercase">
        {field.label}
      </label>
      <Input
        id={field.name}
        name={field.name}
        value={values[field.name]}
        onChange={(event) =>
          setValues((current) => ({ ...current, [field.name]: event.target.value }))
        }
        className="h-9"
        autoComplete="off"
      />
      {'hint' in field && field.hint !== undefined && (
        <p className="text-[0.7rem] text-muted-foreground">{field.hint}</p>
      )}
    </div>
  );

  /** The query in a sentence, for the collapsed state. */
  const querySummary = FIELDS.filter((field) => values[field.name].trim() !== '')
    .map((field) => `${field.label} ${values[field.name].trim()}`)
    .join(' · ');

  return (
    <div className="space-y-6">
      {/*
        **Results first once there are results.** The query is above them when
        you are composing it and below them — as a summary you can tap open —
        once it has been answered. On a phone that is the difference between a
        search that appears to do nothing and one that shows you what came back.
      */}
      {results !== null && !queryOpen && (
        <button
          type="button"
          data-testid="lookup-query-summary"
          onClick={() => setQueryOpen(true)}
          className="w-full rounded-xs border border-border px-3 py-2 text-left text-xs text-muted-foreground"
        >
          <span className="font-medium text-foreground">Searched:</span>{' '}
          {querySummary === '' ? 'everything' : querySummary}
          <span className="ml-1 underline underline-offset-2">Edit</span>
        </button>
      )}

      <form
        hidden={results !== null && !queryOpen}
        ref={formRef}
        id={formId}
        onSubmit={search}
        data-testid="lookup-form"
        className="space-y-3"
      >
        {/*
          Two columns from `sm` up, one on a phone. The first two fields are the
          identifying ones, so on a narrow screen they are what is visible
          before any scrolling.
        */}
        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.filter((field) =>
            (ESSENTIAL_FIELDS as readonly string[]).includes(field.name),
          ).map(renderField)}
        </div>

        {/*
          The eight refinements, reachable but not in the way. §5.7 documents
          all twelve parameters and every one stays expressible; what changed is
          that a phone no longer shows twelve fields before it shows an answer.
        */}
        <details
          open={refinementsOpen}
          onToggle={(event) => setRefinementsOpen((event.target as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer text-xs text-muted-foreground underline underline-offset-2">
            More search terms
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {FIELDS.filter(
              (field) => !(ESSENTIAL_FIELDS as readonly string[]).includes(field.name),
            ).map(renderField)}
          </div>
        </details>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={searching}>
            {searching ? 'Searching…' : 'Search Discogs'}
          </Button>
          {results !== null && (
            <button
              type="button"
              onClick={() => {
                setValues(EMPTY);
                setResults(null);
                setError(undefined);
              }}
              className="text-xs text-muted-foreground underline underline-offset-2"
            >
              Clear
            </button>
          )}
        </div>

        {error !== undefined && (
          <p role="alert" data-testid="lookup-error" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>

      {results !== null && (
        <section aria-label="Results" className="space-y-3">
          <p data-testid="lookup-summary" className="text-xs text-muted-foreground">
            {total === 0
              ? 'No matches on Discogs.'
              : `${total} match${total === 1 ? '' : 'es'}${
                  total > results.length ? ` · showing ${results.length}` : ''
                }`}
          </p>

          {/*
            §5.7's honest limits, surfaced rather than papered over: Discogs is
            user-submitted, distinct pressings are sometimes merged and
            identical ones split. The user is holding the object; the screen is
            a starting point.
          */}
          {total > 0 && (
            <p className="text-[0.7rem] text-muted-foreground">
              Discogs data is contributed by collectors — check the details against the record in
              your hand before saving.
            </p>
          )}

          <ul className="space-y-3">
            {results.map((result) => (
              <ResultCard
                key={result.discogsId}
                result={result}
                // The COUNT decides, not the query. See the note on the prop.
                autoResolve={results.length === 1}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ResultCard({
  result,
  autoResolve = false,
}: {
  result: SearchResult;
  /**
   * §10a: "a single result resolves automatically". Driven by the RESULT COUNT,
   * never by how the search was built — a catalog-number search returning one
   * release and a freeform search happening to return one are the same case
   * from the user's side, and keying on the query's shape would make the
   * behaviour unpredictable.
   */
  autoResolve?: boolean;
}) {
  const [versions, setVersions] = useState<VersionWithOwnership[] | null>(null);
  const [ownershipChecked, setOwnershipChecked] = useState(true);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [versionsError, setVersionsError] = useState<string | undefined>();

  const [spread, setSpread] = useState<SpreadResponse | null>(null);

  const [market, setMarket] = useState<MarketView | null>(null);
  const [loadingMarket, setLoadingMarket] = useState(false);
  const [marketError, setMarketError] = useState<string | undefined>();

  /**
   * §10a layers 1-2, ON DEMAND. Two calls per release, and a search returns
   * fifty results — fetching eagerly would spend up to a hundred calls of a
   * sixty-per-minute budget on a search the user may not act on.
   */
  const loadMarket = useCallback(async () => {
    /**
     * `await null` first, so the state updates land on a microtask rather than
     * synchronously inside an effect body. `react-hooks` rejects the synchronous
     * form because it cascades renders — and the auto-resolve path calls this
     * from an effect (§10a's single-result case).
     */
    setLoadingMarket(true);
    setMarketError(undefined);

    try {
      const response = await fetch(`/api/discogs/market/${result.discogsId}`);

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setMarketError(body?.error?.message ?? 'Could not reach Discogs for market data.');
        return;
      }

      setMarket(await response.json());
    } catch {
      setMarketError('Could not reach Discogs for market data.');
    } finally {
      setLoadingMarket(false);
    }
  }, [result.discogsId]);

  /**
   * The shop case: arriving by catalog number or barcode usually returns one
   * release, and requiring a click to answer the question the search just asked
   * is friction for nothing (§10a).
   *
   * Scheduled off the effect body rather than called from it. `react-hooks`
   * rejects a synchronous `setState` inside an effect because it cascades
   * renders — and this genuinely IS a fetch triggered by a prop, which is the
   * legitimate "synchronise with an external system" case the rule allows, so
   * the fix is where the state update lands, not whether the effect exists.
   */
  useEffect(() => {
    if (!autoResolve) return;

    const timer = setTimeout(() => void loadMarket(), 0);
    return () => clearTimeout(timer);
  }, [autoResolve, loadMarket]);

  async function loadVersions() {
    if (result.masterId === null) return;
    if (versions !== null) {
      setVersions(null);
      return;
    }

    setLoadingVersions(true);
    setVersionsError(undefined);

    try {
      const response = await fetch(`/api/discogs/master/${result.masterId}/versions`);
      const body = await response.json();

      /**
       * §10a layer 3, on the SAME action. It costs one call per version, so it
       * happens when the user opens the table and never before — and it is
       * fired without awaiting, so eleven sequential price checks do not hold
       * up the table the user asked for.
       */
      /**
       * The medium the user is looking at, so the spread compares pressings
       * rather than formats (§10a). Discogs' `major_formats` is the first
       * descriptor on a normalized version; the search result carries the same
       * shape.
       */
      const viewedFormat = result.formats?.[0];

      void fetch(
        `/api/discogs/master/${result.masterId}/spread` +
          (viewedFormat === undefined ? '' : `?format=${encodeURIComponent(viewedFormat)}`),
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((value) => setSpread(value))
        .catch(() => setSpread(null));

      if (!response.ok) {
        setVersionsError(body?.error?.message ?? 'Could not load versions.');
        return;
      }
      setVersions(body.data);
      setOwnershipChecked(body.meta?.ownershipChecked !== false);
    } catch {
      setVersionsError('Could not reach the server.');
    } finally {
      setLoadingVersions(false);
    }
  }

  const details = [
    result.year === null ? null : String(result.year),
    result.country,
    result.label,
    result.catalogNumber,
  ].filter((part): part is string => part !== null && part.trim() !== '');

  return (
    <li
      data-testid="result-card"
      data-discogs-id={result.discogsId}
      className="rounded-xs border border-border"
    >
      <div className="flex gap-3 p-3">
        {/*
          Discogs images are remote and next/image would need each host
          allow-listed; a plain img keeps the sleeve visible without adding
          configuration this screen does not otherwise need.
        */}
        {result.thumbUrl !== null && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={result.thumbUrl}
            alt=""
            width={72}
            height={72}
            /**
             * The URL is https-checked in the normalizer, but it is still a
             * host a Discogs contributor chose. `no-referrer` stops the
             * browser telling that host which record the user is looking at,
             * and `lazy` means an off-screen result makes no request at all.
             */
            referrerPolicy="no-referrer"
            loading="lazy"
            className="h-18 w-18 shrink-0 rounded-xs border border-border object-cover"
          />
        )}

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium">{result.title}</p>
              {result.artist !== null && (
                <p className="text-sm text-muted-foreground">{result.artist}</p>
              )}
            </div>

            {/* The badge sits with the title, where the eye lands first. */}
            <OwnershipBadge ownership={result.ownership} />
          </div>

          {details.length > 0 && (
            <p className="font-mono text-xs text-muted-foreground">{details.join(' · ')}</p>
          )}

          {result.formats.length > 0 && (
            <p className="text-xs text-muted-foreground">{result.formats.join(' · ')}</p>
          )}

          {/*
            The qualifier from `formats[].text` — often the pressing plant, and
            the most discriminating thing Discogs gives at list level. Two cards
            on one screen can be identical on every other field and differ only
            here.

            Rendered SEPARATELY from the descriptor list rather than appended to
            it, because it is a different kind of claim: the descriptors are a
            controlled vocabulary, this is prose a contributor typed. Live
            values include "Allentown Pressing" but also "180g", "Blue" and
            "USA Cover" — so it is shown as Discogs' own words and never
            labelled as a plant. §7.8: never present a Discogs match as certain.
          */}
          {result.formatText !== null && (
            <p className="text-xs italic text-muted-foreground" data-testid="format-text">
              {result.formatText}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {/*
              §5.7: import is two-stage. Both actions open the FORM prefilled;
              neither writes anything. "There is no path that writes a record
              straight from a search result without passing through the form."
            */}
            <Link
              href={`/records/new?discogsReleaseId=${result.discogsId}`}
              className="rounded-xs bg-primary px-2 py-1 text-xs text-primary-foreground"
            >
              Add to collection
            </Link>
            <Link
              href={`/want-list/new?discogsReleaseId=${result.discogsId}`}
              className="rounded-xs border border-border px-2 py-1 text-xs"
            >
              Add to want list
            </Link>

            {result.masterId !== null && (
              <button
                type="button"
                onClick={() => void loadVersions()}
                data-testid="expand-versions"
                aria-expanded={versions !== null}
                className={cn(
                  'ml-auto text-xs underline underline-offset-2',
                  versions === null ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {loadingVersions
                  ? 'Loading versions…'
                  : versions === null
                    ? 'Compare pressings'
                    : 'Hide pressings'}
              </button>
            )}
          </div>

          {/*
            §10a layers 1-2. A control, not a field: two calls per release and
            fifty results per search, so this is fetched only when asked — or
            automatically when there is exactly one result, which is the shop
            case (§10a).
          */}
          <div className="mt-1">
            {market === null && marketError === undefined && (
              <button
                type="button"
                onClick={() => void loadMarket()}
                disabled={loadingMarket}
                data-testid="check-market"
                className="text-xs text-foreground underline underline-offset-2 disabled:text-muted-foreground"
              >
                {loadingMarket ? 'Checking the market…' : 'Check the market'}
              </button>
            )}

            {market !== null && (
              <p data-testid="market-summary" className="text-xs text-muted-foreground">
                {marketSummary(market)}
              </p>
            )}

            {marketError !== undefined && (
              <p role="status" data-testid="market-error" className="text-xs text-muted-foreground">
                {marketError}
              </p>
            )}
          </div>

          {versionsError !== undefined && (
            <p role="alert" className="text-xs text-destructive">
              {versionsError}
            </p>
          )}
        </div>
      </div>

      {versions !== null && (
        <>
          {/*
            §10a layer 3, above the table it describes: the spread answers
            "does pressing matter here?", which is the question the rows below
            are being read to settle. A partial spread says so in its own text
            — see `summariseSpread`.
          */}
          {spread !== null && (
            <p data-testid="version-spread" className="mt-2 px-3 text-xs text-muted-foreground">
              {spread.text}
            </p>
          )}

          <VersionTable
            versions={versions}
            ownershipChecked={ownershipChecked}
            prices={spread?.prices}
          />
        </>
      )}
    </li>
  );
}
