import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { loadReferenceData } from '@/app/records/reference';
import { hydrateWantListItem } from '@/lib/db/queries/want-list';
import { WantListForm } from '../../WantListForm';

/**
 * SPEC.md §10 `/want-list/:id/edit` — **specified in step 6 and never built.**
 *
 * **The gap was larger than the missing screen.** `WantListRow` carried no edit
 * affordance either, so a want-list row has never been editable after creation —
 * and the live collection had **zero** rows carrying `best_dig_notes`,
 * `target_pressing_id` or `max_price`, because the create form offers those
 * fields and nothing could reach them afterwards.
 *
 * Found by Adam clicking an Edit link the detail view rendered against §10's
 * promise. Nothing had linked here for ten steps, which is why nothing noticed.
 */

export const dynamic = 'force-dynamic';

export default async function EditWantListItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [item, reference] = await Promise.all([hydrateWantListItem(id), loadReferenceData()]);

  // Unknown or malformed id is a not-found page, never a server error.
  if (item === undefined) notFound();

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-2xl px-4 py-5">
        <Link
          href={`/want-list/${item.id}`}
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          ← {item.title}
        </Link>

        <h1 className="mt-3 text-xl font-medium">Edit want-list item</h1>

        <div className="mt-4">
          <WantListForm
            itemId={item.id}
            initial={{
              title: item.title,
              artistId: item.artistId,
              labelId: item.labelId ?? '',
              priority: String(item.priority),
              targetPressingId: item.targetPressingId ?? '',
              bestDigNotes: item.bestDigNotes ?? '',
              maxPrice: item.maxPrice ?? '',
            }}
            artists={reference.artists}
            labels={reference.labels}
          />
        </div>
      </main>
    </>
  );
}
