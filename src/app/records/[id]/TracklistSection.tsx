import type { RecordLadder } from '@/lib/colour/record-ladder';
import { DisclosureMark } from '@/app/disclosure-mark';
import { Section } from './Section';
import { HAIRLINE, INK, LABEL } from './grid-type';
import type { TracklistModel } from './tracklist';

/**
 * **§65: the TRACKLIST section (173b).** The tracks drawn whole by position and title, in two columns from 960 (one
 * below, by the region stylesheet's rule on `[data-tracks]`), and the credits folded beneath them behind one line that
 * counts them: closed whenever the page loads, at every count, and absent where the fold would hold nothing, so the
 * section at rest is the tracklist and one line whatever the release holds. Opened, the release's credits first, one
 * line to a role, then each track's beneath its position and title, then the companies drawn; what is drawn and in what
 * words is the model's (173a), and this only lays it out. A record with no cached release draws no section (§65, §38).
 *
 * One child in `shape="one"`: the fold must run under both track columns, and a third child of a `pair` would be dropped
 * by the split. The companies' place after the tracks' credits is chosen by default; §65 says they stand among the
 * credits and does not say where.
 */
export function TracklistSection({ model, base, ladder }: { model: TracklistModel | null; base: string | null; ladder: RecordLadder | null }) {
  if (model === null) return null;
  const half = Math.ceil(model.tracks.length / 2);
  const columns = [model.tracks.slice(0, half), model.tracks.slice(half)];
  const line = `text-detail ${INK} py-1`;
  return (
    <Section name="tracklist" title="Tracklist" base={base} shape="one" ladder={ladder}>
      <div>
        <div data-tracks="" className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 0 }}>
          {columns.map((tracks, index) => (
            <ol key={index} data-tracks-column={index} className="min-w-0 list-none">
              {tracks.map((track) => (
                <li key={track} className={line}>{track}</li>
              ))}
            </ol>
          ))}
        </div>
        {model.countLine !== null && (
          <details className={`group mt-2 border-t ${HAIRLINE} pt-2`} data-fold="credits">
            <summary className={`${LABEL} flex cursor-pointer list-none items-center justify-between py-1 [&::-webkit-details-marker]:hidden`}>
              {model.countLine}
              <DisclosureMark open="details" />
            </summary>
            {model.release.length > 0 && (
              <ul data-credits="release" className="mt-2 list-none">
                {model.release.map((entry) => <li key={entry} className={line}>{entry}</li>)}
              </ul>
            )}
            {model.byTrack.map((t) => (
              <div key={t.track} data-credits="track" className="mt-2">
                <div className={LABEL}>{t.track}</div>
                <ul className="list-none">
                  {t.lines.map((entry) => <li key={entry} className={line}>{entry}</li>)}
                </ul>
              </div>
            ))}
            {model.companies.length > 0 && (
              <ul data-credits="companies" className="mt-2 list-none">
                {model.companies.map((entry) => <li key={entry} className={line}>{entry}</li>)}
              </ul>
            )}
          </details>
        )}
      </div>
    </Section>
  );
}
