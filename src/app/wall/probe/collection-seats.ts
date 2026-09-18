import { spineLabel } from '../spine-text';
import type { WallSeat } from '../shelf-runs';
import type { RecordSummary } from '../summary';
import { COLLECTION_SPINES } from '../../../../test/fixtures/collection-spines';

/**
 * The probes' collection: the real seventeen, their own labels, no cover
 * URLs (the fixture is the collection's colours, not its images) — so
 * `cover` attaches one to Wired for a pull to show. `count` above seventeen
 * cycles the collection, exactly as Wall Density drew its three shelves of
 * forty: evidence for the open difference rule, not a feature.
 */
export function collectionSeats(cover: string | null, count: number): WallSeat[] {
  return Array.from({ length: count }, (_, index) => {
    const row = COLLECTION_SPINES[index % COLLECTION_SPINES.length];
    return {
      id: `collection-${index}`,
      section: 'Collection',
      label: spineLabel(row.artist, row.title),
      title: row.title,
      artist: row.artist,
      spineColour: row.resampled,
      coverUrl: row.title === 'Wired' ? cover : null,
      backUrl: null,
      labelName: null,
      catalogNumber: null,
    };
  });
}

/** Minimal summaries: the panel needs a title, an artist and a route. */
export function collectionSummaries(seats: readonly WallSeat[]): Record<string, RecordSummary> {
  return Object.fromEntries(
    seats.map((seat) => [
      seat.id,
      { title: seat.title, artist: seat.artist, year: null, href: `/records/${seat.id}`, furtherFacts: 0, snippet: null, factGroups: [] },
    ]),
  );
}
