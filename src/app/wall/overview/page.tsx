import { notFound } from 'next/navigation';
import { WallOverview } from '../WallOverview';
import { SHELF_GAP, SPINE_HEIGHT } from '../geometry';
import type { ShelfSeat } from '../shelf-runs';

/**
 * The overview at true size, at both ends of the range.
 *
 * **Nothing had LOOKED at 200 records — only measured them.** Every previous
 * conclusion about density came from drawings at scales that turned out not to
 * be the wall's: the design file drew at a 120px spine, adopted it as a
 * constant, reasoned from it, and concluded the wall carries no labels. That is
 * the error this route exists to avoid repeating. Building the 1:1 component on
 * top of something only measured is the same move.
 *
 * **17 is the collection and 200 is the question.** The staircase, the band
 * separation and the section gaps all read differently at the two ends, so both
 * are here rather than one standing for the other.
 *
 * **404s in production, matching `/scene` and `/wall/probe`.** It is behind the
 * session cookie either way — not in `PUBLIC_PATHS` — so this is about a
 * workbench not being a deployable surface.
 *
 * **REMOVAL CONDITION.** When §10b's wall lands, this route, its nav-spec
 * exemption and this guard come out together, with `/plane` and `/wall/probe`.
 * A temporary route with no removal condition is indistinguishable from a
 * permanent one.
 */
export const dynamic = 'force-dynamic';

/**
 * Synthesised seats. The distribution is the collection's shape — five
 * top-level sections, unevenly sized — and the SEQUENCE is invented, exactly as
 * the density drawings did it. No database: this is a geometry harness.
 */
const SECTIONS = ['Jazz', 'Rock', 'Electronic', 'Soul', 'Punk'] as const;

function synthesise(count: number): ShelfSeat[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `synthetic-${index}`,
    /*
      Uneven runs rather than a clean cycle: a modulo would give every section
      the same width and make the section gaps read more regular than the
      collection's are.
    */
    section: SECTIONS[Math.floor(index / (3 + (index % 4))) % SECTIONS.length],
  }));
}

export default function WallOverviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <main style={{ padding: 24, fontFamily: 'Geist, sans-serif', background: '#f9f7f4' }}>
      <h1 style={{ font: "600 15px 'Geist', sans-serif", margin: '0 0 4px' }}>
        Wall overview — true size, unlabelled
      </h1>
      <p style={{ font: '400 13px/1.6 Geist, sans-serif', maxWidth: 640, margin: '0 0 6px' }}>
        Polygons only. Spine height {SPINE_HEIGHT}, thickness 17–24, shelf gap{' '}
        <strong>{SHELF_GAP}</strong> — the gap is the open question: it was authored rather
        than read from the scene, and doubled during the 120→240 rescale. This is the first
        rendering at which it can be judged by looking.
      </p>

      <section style={{ margin: '28px 0 0' }}>
        <h2 style={{ font: "600 13px 'Geist', sans-serif", margin: '0 0 8px' }}>
          17 records — the collection
        </h2>
        <WallOverview seats={synthesise(17)} pulledId={null} />
      </section>

      <section style={{ margin: '36px 0 0' }}>
        <h2 style={{ font: "600 13px 'Geist', sans-serif", margin: '0 0 8px' }}>
          200 records — five shelves of forty
        </h2>
        <WallOverview seats={synthesise(200)} pulledId={null} />
      </section>
    </main>
  );
}
