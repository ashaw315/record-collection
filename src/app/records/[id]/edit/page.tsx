import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';
import { RecordForm } from '../../RecordForm';
import { loadReferenceData } from '../../reference';
import type { FormValues } from '../../record-form';
import { hydrateRecord } from '@/lib/db/queries/records';
import { isUuid } from '@/lib/api/errors';

/** SPEC.md §10 `/records/:id/edit`. */

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Edit record · Record Collection' };

export default async function EditRecordPage({ params }: PageProps<'/records/[id]/edit'>) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const [record, reference] = await Promise.all([hydrateRecord(id), loadReferenceData()]);
  if (record === undefined) notFound();

  /**
   * The stored record as FORM STRINGS.
   *
   * This is the half of the round trip that makes PATCH's three states
   * reachable: the form compares against these values, so an untouched field
   * is absent from the body and a cleared one becomes an explicit null. Every
   * null becomes '' here, and buildPatchBody turns '' back into null only when
   * it differs from what was stored.
   */
  const initial: FormValues = {
    title: record.title,
    artistId: record.artistId,
    labelId: record.labelId ?? '',
    formatId: record.formatId ?? '',
    storeId: record.storeId ?? '',
    releaseYear: record.releaseYear === null ? '' : String(record.releaseYear),
    conditionMedia: record.conditionMedia ?? '',
    conditionSleeve: record.conditionSleeve ?? '',
    purchasePrice: record.purchasePrice ?? '',
    purchaseDate: record.purchaseDate ?? '',
    notes: record.notes ?? '',
    genreIds: record.genres.map((genre) => genre.id),
    tagIds: record.tags.map((tag) => tag.id),
  };

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        <Link
          href={`/records/${id}`}
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          ← {record.title}
        </Link>
        <h1 className="mt-3 mb-4 font-heading text-xl font-semibold tracking-tight">Edit record</h1>

        <RecordForm reference={reference} initial={initial} recordId={id} />
      </main>
    </>
  );
}
