'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { snippetView } from './snippet-view';

/**
 * SPEC.md §10b's snippet on the record detail page.
 *
 * **Here rather than on the wall, and the line is looking versus editing.**
 * A19e already put the wall's facts in DOM rather than canvas so they could be
 * read; editing is one step further along the same line, and the snippet's
 * siblings — journal entries, prices, images — all live on this page. §7.8 makes
 * an edited snippet the user's text, and the user's text belongs where they
 * write everything else. The wall shows it read-only, with the same label.
 *
 * **The label is the point, not decoration.** §10b: labelled as generated, "in
 * the same register as Discogs estimates — never presented as fact the app
 * established." Nothing in the pipeline verified this text: withholding the
 * record's own facts is the only ENFORCED mitigation (unit 2), so the label
 * carries what the code cannot.
 */

type Props = {
  recordId: string;
  snippet: string | null;
  snippetEditedAt: Date | null;
  configured: boolean;
};

export function SnippetPanel({ recordId, snippet, snippetEditedAt, configured }: Props) {
  const router = useRouter();
  const view = snippetView({ snippet, snippetEditedAt });

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(snippet ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/records/${recordId}/snippet`, {
        method,
        ...(body === undefined
          ? {}
          : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.error?.message ?? 'That did not work. Try again.');
        return;
      }

      setEditing(false);
      router.refresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    /*
     * A31a: the affordance is OFFERED with its consequence named, never hidden.
     * Hiding it would treat the owner of the text as the threat §7.8 protects
     * against — and §7.3 already permits an explicit delete of an acquired
     * want-list row for exactly that reason.
     *
     * The confirmation fires ONLY when there is something to lose. Confirming
     * every regeneration would train the user to dismiss it, so the one that
     * matters gets dismissed too.
     */
    if (view.confirmBeforeRegenerating && view.confirmMessage !== null) {
      if (!window.confirm(view.confirmMessage)) return;
      await send('POST', { confirmReplace: true });
      return;
    }

    await send('POST');
  }

  return (
    <section className="mt-8" data-testid="snippet-panel">
      {/*
        **Wraps rather than squeezing.** This was `flex items-baseline
        justify-between` with `shrink-0` on the right-hand element. At 390px the
        unconfigured message — a full sentence — held its width and squeezed the
        heading into a three-line stack, "ABOUT / THIS / RECORD", beside it. Every
        other block on this screen is single-column, so it read as a broken
        fragment.

        `flex-wrap` with `shrink-0` on the HEADING instead: the heading keeps its
        line, and the long message drops beneath it when there is no room. On a
        wide screen nothing changes — the two still sit on one baseline.
      */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="shrink-0 font-heading text-sm tracking-wide uppercase text-muted-foreground">
          About this record
        </h2>

        {/*
          **Named when unconfigured, never silently absent** — the same choice
          `GapAnalysis` makes for §9.2, and for its reason: "a button that
          silently does nothing reads as broken; saying which credential is
          missing turns a mystery into a deployment task."

          Found by an E2E spec that could not click a button the test
          environment had no key for. The button vanishing was consistent with
          nothing, and A31a's whole argument is that hiding a capability with no
          explanation is the shape to avoid.
        */}
        {configured ? (
          <button
            type="button"
            data-testid="snippet-generate"
            onClick={regenerate}
            disabled={busy}
            className="shrink-0 text-xs underline underline-offset-2 disabled:opacity-60"
          >
            {busy ? 'Working…' : view.kind === 'absent' ? 'Write one' : 'Write a new one'}
          </button>
        ) : (
          <span
            data-testid="snippet-unconfigured"
            className="text-xs text-muted-foreground"
          >
            Writing notes is not configured on this deployment.
          </span>
        )}
      </div>

      {editing ? (
        <div className="mt-2">
          <label htmlFor="snippet-draft" className="sr-only">
            Snippet
          </label>
          <textarea
            id="snippet-draft"
            data-testid="snippet-draft"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={4}
            className="w-full rounded-xs border border-input bg-transparent p-2 text-sm"
          />
          <div className="mt-2 flex gap-3">
            <button
              type="button"
              data-testid="snippet-save"
              disabled={busy || draft.trim() === ''}
              onClick={() => send('PATCH', { snippet: draft.trim() })}
              className="rounded-xs border border-border px-3 py-1.5 text-sm disabled:opacity-60"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(snippet ?? '');
              }}
              className="text-sm text-muted-foreground underline underline-offset-2"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          {view.kind === 'absent' ? (
            /*
              §10b: "Absence is fine. A record with no snippet shows none, and no
              placeholder invites one." So this states a fact and does not nag.
            */
            <p data-testid="snippet-absent" className="mt-2 text-sm text-muted-foreground">
              No note about this record.
            </p>
          ) : (
            <>
              <p data-testid="snippet-text" className="mt-2 text-sm">
                {snippet}
              </p>

              {/*
                §10b's labelling rule. Once the user has edited it the text is
                THEIRS, and calling it generated would misattribute their writing
                to the model — the same error as presenting the model's writing
                as fact, in the other direction.
              */}
              <p
                data-testid={view.labelAsGenerated ? 'snippet-generated-label' : 'snippet-yours'}
                className="mt-1 text-xs text-muted-foreground"
              >
                {view.labelAsGenerated
                  ? 'Written by Claude — about the music, not a fact this app checked.'
                  : 'Your own note.'}
              </p>

              <div className="mt-2 flex gap-3">
                <button
                  type="button"
                  data-testid="snippet-edit"
                  onClick={() => setEditing(true)}
                  className="text-xs underline underline-offset-2"
                >
                  Edit
                </button>
                <button
                  type="button"
                  data-testid="snippet-delete"
                  disabled={busy}
                  onClick={() => send('DELETE')}
                  className="text-xs underline underline-offset-2 disabled:opacity-60"
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </>
      )}

      {error !== null && (
        <p role="alert" data-testid="snippet-error" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
