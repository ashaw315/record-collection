import { AppHeader } from '@/components/AppHeader';
import Link from 'next/link';
import { RecordForm } from '../RecordForm';
import { loadReferenceData } from '../reference';
import type { FormValues } from '../record-form';
import { BLANK_PRESSING } from '../pressing-form';
import { hydrateWantListItem } from '@/lib/db/queries/want-list';
import { isUuid } from '@/lib/api/errors';

/** SPEC.md §10 `/records/new`: manual entry. Discogs prefill is step 7. */

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
        {wanted !== undefined && (
          <p className="mb-4 text-sm text-muted-foreground">
            Saving this adds it to your collection and marks “{wanted.title}” acquired. The
            want-list entry stays as a record of the hunt.
          </p>
        )}

        <RecordForm
          reference={reference}
          initial={
            wanted === undefined
              ? BLANK
              : {
                  ...BLANK,
                  title: wanted.title,
                  artistId: wanted.artistId,
                  labelId: wanted.labelId ?? '',
                  genreIds: wanted.genres.map((genre) => genre.id),
                }
          }
          initialPressing={BLANK_PRESSING}
          acquiresWantListId={wanted?.id}
        />
      </main>
    </>
  );
}
