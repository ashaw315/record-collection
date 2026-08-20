import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';
import { WantListForm } from '../WantListForm';
import { isUuid } from '@/lib/api/errors';
import { suggestions } from '@/lib/db/queries/suggestions';
import { loadReferenceData } from '@/app/records/reference';
import { loadDiscogsPrefill } from '@/app/records/discogs-prefill';
import { toDiscogsId } from '@/lib/discogs/fields';
import type { WantListFormValues } from '../want-list-form';

/**
 * SPEC.md §10 `/want-list/new` — "Form for a wanted record, mirroring the
 * record form's structure… Prefilled from a `/lookup` result via
 * `?discogsReleaseId=`, or blank."
 *
 * The §7.2 separation §10 requires is decided in `want-list-form.ts` and
 * asserted there: best-dig notes and max price live in different sections,
 * never one, and the headings never describe the dig in terms of price.
 *
 * **Reference rows are matched, never created** (§10). A prefill is not a
 * commitment — the user may abandon the form — and an artist created for an
 * abandoned form is debris nothing points at. When a Discogs value matches no
 * row the field stays empty and the screen names what it could not find.
 */

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Add to want list · Record Collection' };

const BLANK: WantListFormValues = {
  title: '',
  artistId: '',
  labelId: '',
  // §4.2: 1 = highest, 5 = lowest. Medium is the honest default for something
  // the user has not ranked yet.
  priority: '3',
  targetPressingId: '',
  bestDigNotes: '',
  maxPrice: '',
};

export default async function NewWantListItemPage({
  searchParams,
}: PageProps<'/want-list/new'>) {
  const raw = await searchParams;

  /**
   * `toDiscogsId` rather than `Number()`: coercion accepts '0x50' as 80, and a
   * form prefilled from a DIFFERENT release than the one the user chose is the
   * §7.7 confusion with their own eyes as the thing contradicted.
   */
  const rawReleaseId = typeof raw.discogsReleaseId === 'string' ? raw.discogsReleaseId : undefined;
  const releaseId = rawReleaseId === undefined ? null : toDiscogsId(rawReleaseId);
  const prefill = releaseId === null ? null : await loadDiscogsPrefill(releaseId);
  const prefillFailed = releaseId !== null && prefill === null;

  /**
   * `?artistId=` — the prefill from §10's `/suggestions` screen.
   *
   * §9.1 suggests ARTISTS and `want_list.title` is NOT NULL because the want
   * list holds RECORDS, so the suggestion cannot create a row on its own: there
   * is no title, and inventing one ('TBC', the artist's name, empty) is the app
   * asserting a fact nobody supplied. The artist prefills; the user names the
   * record. §5.7's division everywhere else in this app.
   */
  const rawArtistId = typeof raw.artistId === 'string' ? raw.artistId : undefined;
  const suggestedArtistId = rawArtistId !== undefined && isUuid(rawArtistId) ? rawArtistId : null;

  /**
   * The reason clauses, REGENERATED here rather than carried in the URL.
   *
   * A reason passed as a query parameter is attacker-controlled text rendered
   * on a page, and it would also let a URL claim a reason the engine never
   * produced. So the page asks §9.1 why this artist is suggested and renders
   * that — and renders nothing if the answer is "it isn't", which happens for a
   * stale link or an artist acquired since.
   *
   * It is CONTEXT, never data: nothing here reaches the `want_list` row. A
   * suggestion is true of a collection at a moment, and freezing it into a row
   * would leave a stale claim behind the first time the collection changed.
   * There is also nowhere honest to put it — `best_dig_notes` is the only free
   * text on the table and §7.2 gives it a different meaning.
   */
  const suggestionReasons =
    suggestedArtistId === null
      ? []
      : ((await suggestions({ limit: 200 })).find((row) => row.artistId === suggestedArtistId)
          ?.reasons ?? []);

  const reference = await loadReferenceData();

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-2xl px-4 py-5">
        <Link
          href="/want-list"
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          ← Want list
        </Link>

        <h1 className="mt-3 mb-1 font-heading text-xl font-semibold tracking-tight">
          Add to want list
        </h1>

        {prefillFailed && (
          <p
            data-testid="prefill-failed"
            role="status"
            className="mb-4 rounded-xs border border-border px-3 py-2 text-sm"
          >
            Could not load that release from Discogs. The form is blank — enter what you know by
            hand.
          </p>
        )}

        {suggestionReasons.length > 0 && (
          <div className="mb-4 rounded-xs border border-border px-3 py-2 text-sm">
            <p className="text-muted-foreground">Suggested because:</p>
            <ul className="mt-1 space-y-0.5">
              {suggestionReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        )}

        {prefill !== null && (
          <p className="mb-4 text-sm text-muted-foreground">
            Prefilled from Discogs. These details are contributed by collectors — a starting point
            for the hunt, not proof.
          </p>
        )}

        <WantListForm
          initial={
            prefill === null
              ? { ...BLANK, artistId: suggestedArtistId ?? '' }
              : {
                  ...BLANK,
                  title: prefill.values.title ?? '',
                  artistId: prefill.values.artistId ?? '',
                  labelId: prefill.values.labelId ?? '',
                }
          }
          artists={reference.artists}
          labels={reference.labels}
          unmatched={prefill?.unmatched}
        />
      </main>
    </>
  );
}
