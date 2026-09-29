import { notFound } from 'next/navigation';
import { IdentityCell } from '@/app/records/[id]/IdentityCell';
import { BANDS } from '@/app/records/[id]/band-geometry';
import { WORST } from '@/app/records/[id]/identity-extremes';
import { pressingLine } from '@/app/records/[id]/page-record';

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
  /*
    §27: the five-line case IS the shared worst case — title, artist, label,
    pressing, format and six genres from identity-extremes.ts. It carried the
    title alone with a one-line pressing and measured 462 where the real
    record needs 525, and a 16.5px row passed here while cutting the record.
  */
  { id: 'five', title: WORST.title, artist: WORST.artist, extreme: WORST },
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
          /* flexShrink 0: the five hosts are flex items, and until §45 (step 53) the blocks' fixed 412 held each at 448 by min-content. With the track free to shrink they collapsed to 232 and the ladder measured a cell the page never draws. The harness holds its own width. */
          style={{ width: 480, flexShrink: 0, height: BANDS.identity, outline: '1px solid oklch(0.85 0 0)' }}
        >
          <IdentityCell
            title={c.title}
            artistName={c.artist}
            artistId="a-probe"
            editHref="#"
            pressingLine={
              'extreme' in c
                ? pressingLine({ labelName: c.extreme.label, catalogNumber: c.extreme.catalogNumber, countryPressed: c.extreme.countryPressed, yearPressed: c.extreme.yearPressed })
                : 'Harvest · SHVL 795 · United Kingdom, 1981'
            }
            formatLine={'extreme' in c ? c.extreme.format : 'Vinyl, LP, Album'}
            /* Two, because the measure question this probe asks is about the
               block's height and a genres line is part of it. */
            /* Three, matching the drawing's five-line record: §4.2's collapse
               is measured against a three-genre run. */
            genres={
              'extreme' in c
                ? c.extreme.genres.map((name, i) => ({ id: `g${i}`, name }))
                : [
              { id: 'g1', name: 'Psychedelic Rock' },
              { id: 'g2', name: 'Prog Rock' },
              { id: 'g3', name: 'Folk Rock' },
                  ]
            }
          />
        </div>
      ))}
    </div>
  );
}
