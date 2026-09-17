import { notFound } from 'next/navigation';
import { WallComposition } from '../../WallComposition';
import { spineLabel } from '../../spine-text';
import type { WallSeat } from '../../shelf-runs';
import { COLLECTION_SPINES } from '../../../../../test/fixtures/collection-spines';

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

/**
 * The fixture carries no cover URLs — it is the collection's colours, not its
 * images — so `?cover=<url>` attaches one to Wired for the pull to show. A
 * workbench parameter, like `?case=` on the page8a probe.
 */
function seatsWith(cover: string | null, count: number): WallSeat[] {
  /*
    `?count=200` cycles the collection's seventeen, exactly as Wall Density
    drew its three shelves of forty — the 200 case §11.1 says width and label
    do not cover. Evidence for the open difference rule, not a feature.
  */
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

export default async function WallLabelledProbePage({
  searchParams,
}: {
  searchParams: Promise<{ cover?: string; count?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { cover, count } = await searchParams;
  const seats = seatsWith(cover ?? null, Number(count) > 0 ? Number(count) : COLLECTION_SPINES.length);

  return (
    <main>
      <WallComposition
        seats={seats}
        summaries={Object.fromEntries(
          seats.map((seat) => [
            seat.id,
            { title: seat.title, artist: seat.artist, year: null, href: `/records/${seat.id}`, furtherFacts: 0, snippet: null, factGroups: [] },
          ]),
        )}
      />
    </main>
  );
}
