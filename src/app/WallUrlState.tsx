'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { WallComposition } from './wall/WallComposition';
import { toQueryString, type CollectionParams } from './collection-params';
import type { WallSeat } from './wall/shelf-runs';
import type { RecordSummary } from './wall/summary';

/**
 * §11.29: **the wall's view and its shelf live in the URL.**
 *
 * A zoom is a place rather than a mode, so it is addressable: a bare `/`
 * opens near on the arrival's own shelf, `?wall=far` opens the zoom-out, and
 * `?shelf=N` lands the near view on that run. Pushed rather than replaced, so
 * Back returns to where the reader was — which is the whole reason a zoom
 * belongs in history at all, since the two views are the same page showing
 * different things about it.
 *
 * The wall owns the view's immediate state and this owns its address; they
 * agree because a reload reads the address back and the wall opens on it.
 */
export function WallUrlState({
  params,
  seats,
  summaries,
  countLine,
  rail,
}: {
  params: CollectionParams;
  seats: readonly WallSeat[];
  summaries: Record<string, RecordSummary>;
  countLine: string | null;
  rail: React.ReactNode;
}) {
  const router = useRouter();

  const onView = useCallback(
    (wall: 'near' | 'far', shelf?: number) => {
      const query = toQueryString({ ...params, wall, shelf: wall === 'far' ? undefined : shelf });
      router.push(query === '' ? '/' : `/?${query}`, { scroll: false });
    },
    [params, router],
  );

  return (
    <WallComposition
      seats={seats}
      summaries={summaries}
      countLine={countLine}
      opens={params.wall}
      opensShelf={params.shelf}
      onView={onView}
      rail={rail}
    />
  );
}
