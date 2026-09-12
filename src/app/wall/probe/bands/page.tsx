import { notFound } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { RecordBands } from '@/app/records/[id]/RecordBands';

/**
 * 8a §2.1's bands, rendered so the heights can be MEASURED rather than declared.
 *
 * The unit tests pin the arithmetic — 53 + 500 + 300 + 47 = 900 — and cannot
 * see a border rendering outside its box. The design's own fix found exactly
 * that: the identity band's rule fell outside the declared 500px, so the sum
 * was right and the rendering was not. With no slack in 900px that is a silent
 * overflow, so the E2E measures `getBoundingClientRect` and asserts the total.
 *
 * **404s in production, and comes out with the other harnesses** — this route,
 * its nav-spec exemption and this guard go together when the detail screen
 * lands.
 */
export const dynamic = 'force-dynamic';

export default function BandProbePage() {
  if (process.env.NODE_ENV === 'production') notFound();

  const cell = (label: string) => (
    <div className="p-[18px] font-mono text-[11px] tracking-[0.09em] uppercase">{label}</div>
  );

  /*
    The AppHeader is included because 8a's budget counts it: 53 of the 900 are
    the nav, and measuring the bands without it would assert a total the real
    screen never renders.
  */
  return (
    <>
      <AppHeader />
      <RecordBands
        identity={cell('identity')}
        still={cell('still')}
        sleeve={cell('sleeve')}
        lower={[
          cell('provenance'),
          cell('matrix'),
          cell('year'),
          cell('market'),
          cell('journal'),
        ]}
      />
    </>
  );
}
