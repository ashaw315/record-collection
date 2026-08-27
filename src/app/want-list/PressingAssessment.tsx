'use client';

import { useState } from 'react';
import { verdictPresentation } from './pressing-verdict';
import type { PressingVerdict } from '@/lib/llm/pressing-assessment-client';

/**
 * SPEC.md §12b (A43) — is the pressing worth chasing, and which one.
 *
 * **A model's assertion, displayed as such and never stored.** §9.2's standing:
 * the app assembles the material and orders the question; the user decides.
 * Nothing here writes to the row — `best_dig_notes` stays the user's own field,
 * and text a model produced sitting there would be indistinguishable from text
 * they wrote (§7.8's ownership lesson, applied before the fact).
 */

type Assessment = {
  verdict: PressingVerdict;
  pressings: Array<{ description: string; identifier: string }>;
  dropped: number;
  askedAt: string;
};

const TONE = {
  positive: 'border-l-2 border-l-foreground',
  settled: 'border-l-2 border-l-muted-foreground',
  open: 'border-l-2 border-l-dashed border-l-border',
} as const;

export function PressingAssessment({
  itemId,
  stored,
}: {
  itemId: string;
  /**
   * The assessment already on this row, read server-side (A43).
   *
   * **A stored answer is shown without spending a request**, because a pressing
   * assessment is a claim about an album's pressing history and does not go
   * stale — the distinction from A39, whose gap analysis IS about a collection
   * that changes.
   */
  stored?: Assessment | null;
}) {
  const [assessment, setAssessment] = useState<Assessment | null>(stored ?? null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function ask(refresh = false) {
    setAsking(true);
    setError(undefined);
    try {
      // `fresh=1` only on a deliberate re-ask: the plain call reuses a stored
      // answer and spends nothing.
      const response = await fetch(
        `/api/want-list/${itemId}/pressing-assessment${refresh ? '?fresh=1' : ''}`,
        { method: 'POST' },
      );
      const body = await response.json();

      if (!response.ok) {
        const retryAt =
          typeof body?.error?.retryAt === 'string'
            ? new Date(body.error.retryAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })
            : null;

        setError(
          retryAt === null
            ? (body?.error?.message ?? 'Could not get an assessment.')
            : `${body.error.message} Capacity returns at ${retryAt}.`,
        );
        return;
      }

      setAssessment(body.data);
    } catch {
      setError('Could not reach the assessment service.');
    } finally {
      setAsking(false);
    }
  }

  async function clear() {
    setAsking(true);
    try {
      await fetch(`/api/want-list/${itemId}/pressing-assessment`, { method: 'DELETE' });
      setAssessment(null);
    } finally {
      setAsking(false);
    }
  }

  const presented = assessment === null ? null : verdictPresentation(assessment.verdict);

  return (
    <section data-testid="pressing-assessment" className="mt-5 border-t border-border pt-3">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Does the pressing matter?
      </h2>

      {/*
        **Per-row and never automatic** (§10a, §9.2): every call spends one of
        ten hourly requests, so it happens when asked and never on page load.
      */}
      {assessment === null && (
        <div className="mt-2">
          <button
            type="button"
            data-testid="ask-pressing"
            disabled={asking}
            onClick={() => void ask()}
            className="text-sm underline underline-offset-2 disabled:text-muted-foreground"
          >
            {asking ? 'Asking…' : 'Ask Claude'}
          </button>
          <p className="mt-1 text-xs text-muted-foreground">
            Sends the artist and title only. Uses one of ten hourly requests.
          </p>
        </div>
      )}

      {error !== undefined && (
        <p role="status" data-testid="assessment-error" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {assessment !== null && presented !== null && (
        <div
          data-testid={`verdict-${assessment.verdict}`}
          className={`mt-2 pl-3 ${TONE[presented.tone]}`}
        >
          {/*
            **The marker carries the state before any word is read.** Adam's
            constraint is habituation rather than clarity: two similar grey
            paragraphs stop being distinguished within a week, so the difference
            lives in structure rather than in wording — which is the part a
            reader stops parsing once a screen is familiar.
          */}
          <p className="text-sm font-medium">
            <span aria-hidden className="mr-1">
              {presented.marker}
            </span>
            {presented.heading}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{presented.detail}</p>

          {presented.actionable && assessment.pressings.length > 0 && (
            <ul data-testid="pressings-to-hunt" className="mt-2 space-y-1">
              {assessment.pressings.map((pressing) => (
                <li key={pressing.identifier} className="text-sm">
                  <span>{pressing.description}</span>
                  {/*
                    Mono, because this is the string compared character by
                    character against the object — 14c's reasoning for the
                    runout, applied to the same class of value.
                  */}
                  <span className="ml-1 font-mono text-xs text-muted-foreground">
                    {pressing.identifier}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/*
            A29d's rule: a shorter answer with no explanation makes the model's
            error invisible. Something was said and discarded for naming nothing
            checkable, and the user is told rather than left with a quiet gap.
          */}
          {assessment.dropped > 0 && (
            <p data-testid="assessment-dropped" className="mt-2 text-xs text-muted-foreground">
              {assessment.dropped === 1
                ? '1 suggestion was discarded for naming nothing you could check against a record.'
                : `${assessment.dropped} suggestions were discarded for naming nothing you could check against a record.`}
            </p>
          )}

          {/*
            §10b's labelling rule, and A43's: this is the model's assertion about
            music, not something the app verified.
          */}
          <p className="mt-2 text-xs text-muted-foreground italic">
            Claude’s assessment, not a fact this app checked — verify against the record.
          </p>

          {/*
            **Re-ask and delete, never EDIT** (§7.8). Editing transfers
            ownership, and an edited assessment would be neither Claude's nor
            cleanly the user's while still carrying Claude's name.
            `best_dig_notes` is where the user's own judgement goes, and keeping
            them apart is what makes disagreement visible.

            Re-asking says it costs a request, because a stored answer costs
            nothing and the difference should be the user's choice.
          */}
          <div className="mt-2 flex gap-3">
            <button
              type="button"
              data-testid="reask-pressing"
              disabled={asking}
              onClick={() => void ask(true)}
              className="text-xs underline underline-offset-2 disabled:text-muted-foreground"
            >
              {asking ? 'Asking…' : 'Ask again (uses a request)'}
            </button>
            <button
              type="button"
              data-testid="clear-pressing"
              disabled={asking}
              onClick={() => void clear()}
              className="text-xs text-muted-foreground underline underline-offset-2"
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
