import { notFound } from 'next/navigation';
import { IsolateProbe } from '../../IsolateProbe';

/**
 * The isolation harness (see IsolateProbe): the motion probe's exact
 * configuration drawn by the build's own code, with each thing the build
 * adds — the finish, a fixed frame, the unit's furniture, the label size —
 * as a switch. Dev only; it comes out when the difference is found.
 *
 *   ?finish=1 · ?frame=fixed · ?furniture=1 · ?floor=0 · ?label=10.39
 */
export const dynamic = 'force-dynamic';

export default async function IsolateProbePage({
  searchParams,
}: {
  searchParams: Promise<{ finish?: string; frame?: string; furniture?: string; floor?: string; label?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const p = await searchParams;
  return (
    <main>
      <IsolateProbe
        config={{
          finish: p.finish === '1',
          frame: p.frame === 'fixed' ? 'fixed' : 'refit',
          furniture: p.furniture === '1',
          floor: p.floor !== '0',
          labelSize: Number(p.label) > 0 ? Number(p.label) : 6.5,
        }}
      />
    </main>
  );
}
