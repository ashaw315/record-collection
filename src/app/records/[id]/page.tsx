import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';
import { RecordDetail } from './RecordDetail';
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

export default async function RecordPage({ params }: PageProps<'/records/[id]'>) {
  const { id } = await params;

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

  return (
    <>
      <AppHeader />

      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        {/* Back to the collection, not browser-back: the reader may have
            arrived from a link or a fresh tab, where back goes nowhere useful. */}
        <Link
          href="/"
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          ← Collection
        </Link>

        <div className="mt-3 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <RecordDetail record={record} />
          </div>
          <Link
            href={`/records/${id}/edit`}
            className="mt-1 shrink-0 rounded-xs border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
          >
            Edit
          </Link>
        </div>
      </main>
    </>
  );
}
