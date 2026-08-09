import { AppHeader } from '@/components/AppHeader';
import Link from 'next/link';
import { RecordForm } from '../RecordForm';
import { loadReferenceData } from '../reference';
import type { FormValues } from '../record-form';
import { BLANK_PRESSING, pressingToForm } from '../pressing-form';
import { hydrateWantListItem } from '@/lib/db/queries/want-list';
import { isUuid } from '@/lib/api/errors';
import { toDiscogsId } from '@/lib/discogs/fields';
import { loadDiscogsPrefill } from '../discogs-prefill';

/**
 * SPEC.md §10 `/records/new`: "Form prefilled from a lookup result, or blank
 * for manual entry. All prefilled fields remain editable — the user verifies
 * against the physical record and corrects."
 *
 * Two prefill sources, and they are different flows: `?wantListId=` marks a
 * want-list item acquired (§5.3), `?discogsReleaseId=` is stage two of §5.7's
 * two-stage import. Neither writes anything — the form does, after the user
 * has checked it against the object in their hand.
 */

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Add a record · Record Collection' };

const BLANK: FormValues = {
  title: '',
  artistId: '',
  labelId: '',
  formatId: '',
  storeId: '',
  releaseYear: '',
  conditionMedia: '',
  conditionSleeve: '',
  purchasePrice: '',
  purchaseDate: '',
  notes: '',
  genreIds: [],
  tagIds: [],
};

export default async function NewRecordPage({ searchParams }: PageProps<'/records/new'>) {
  const raw = await searchParams;
  const wantListId = typeof raw.wantListId === 'string' ? raw.wantListId : undefined;

  /**
   * §10: "'Mark acquired' action opens the record form prefilled."
   *
   * Prefilled from the want-list item, so the in-shop flow is one tap and a
   * save rather than retyping what you already recorded when you wanted it.
   * The form POSTs to the acquire endpoint instead of /api/records when this
   * is present, which is what keeps the two writes in one transaction (§5.3).
   */
  const wanted =
    wantListId !== undefined && isUuid(wantListId)
      ? await hydrateWantListItem(wantListId)
      : undefined;

  /**
   * §5.7's two-stage import: the release is rendered into the form, the user
   * verifies it against the record they are holding, and only then is anything
   * written. "There is no path that writes a record straight from a search
   * result without passing through the form."
   *
   * `toDiscogsId` rather than `Number()`: coercion accepts '0x50' as 80, and a
   * form prefilled from a DIFFERENT release than the one the user chose is the
   * §7.7 confusion with their own eyes as the thing being contradicted.
   */
  const rawReleaseId = typeof raw.discogsReleaseId === 'string' ? raw.discogsReleaseId : undefined;
  const releaseId = rawReleaseId === undefined ? null : toDiscogsId(rawReleaseId);
  const prefill = releaseId === null ? null : await loadDiscogsPrefill(releaseId);

  // Asked for a release and did not get one: Discogs was unreachable or the id
  // is wrong. The form still works (§10: "or blank for manual entry"), and the
  // notice says so rather than leaving a silently empty form.
  const prefillFailed = releaseId !== null && prefill === null;

  const reference = await loadReferenceData();

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        <Link
          href="/"
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          ← Collection
        </Link>
        <h1 className="mt-3 mb-1 font-heading text-xl font-semibold tracking-tight">
          {wanted === undefined ? 'Add a record' : 'Mark acquired'}
        </h1>

        {prefillFailed && (
          <p
            data-testid="prefill-failed"
            role="status"
            className="mb-4 rounded-xs border border-border px-3 py-2 text-sm"
          >
            Could not load that release from Discogs. The form is blank — enter the details by
            hand, or try the lookup again.
          </p>
        )}

        {prefill !== null && (
          <div className="mb-4 space-y-1">
            {/*
              §5.7's honest limits, at the moment they matter most: the user is
              about to save this. Discogs is "a strong starting point, never
              proof", and the matrix in particular is frequently absent or
              partial.
            */}
            <p className="text-sm text-muted-foreground">
              Prefilled from Discogs. Check every field against the record in your hand — these
              details are contributed by collectors and are a starting point, not proof.
            </p>
            {prefill.unmatched.artist !== null && (
              <p data-testid="unmatched-artist" className="text-sm">
                No artist named “{prefill.unmatched.artist}” in your collection yet — add them with
                <span className="font-medium"> + New artist</span>.
              </p>
            )}
            {prefill.unmatched.label !== null && (
              <p data-testid="unmatched-label" className="text-sm">
                No label named “{prefill.unmatched.label}” yet — add it with
                <span className="font-medium"> + New label</span>.
              </p>
            )}
          </div>
        )}
        {wanted !== undefined && (
          <p className="mb-4 text-sm text-muted-foreground">
            Saving this adds it to your collection and marks “{wanted.title}” acquired. The
            want-list entry stays as a record of the hunt.
          </p>
        )}

        <RecordForm
          reference={reference}
          initial={
            wanted !== undefined
              ? {
                  ...BLANK,
                  title: wanted.title,
                  artistId: wanted.artistId,
                  labelId: wanted.labelId ?? '',
                  genreIds: wanted.genres.map((genre) => genre.id),
                }
              : prefill !== null
                ? { ...BLANK, ...prefill.values }
                : BLANK
          }
          /**
           * §5.3: the target pressing PREFILLS the pressing section — "neither
           * dropped nor silently copied", exactly as a Discogs lookup will.
           *
           * Dropping it made the user retype what they had already recorded
           * about the pressing they were hunting. Copying it silently would be
           * worse: it would assert that the record in hand IS the pressing that
           * was wanted, which is precisely the §7.7 distinction between owning
           * this pressing and owning a different pressing of the same album.
           * Prefilled and editable puts the claim in front of the user, who is
           * holding the record and can check it.
           */
          initialPressing={
            wanted?.targetPressing != null
              ? pressingToForm(wanted.targetPressing)
              : /**
                 * §10 puts pressing details on this form deliberately, "not on
                 * a separate screen" — they are what distinguishes the 1982
                 * original from the 1989 reissue sharing its catalog number, so
                 * dropping them would leave the user retyping exactly what the
                 * lookup existed to find.
                 */
                (prefill?.pressing ?? BLANK_PRESSING)
          }
          acquiresWantListId={wanted?.id}
        />
      </main>
    </>
  );
}
