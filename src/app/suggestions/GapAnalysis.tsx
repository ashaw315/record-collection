'use client';

import { useState } from 'react';
import Link from 'next/link';
import { askedLine } from './asked-line';

/**
 * SPEC.md §10's "Separate 'Ask Claude for gap analysis' button for §9.2".
 *
 * **User-initiated, never on load.** §9.2 is explicit, and the reason is that
 * every call spends a shared 10/hour budget against a real account. A component
 * that fetched in an effect would spend it on every render of a page the user
 * merely visited.
 */

type Suggestion = {
  artist: string;
  title: string;
  reason: string;
  genre: string;
};

type State =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'done'; suggestions: Suggestion[]; dropped: number }
  | { phase: 'error'; message: string };

/** A39: the last analysis, read on the server so it survives navigation. */
export type LastGapAnalysis = {
  suggestions: Suggestion[];
  dropped: number;
  askedAt: string | Date;
  recordsAddedSince: number;
};

export function GapAnalysis({
  configured,
  last,
}: {
  configured: boolean;
  last?: LastGapAnalysis | null;
}) {
  /*
   * **A39: the stored answer is the starting state, not a cache.** It is what
   * was said last time, shown so the user does not spend one of ten hourly
   * requests to be told it again. `ask()` below always calls — nothing here
   * intercepts the request.
   */
  const [state, setState] = useState<State>(
    last == null
      ? { phase: 'idle' }
      : { phase: 'done', suggestions: last.suggestions, dropped: last.dropped },
  );

  /*
   * Cleared once the user asks again, because the line describes the STORED
   * answer and a fresh one is current by definition.
   */
  const [asked, setAsked] = useState<LastGapAnalysis | null>(last ?? null);

  async function ask() {
    setState({ phase: 'loading' });
    setAsked(null);

    try {
      const response = await fetch('/api/suggestions/ai', { method: 'POST' });
      const body = await response.json();

      if (!response.ok) {
        /*
         * Each failure says what it is. A rate limit names when capacity
         * returns; an unreadable response says the answer could not be read
         * rather than that there are no gaps. §9.2 requires a user-visible
         * error rather than a crash, and R5's distinction requires these to be
         * different sentences.
         */
        const retryAt =
          typeof body?.error?.retryAt === 'string'
            ? new Date(body.error.retryAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })
            : null;

        setState({
          phase: 'error',
          message:
            retryAt === null
              ? (body?.error?.message ?? 'Could not get suggestions.')
              : `${body.error.message} Try again after ${retryAt}.`,
        });
        return;
      }

      setState({
        phase: 'done',
        suggestions: body.data.suggestions,
        dropped: body.data.dropped ?? 0,
      });
    } catch {
      setState({ phase: 'error', message: 'Could not reach the suggestion service.' });
    }
  }

  if (!configured) {
    /*
     * Named rather than hidden. A button that silently does nothing reads as
     * broken; saying which credential is missing turns a mystery into a
     * deployment task.
     */
    return (
      <p className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        Gap analysis is not configured on this deployment.
      </p>
    );
  }

  return (
    <div className="rounded-md border border-border p-4">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h2 className="font-medium">Ask Claude for a gap analysis</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Sends a summary of your collection — artists, genres, labels and want list. Never
            prices, dates, stores or notes.
          </p>
        </div>
        <button
          type="button"
          onClick={ask}
          disabled={state.phase === 'loading'}
          className="shrink-0 rounded-xs border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-60"
        >
          {state.phase === 'loading' ? 'Thinking…' : 'Ask Claude'}
        </button>
      </div>

      {state.phase === 'error' && (
        <p role="status" className="mt-3 text-sm text-destructive">
          {state.message}
        </p>
      )}

      {state.phase === 'done' && (
        <div className="mt-4">
          {/*
            §10b's labelling rule: this must read as GENERATED, not as something
            the app established. The heading says so and the reasons are
            attributed, because the app is asserting things about music it has
            not verified.
          */}
          {/*
            A39. States what the answer covers; it does not advise re-asking.
            Absent entirely for a fresh result, which is current by definition.
          */}
          {asked !== null && (
            <p data-testid="asked-line" className="mb-1 text-xs text-muted-foreground">
              {askedLine({
                askedAt: new Date(asked.askedAt),
                recordsAddedSince: asked.recordsAddedSince,
              })}
            </p>
          )}

          <p className="mb-2 text-xs text-muted-foreground">
            Generated by Claude. These are suggestions about music, not facts this app checked —
            verify before buying.
          </p>

          {state.suggestions.length === 0 ? (
            <p className="text-sm">No gaps suggested for this collection.</p>
          ) : (
            <ul className="space-y-3">
              {state.suggestions.map((suggestion) => (
                <li
                  key={`${suggestion.artist}-${suggestion.title}`}
                  className="rounded-xs border border-border p-3"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="text-sm font-medium">
                      {suggestion.artist} — {suggestion.title}
                    </h3>
                    {/*
                      §9.2 (A29e): prefills the form, never writes a row. The
                      title came from a model, and a direct write would put an
                      unverified assertion in the same table as records the user
                      typed.
                    */}
                    <Link
                      href={`/want-list/new?artist=${encodeURIComponent(suggestion.artist)}&title=${encodeURIComponent(suggestion.title)}`}
                      className="shrink-0 text-xs underline underline-offset-2"
                    >
                      Add to want list
                    </Link>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{suggestion.reason}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{suggestion.genre}</p>
                </li>
              ))}
            </ul>
          )}

          {state.dropped > 0 && (
            /*
              A29d: the drop is reported rather than silent. A shorter list with
              no explanation makes the model's error invisible.
            */
            <p className="mt-3 text-xs text-muted-foreground">
              {state.dropped === 1
                ? '1 suggestion was discarded for naming a genre outside your collection.'
                : `${state.dropped} suggestions were discarded for naming genres outside your collection.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
