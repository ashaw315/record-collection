'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

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

type Candidate = {
  mbid: string;
  name: string;
  type: string | null;
  country: string | null;
  disambiguation: string | null;
  lifeSpan?: { begin: string | null; end: string | null; ended: boolean } | null;
};

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

export function LineupAction({ artistId, artistName }: { artistId: string; artistName: string }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'walking'>('idle');
  const [found, setFound] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);

  const walking = state === 'walking';

  /**
   * Progress comes from counting the rows the walk is already writing — it
   * commits each membership as it resolves one — rather than from a progress
   * table. Nothing to leave stale if the walk dies.
   */
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
        /**
         * §4.3: two or more hits share the name, so the user picks. An empty
         * list is an answer too — MusicBrainz has no artist by that name.
         */
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

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="ghost"
        disabled={walking}
        onClick={() => void walk()}
        aria-label={`Fetch lineup for ${artistName}`}
      >
        Lineup
      </Button>

      {walking && (
        <p data-testid="lineup-progress" role="status" className="text-xs text-muted-foreground">
          {/*
            A COUNT, not a spinner. The walk is a request per member at one per
            second, so a screen that only says "working" is indistinguishable
            from one that has hung.
          */}
          {found === null
            ? 'Asking MusicBrainz…'
            : `Checked ${found} member${found === 1 ? '' : 's'} so far…`}
        </p>
      )}

      {result !== null && (
        <p data-testid="lineup-result" role="status" className="text-xs text-muted-foreground">
          {result}
        </p>
      )}

      {candidates !== null && <CandidatePicker candidates={candidates} onPick={walk} />}

      {error !== undefined && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * **The name is not on the card, because the name is what failed.**
 *
 * These candidates are here precisely because two or more share it. What
 * separates them is MusicBrainz's own disambiguation comment and the life-span —
 * 1977–ongoing against 1978–1980 identifies the two Discharges at a glance.
 *
 * Release counts would say less and cost one extra request per candidate at one
 * per second.
 */
function CandidatePicker({
  candidates,
  onPick,
}: {
  candidates: Candidate[];
  onPick: (mbid: string) => void;
}) {
  if (candidates.length === 0) {
    return (
      <p data-testid="lineup-picker" className="text-xs text-muted-foreground">
        MusicBrainz has no artist by that name.
      </p>
    );
  }

  return (
    <div
      data-testid="lineup-picker"
      role="group"
      aria-label="Choose the right artist"
      className="mt-1 w-72 rounded-xs border border-border p-2 text-left"
    >
      <p className="text-xs text-muted-foreground">
        More than one artist has this name. Which one is it?
      </p>

      <ul className="mt-2 space-y-1">
        {candidates.map((candidate) => (
          <li key={candidate.mbid}>
            <button
              type="button"
              data-testid="lineup-candidate"
              onClick={() => onPick(candidate.mbid)}
              className="w-full rounded-xs border border-border p-2 text-left text-xs hover:bg-accent"
            >
              <span className="block font-medium">
                {candidate.disambiguation ?? 'no description'}
              </span>
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

/** "1977–1980" / "1977–" — the fact that most cheaply separates two bands. */
function lifeSpanText(lifeSpan: Candidate['lifeSpan']): string {
  if (lifeSpan === null || lifeSpan === undefined) return '';
  if (lifeSpan.begin === null) return '';

  // An open end is a band that never formally stopped, which is different from
  // one whose end date nobody recorded — but MusicBrainz does not distinguish
  // them, so neither does this.
  return lifeSpan.end === null ? `${lifeSpan.begin}–` : `${lifeSpan.begin}–${lifeSpan.end}`;
}
