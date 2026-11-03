/**
 * §W.8: "The wall fetches its covers after it has hydrated, at low priority,
 * and fetches a pulled record's cover at once if it has not arrived."
 *
 * At rest the wall draws no cover (§W: line, ink and paper), so nothing on
 * the page asks for one until a pull draws its `<image>`, and a cold first
 * pull waited on the network. Until step 164 the covers arrived anyway, by
 * accident: the Collection grid rendered under the wall at `display: none`
 * fetched its covers at parse time, every one at once and ahead of the
 * scripts, 13 of a cold load's 19.7 seconds on production at fast 3G
 * (NOTES, 30 Oct). That grid is now lazy and fetches nothing it does not
 * show, and the wall asks for its own covers here, once hydrated, when
 * nothing competes with the scripts.
 *
 * One image per distinct cover, the priority set before the source so the
 * request is MADE low rather than lowered. The images are returned for the
 * caller to hold: an image nothing references can be collected before its
 * load completes. A pull's own `<image>` of the same URL joins the request
 * in flight, or reads the cache, which is the "at once" the ruling asks for.
 */
export type CoverFetch = { fetchPriority: 'high' | 'low' | 'auto'; src: string };

export function prefetchCovers(seats: readonly { coverUrl: string | null }[], make: () => CoverFetch): CoverFetch[] {
  const made: CoverFetch[] = [];
  const seen = new Set<string>();
  for (const seat of seats) {
    if (seat.coverUrl === null || seen.has(seat.coverUrl)) continue;
    seen.add(seat.coverUrl);
    const image = make();
    image.fetchPriority = 'low';
    image.src = seat.coverUrl;
    made.push(image);
  }
  return made;
}
