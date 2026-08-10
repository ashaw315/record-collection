'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
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
  isReissue: boolean;
  communityHave: number | null;
  communityWant: number | null;
  ownership: OwnershipPayload;
};

/**
 * The fields §5.7 lists, in the order a collector reaches for them.
 *
 * Catalog number and barcode lead because §5.7 calls them the most effective
 * way to pin down a pressing — and they are printed on the object in the user's
 * hand, which artist and title also are but far less distinctively.
 */
const FIELDS = [
  { name: 'catno', label: 'Catalog no.', hint: 'On the spine or sleeve — the strongest match' },
  { name: 'barcode', label: 'Barcode', hint: 'Near-unique on modern pressings' },
  { name: 'artist', label: 'Artist' },
  { name: 'title', label: 'Title' },
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
  { name: 'country', label: 'Country' },
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
        return;
      }

      setResults(body.data);
      setTotal(body.meta.total);
    } catch {
      setError('Could not reach the server.');
      setResults(null);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-6">
      <form
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
          {FIELDS.map((field) => (
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
          ))}
        </div>

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
          <p className="text-xs text-muted-foreground">
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
              <ResultCard key={result.discogsId} result={result} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ResultCard({ result }: { result: SearchResult }) {
  const [versions, setVersions] = useState<VersionWithOwnership[] | null>(null);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [versionsError, setVersionsError] = useState<string | undefined>();

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

      if (!response.ok) {
        setVersionsError(body?.error?.message ?? 'Could not load versions.');
        return;
      }
      setVersions(body.data);
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

          {versionsError !== undefined && (
            <p role="alert" className="text-xs text-destructive">
              {versionsError}
            </p>
          )}
        </div>
      </div>

      {versions !== null && <VersionTable versions={versions} />}
    </li>
  );
}
