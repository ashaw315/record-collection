import { notFound } from 'next/navigation';
import { WallLive } from '../../WallLive';
import { spineLabel } from '../../spine-text';
import type { WallSeat } from '../../shelf-runs';
import { COLLECTION_SPINES } from '../../../../../test/fixtures/collection-spines';

/**
 * The wall at 1:1 on the real collection — seventeen records, their own
 * labels, outlines at rest (§11); click one to pull it and watch its colour
 * arrive across the gesture.
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
function seatsWith(cover: string | null): WallSeat[] {
  return COLLECTION_SPINES.map((row, index) => ({
    id: `collection-${index}`,
    section: 'Collection',
    label: spineLabel(row.artist, row.title),
    spineColour: row.resampled,
    coverUrl: row.title === 'Wired' ? cover : null,
  }));
}

export default async function WallLabelledProbePage({
  searchParams,
}: {
  searchParams: Promise<{ cover?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { cover } = await searchParams;
  const seats = seatsWith(cover ?? null);

  return (
    <main style={{ padding: 24, background: '#f9f7f4' }}>
      <h1 style={{ font: "600 15px 'Geist', sans-serif", margin: '0 0 12px' }}>
        Wall at 1:1 — labelled, on the collection
      </h1>
      <div style={{ maxWidth: 1000 }}>
        <WallLive seats={seats} />
      </div>
    </main>
  );
}
