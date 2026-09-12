import { notFound } from 'next/navigation';
import { IdentityCell } from '@/app/records/[id]/IdentityCell';
import { BANDS } from '@/app/records/[id]/band-geometry';

/**
 * 8a's identity cell at four real title lengths, so the ANCHOR and the BREAK
 * can be measured.
 *
 * The titles are the real collection's: 38 characters (five lines), 29 (three),
 * 19 (two) and 6 (one). Rendered at the real cell width — 4 of 12 at 1440 =
 * 480px — inside the real 500px band.
 *
 * **404s in production; comes out with the other harnesses** — route, nav-spec
 * exemption and guard together when the detail screen lands.
 */
export const dynamic = 'force-dynamic';

const CASES = [
  { id: 'five', title: 'On The Radio: Greatest Hits Vol. 1 & 2', artist: 'Donna Summer' },
  { id: 'three', title: 'The Best Of The Blues Project', artist: 'The Blues Project' },
  { id: 'two', title: 'The Hurdy Gurdy Man', artist: 'Donovan' },
  { id: 'one', title: 'Meddle', artist: 'Pink Floyd' },
] as const;

export default function IdentityProbePage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <div className="flex gap-[20px] p-[20px]">
      {CASES.map((c) => (
        <div
          key={c.id}
          data-case={c.id}
          style={{ width: 480, height: BANDS.identity, outline: '1px solid oklch(0.85 0 0)' }}
        >
          <IdentityCell
            title={c.title}
            artistName={c.artist}
            pressingLine="Harvest · SHVL 795 · United Kingdom, 1981"
            formatLine="Vinyl, LP, Album"
          />
        </div>
      ))}
    </div>
  );
}
