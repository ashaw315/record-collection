import { PullProbe } from '../PullProbe';

/**
 * The animated pull, on a route of its own so it can be run and measured.
 *
 * Not linked, not a feature. The Wall 5b names continuity of identity and
 * turn-versus-cut as the one thing a drawing cannot settle, and recommends the
 * animated pull be built first — the wall is SVG in the DOM, so this IS the
 * artefact rather than a proxy for it.
 */
export const dynamic = 'force-dynamic';

export default function PullProbePage() {
  return (
    <main style={{ padding: 24, fontFamily: 'Geist, sans-serif' }}>
      <h1 style={{ font: "600 15px 'Geist', sans-serif", margin: '0 0 4px' }}>
        Pull probe — one polygon, one curve
      </h1>
      <p style={{ font: '400 13px/1.6 Geist, sans-serif', maxWidth: 620, margin: '0 0 18px' }}>
        Ease-out cubic on translation, scale and the shear resolving to zero. The record
        is a single polygon transformed, never swapped — so if identity fails to carry it
        fails for a reason other than the DOM losing the node.
      </p>
      <PullProbe />
    </main>
  );
}
