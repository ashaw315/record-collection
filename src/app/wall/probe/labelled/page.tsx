import { notFound } from 'next/navigation';
import { WallComposition } from '../../WallComposition';
import { COLLECTION_SPINES } from '../../../../../test/fixtures/collection-spines';
import { collectionSeats, collectionSummaries } from '../collection-seats';

/**
 * The wall composition on the real collection — seventeen records on four
 * shelves, their own labels, paper at rest (§11); click one to slide it out
 * and watch its colour arrive across the gesture.
 *
 * On a probe route, gated like the others: the 1:1 component is built and
 * measured here before the swap that puts it at `/`. The overview's probe
 * draws synthetic seats because it is about density; this one draws the
 * collection because labels and ink are about these records.
 *
 * Removal condition, with the other wall probes: this route, its exemption in
 * `every-page-has-nav`, and its guard come out together when the swap lands.
 */
export const dynamic = 'force-dynamic';

export default async function WallLabelledProbePage({
  searchParams,
}: {
  searchParams: Promise<{ cover?: string; count?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { cover, count } = await searchParams;
  const seats = collectionSeats(cover ?? null, Number(count) > 0 ? Number(count) : COLLECTION_SPINES.length);

  return (
    <main>
      <WallComposition seats={seats} summaries={collectionSummaries(seats)} />
    </main>
  );
}
