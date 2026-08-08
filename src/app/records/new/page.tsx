import { AppHeader } from '@/components/AppHeader';
import Link from 'next/link';
import { RecordForm } from '../RecordForm';
import { loadReferenceData } from '../reference';
import type { FormValues } from '../record-form';
import { BLANK_PRESSING } from '../pressing-form';

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

export default async function NewRecordPage() {
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
        <h1 className="mt-3 mb-4 font-heading text-xl font-semibold tracking-tight">Add a record</h1>

        <RecordForm reference={reference} initial={BLANK} initialPressing={BLANK_PRESSING} />
      </main>
    </>
  );
}
