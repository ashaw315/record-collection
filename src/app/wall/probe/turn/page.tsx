import { notFound } from 'next/navigation';
import { WallComposition } from '../../WallComposition';
import { TURN_DURATION_MS, type CornerPath } from '../../turn';
import { collectionSeats, collectionSummaries } from '../collection-seats';

/**
 * The motion probe for §11.14: **out, then round.** The wall as shipped,
 * with the pull's second phase switched on — the record leaves its slot in
 * the projection on §11.2's curve and then turns onto the page's plane,
 * ending on §11.9's square. What a still cannot settle is watched here:
 *
 * - `?ms=` — phase two's duration. 1000ms is fixed for phase one; faster
 *   is the hypothesis for the turn, since a slow turn reads as a swivel.
 * - `?path=linear|rotation` — whether a straight interpolation of the
 *   cover's corners reads as a turn or as a shape morphing; `rotation`
 *   swings the top edge through the angle instead.
 * - The boundary is zero-hold by construction; whether that reads as two
 *   motions or one is the whole ruling, and the thing to look at.
 *
 * Gated like the other probes: dev only, not linked, exempt from the nav.
 * It comes out when the phase is ruled and the figures move to `/`.
 */
export const dynamic = 'force-dynamic';

export default async function TurnProbePage({
  searchParams,
}: {
  searchParams: Promise<{ ms?: string; path?: string; cover?: string; count?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { ms, path, cover, count } = await searchParams;
  const seats = collectionSeats(cover ?? null, Number(count) > 0 ? Number(count) : 17);
  const turn = {
    ms: Number(ms) > 0 ? Number(ms) : TURN_DURATION_MS,
    path: (path === 'rotation' ? 'rotation' : 'linear') as CornerPath,
  };

  return (
    <main>
      <WallComposition seats={seats} summaries={collectionSummaries(seats)} turn={turn} />
    </main>
  );
}
