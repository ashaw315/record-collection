'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { OpenMatchCandidate } from '@/lib/db/queries/artist-match-candidates';
import { mergeSummary } from './merge-summary';

/**
 * SPEC.md §4.3 — the possible-duplicate review.
 *
 * **Two artists, identical names, and the names are therefore useless.** A pair
 * lands here BECAUSE the names match, so this screen has to show what separates
 * them: the MusicBrainz id, formed year, country, and above all how many
 * records each already has. An artist with eleven records is the one being
 * collected; a freshly imported row with none is new.
 *
 * **"Different artists" is never HARDER than "same artist".** Both are offered
 * side by side, same weight, neither styled as the default, and declining is
 * one click. If declining were the longer path the review would degrade into a
 * merge button with extra steps.
 *
 * Merging takes one extra step — a confirmation — and that is not asymmetry in
 * the wrong direction: it is asymmetry matching the DAMAGE. A wrong merge is
 * irreversible, invisible and self-reinforcing, because every later import
 * matches the id attached in error. A wrong decline leaves two artists in a
 * list and can be revisited.
 */
export function MatchReview({ candidates }: { candidates: OpenMatchCandidate[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  /**
   * Which pair is awaiting confirmation. Merging is irreversible, so it takes a
   * second deliberate action — "different artists" does not, because a recorded
   * opinion can be revisited and the asymmetry in the UI must match the
   * asymmetry in the damage.
   */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);

  /**
   * Nothing to review renders nothing. A permanently visible empty panel trains
   * the user to ignore the place warnings appear.
   */
  if (candidates.length === 0) return null;

  async function answer(id: string, resolution: 'merged' | 'distinct') {
    setBusy(id);
    setError(undefined);

    try {
      const response = await fetch(`/api/artists/match-candidates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution }),
      });

      if (!response.ok) {
        setError('That could not be saved. Nothing was changed.');
        return;
      }

      router.refresh();
    } catch {
      setError('Could not reach the server. Nothing was changed.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section data-testid="match-review" className="mb-6 rounded-xs border border-border p-3">
      <h2 className="font-heading text-sm font-semibold tracking-tight">
        Possible duplicate artists
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        An import found {candidates.length === 1 ? 'an artist' : 'artists'} sharing a name with
        {candidates.length === 1 ? ' one' : ' ones'} you already had. Two bands genuinely can
        share a name, so nothing was merged.
      </p>

      <ul className="mt-3 space-y-3">
        {candidates.map((candidate) => (
          <li
            key={candidate.id}
            data-testid="match-candidate"
            className="rounded-xs border border-border p-3 text-sm"
          >
            <p className="font-medium">{candidate.artist.name}</p>

            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <ArtistFacts label="Imported" artist={candidate.artist} />
              <ArtistFacts label="Already in your collection" artist={candidate.candidate} />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {/*
                Order and weight are deliberate: the safe answer is not hidden
                behind the dangerous one, and neither is styled as the default.
              */}
              <Button
                type="button"
                variant="outline"
                disabled={busy !== null}
                onClick={() => void answer(candidate.id, 'distinct')}
              >
                Different artists
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy !== null}
                onClick={() => setConfirming(candidate.id)}
              >
                Same artist
              </Button>
            </div>

            {confirming === candidate.id && (
              <div
                data-testid="merge-confirm"
                role="group"
                aria-label="Confirm merge"
                className="mt-3 rounded-xs border border-destructive/40 p-3 text-xs"
              >
                {/*
                  Names what MOVES and what is DESTROYED, the way the delete
                  confirmation does. A user told only what they gain cannot
                  weigh what they lose.
                */}
                <p>{mergeSummary(candidate.plan).moves}</p>
                {mergeSummary(candidate.plan).discards !== null && (
                  <p className="mt-1">{mergeSummary(candidate.plan).discards}</p>
                )}
                <p className="mt-1 font-medium text-destructive">
                  {mergeSummary(candidate.plan).warning}
                </p>

                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => setConfirming(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void answer(candidate.id, 'merged')}
                  >
                    {busy === candidate.id ? 'Merging…' : 'Merge them'}
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {error !== undefined && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

/** The facts that actually separate two artists with one name. */
function ArtistFacts({
  label,
  artist,
}: {
  label: string;
  artist: OpenMatchCandidate['artist'];
}) {
  const details = [
    artist.formedYear === null ? null : `formed ${artist.formedYear}`,
    artist.originCountry,
  ].filter((part): part is string => part !== null && part !== '');

  return (
    <div className="rounded-xs bg-muted/40 p-2 text-xs">
      <p className="tracking-wide text-muted-foreground uppercase">{label}</p>

      {/*
        The record count first — the strongest signal on the screen. Stated in
        words rather than as a bare number so "0 records" cannot be misread as
        a missing value.
      */}
      <p className="mt-1 font-medium text-foreground">
        {artist.recordCount} record{artist.recordCount === 1 ? '' : 's'}
      </p>

      {details.length > 0 && <p className="mt-0.5 text-muted-foreground">{details.join(' · ')}</p>}

      <p className="mt-0.5 font-mono break-all text-muted-foreground">
        {artist.musicbrainzId ?? 'no MusicBrainz id'}
      </p>
    </div>
  );
}
