import { notFound } from 'next/navigation';
import { IdentityCell } from '@/app/records/[id]/IdentityCell';
import { IsoMark } from '@/app/records/[id]/RecordPage8a';
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
  /* Four lines: the case the ornament track's resolved figures are stated at,
     and the one between "shrinks a little" and "nearly gone". */
  { id: 'four', title: 'Hear Nothing See Nothing Say Nothing', artist: 'Discharge' },
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
            artistId="a-probe"
            pressingLine="Harvest · SHVL 795 · United Kingdom, 1981"
            formatLine="Vinyl, LP, Album"
            /* Two, because the measure question this probe asks is about the
               block's height and a genres line is part of it. */
            genres={[
              { id: 'g1', name: 'Psychedelic Rock' },
              { id: 'g2', name: 'Prog Rock' },
            ]}
            /*
              **The real mark, not an empty track.** The probe rendered no
              ornament at all, so the first version of the shrink assertion
              measured a track with nothing in it — a weaker claim than the one
              it was named for, and one an empty div would satisfy.
            */
            ornament={
              <IsoMark
                name="identityTriangle"
                fill="oklch(0.86 0.04 80)"
                size={1.5}
                className="right-[6px] bottom-0 h-full w-[124px]"
              />
            }
          />
        </div>
      ))}
    </div>
  );
}
