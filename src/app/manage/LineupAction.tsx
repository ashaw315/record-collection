'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CONTROL_LABEL } from '@/app/records/[id]/grid-type';
import { HIT_ALONE } from '@/app/hit-area';
import type { ArtistSearchHit } from '@/lib/musicbrainz/search-artist';

/**
 * SPEC.md §12 step 11 — pulling an artist's band membership from MusicBrainz.
 *
 * **On demand, per artist, never a bulk crawl.** One walk is roughly 32
 * sequential requests at MusicBrainz's permitted one per second, so this runs
 * when the user asks and nowhere else.
 *
 * Two things this screen has to do that a spinner cannot:
 *
 * 1. **Say what it is doing.** Thirty-two seconds of spinner is
 *    indistinguishable from a hang, so it polls the membership count and shows
 *    "checked 12 members so far".
 * 2. **Let the user choose when the name is ambiguous.** Four artists are called
 *    Discharge; the name has already failed to identify them, so the picker
 *    shows what has not — the disambiguation comment and the life-span.
 */

/**
 * The wire shape of a candidate, taken FROM the endpoint's own type rather than
 * restated here.
 *
 * `lifeSpan` was previously declared locally as an optional field and no
 * producer ever set it, so `lifeSpanText` returned `''` on every candidate and
 * the disambiguating fact silently never rendered. An optional field makes that
 * invisible to the compiler — `undefined` typechecks — so the local restatement
 * was what allowed the client and the server to disagree in silence.
 *
 * Importing the server's type means the next field to go missing is a build
 * error rather than a blank space on screen.
 */
type Candidate = ArtistSearchHit;

/**
 * `import type`, which is ERASED at compile time — no `server-only` module
 * reaches the client bundle (CLAUDE.md §6). Verified by `npm run build`
 * succeeding, not assumed: a value import of the same module fails the build
 * with server-only's own error, which is the guard doing its job.
 */

type WalkResponse = {
  walked: boolean;
  candidates?: Candidate[];
  total?: number;
  checked?: number;
  partial?: boolean;
  text?: string;
};

/** How often the progress count is refreshed while a walk is running. */
const POLL_MS = 1_500;

/**
 * §T.6 part 2 (Design, 14 Oct): the LINEUP control sits with the row's
 * other actions, and "its progress line takes a reserved slot the row's
 * width beneath the row. At 1280 that is not the 60-wide actions cell,
 * where it ran to three lines." The two stand in different places, so the
 * walk lives here and the caller places them: `render` gets the control
 * and the status (null while there is nothing to say), and wraps the
 * status in the slot its layout has, a row under the table's row or a
 * block under the list's action row. The slot is one line of `text-meta`
 * held at that height (the reserved-slot rule), so the count replacing
 * "Asking MusicBrainz…" and the result replacing the count move nothing.
 */
export function LineupAction({
  artistId,
  artistName,
  render,
}: {
  artistId: string;
  artistName: string;
  render: (parts: { control: ReactNode; status: ReactNode | null }) => ReactNode;
}) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'walking'>('idle');
  const [found, setFound] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const walking = state === 'walking';
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /*
   * Progress comes from counting the rows the walk is already writing — it
   * commits each membership as it resolves one — rather than from a progress
   * table. Nothing to leave stale if the walk dies.
   */
  useEffect(() => {
    if (!walking) {
      if (pollRef.current !== null) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(() => {
      void fetch(`/api/artists/${artistId}/lineup/progress`)
        .then((response) => (response.ok ? response.json() : null))
        .then((body) => {
          if (body !== null && typeof body.found === 'number') setFound(body.found);
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => {
      if (pollRef.current !== null) clearInterval(pollRef.current);
    };
  }, [walking, artistId]);

  async function walk(musicbrainzId?: string) {
    setState('walking');
    setError(undefined);
    setCandidates(null);
    setResult(null);
    setFound(null);
    try {
      const response = await fetch(`/api/artists/${artistId}/lineup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(musicbrainzId === undefined ? {} : { musicbrainzId }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? 'Could not reach MusicBrainz.');
        return;
      }
      const body = (await response.json()) as WalkResponse;
      if (!body.walked) {
        setCandidates(body.candidates ?? []);
        return;
      }
      setResult(body.text ?? 'Done.');
      router.refresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setState('idle');
    }
  }

  const control = (
    /* A row's actions are §9.3 labels in words, LINEUP among them. */
    <button type="button" disabled={walking} onClick={() => void walk()} aria-label={`Fetch lineup for ${artistName}`} className={`${CONTROL_LABEL} ${HIT_ALONE} disabled:opacity-50`}>
      Lineup
    </button>
  );
  const status =
    !walking && result === null && candidates === null && error === undefined ? null : (
      <div className="min-h-[20px] text-meta text-muted-foreground">
        {walking && (
          <p data-testid="lineup-progress" role="status">
            {/*
              A COUNT, not a spinner. The walk is a request per member at one per
              second, so a screen that only says "working" is indistinguishable
              from one that has hung.
            */}
            {found === null ? 'Asking MusicBrainz…' : `Checked ${found} member${found === 1 ? '' : 's'} so far…`}
          </p>
        )}
        {result !== null && (
          <p data-testid="lineup-result" role="status">
            {result}
          </p>
        )}
        {candidates !== null && <CandidatePicker candidates={candidates} onPick={walk} />}
        {error !== undefined && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  return <>{render({ control, status })}</>;
}

/** The choices as hairline-separated rows the slot's width (§T.6 part 2), where they were boxed buttons in a 288-wide box. */
function CandidatePicker({ candidates, onPick }: { candidates: Candidate[]; onPick: (mbid: string) => void }) {
  if (candidates.length === 0) {
    return <p data-testid="lineup-picker">MusicBrainz has no artist by that name.</p>;
  }
  return (
    <div data-testid="lineup-picker" role="group" aria-label="Choose the right artist">
      <p>More than one artist has this name. Which one is it?</p>
      <ul className="mt-1">
        {candidates.map((candidate) => (
          <li key={candidate.mbid} className="border-t border-border last:border-b">
            <button type="button" data-testid="lineup-candidate" onClick={() => onPick(candidate.mbid)} className={`w-full py-2 text-left text-label text-foreground`}>
              <span className="block font-medium">{candidate.disambiguation ?? 'no description'}</span>
              <span className="mt-0.5 block text-muted-foreground">
                {[candidate.type, candidate.country, lifeSpanText(candidate.lifeSpan)]
                  .filter((part): part is string => part !== null && part !== undefined && part !== '')
                  .join(' · ')}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function lifeSpanText(lifeSpan: Candidate['lifeSpan']): string {
  if (lifeSpan === null || lifeSpan === undefined) return '';
  if (lifeSpan.begin === null) return '';

  // An open end is a band that never formally stopped, which is different from
  // one whose end date nobody recorded — but MusicBrainz does not distinguish
  // them, so neither does this.
  return lifeSpan.end === null ? `${lifeSpan.begin}–` : `${lifeSpan.begin}–${lifeSpan.end}`;
}
