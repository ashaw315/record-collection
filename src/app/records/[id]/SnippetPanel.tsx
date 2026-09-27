'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { RecordLadder } from '@/lib/colour/record-ladder';

import { Section } from './Section';
import { useRouter } from 'next/navigation';
import { snippetView } from './snippet-view';
import { ABOUT_CHAR_BUDGET, ABOUT_LINES, aboutBudget } from './about-cell';

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
  /** §5.5's base step, for §9.3's rail bar. Unmarked section, passed anyway so
      the primitive decides rather than the caller. */
  base: string | null;
  /** The record's ladder, for §25's figures and §26's flats. */
  ladder: RecordLadder | null;
};

/** Notifies on the frame paragraph's `data-clamped` attribute; a page with no frame About never notifies. */
function subscribeToFrameClamp(onChange: () => void): () => void {
  const frame = document.querySelector('[data-field="about"]');
  if (frame === null) return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(frame, { attributes: true, attributeFilter: ['data-clamped'] });
  return () => observer.disconnect();
}

export function SnippetPanel({ recordId, snippet, snippetEditedAt, configured, base, ladder }: Props) {
  const router = useRouter();
  const view = snippetView({ snippet, snippetEditedAt });
  /*
    §36: "when the frame clamps the About, the row carries the full text
    above the by-line, Edit and Delete; when the About fits, the row carries
    only those." Whether the frame clamps is measured the way the frame
    measures it -- lines at the frame paragraph's 322px measure -- with the
    character budget as the server's guess, exactly as AboutCell guesses.
  */
  /*
    The frame's own verdict, not a second measurement: AboutCell marks its
    paragraph `data-clamped` once it has measured its lines, so the row
    subscribes to that attribute and follows it. A hidden copy of the text in
    this section was the first build, and a locator counting the About's
    text in the row found it. On the server the budget is the guess, as it
    is for the frame.
  */
  const clamps = useSyncExternalStore(
    subscribeToFrameClamp,
    () => document.querySelector('[data-field="about"]')?.hasAttribute('data-clamped') ?? false,
    () => snippet !== null && snippet.length > ABOUT_CHAR_BUDGET,
  );

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
    <Section name="snippet" title="About this record" base={base} shape="body" ladder={ladder}>
      {/*
        **The body in the 6, the action in the 4** — §9.1's `body` split is "a
        body with an action beside it", and a section that declares it must
        fill both cells. Passing one child left the second empty, which renders
        as a box beside the content and, at 390px, took the clicks meant for
        what was under it.
      */}
      <div data-testid="snippet-panel">
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
            className="w-full rounded-xs border border-input bg-transparent p-2 text-typed"
          />
          <AboutBudget text={draft} />
          <div className="mt-2 flex gap-3">
            <button
              type="button"
              data-testid="snippet-save"
              disabled={busy || draft.trim() === ''}
              onClick={() => send('PATCH', { snippet: draft.trim() })}
              className="rounded-xs border border-border px-3 py-1.5 text-label disabled:opacity-60"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(snippet ?? '');
              }}
              className="text-label text-muted-foreground underline underline-offset-2"
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
            <p data-testid="snippet-absent" className="mt-2 text-prose text-muted-foreground">
              No note about this record.
            </p>
          ) : (
            <>
              {/*
                **§33: "The lower About row keeps its controls and drops its
                text: it is the About's editor... an editor does not need to
                repeat what the frame shows."** The text was here as
                `snippet-text`; the frame's last cell is now where it is read,
                and a second full copy on one page was "too high a price for
                two clipped lines". What stays is the attribution and the
                controls -- the row is the About's editor, as §8.1 makes §9's
                Acquisition the editor of the frame's provenance.
              */}
              {/*
                §10b's labelling rule. Once the user has edited it the text is
                THEIRS, and calling it generated would misattribute their writing
                to the model — the same error as presenting the model's writing
                as fact, in the other direction.
              */}
              {clamps && snippet !== null && (
                <p data-testid="snippet-full" className="text-prose whitespace-pre-line">
                  {snippet}
                </p>
              )}
              <p
                data-testid={view.labelAsGenerated ? 'snippet-generated-label' : 'snippet-yours'}
                className="mt-1 text-meta text-muted-foreground"
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
                  className="text-label underline underline-offset-2"
                >
                  Edit
                </button>
                <button
                  type="button"
                  data-testid="snippet-delete"
                  disabled={busy}
                  onClick={() => send('DELETE')}
                  className="text-label underline underline-offset-2 disabled:opacity-60"
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </>
      )}

      {error !== null && (
        <p role="alert" data-testid="snippet-error" className="mt-2 text-prose text-destructive">
          {error}
        </p>
      )}
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
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
            className="shrink-0 text-label underline underline-offset-2 disabled:opacity-60"
          >
            {busy ? 'Working…' : view.kind === 'absent' ? 'Write one' : 'Write a new one'}
          </button>
        ) : (
          <span
            data-testid="snippet-unconfigured"
            className="text-meta text-muted-foreground"
          >
            Writing notes is not configured on this deployment.
          </span>
        )}
      </div>
    </Section>
  );
}


/**
 * §33: "Claude writes it to fit ten lines of the cell... Code converts the
 * ten lines to a character budget measured on the collection's own text, and
 * the editor states it."
 *
 * **Lines are the rule and characters are the guide, so both are stated.**
 * The line count is MEASURED: the draft is laid out in a hidden copy at the
 * frame cell's measure -- 322px wide, 13px at the built leading -- and the
 * lines it sets to are read back, because a 555-character About renders to
 * ten lines and a 552-character stand-in to eleven. The character budget is
 * the floor of the measured range, 535, so a draft under it fits on every
 * text in the collection and a draft over it may or may not.
 */
export function AboutBudget({ text }: { text: string }) {
  const probe = useRef<HTMLParagraphElement>(null);
  const [lines, setLines] = useState<number | null>(null);
  /*
    §34: "the editor reports whether the text clamps in the rendered cell".
    The draft is laid out at the FRAME paragraph's width and counted against
    the line budget that paragraph publishes -- what this cell holds at this
    width -- not at a fixed 322px against ten, which was 1440's answer at
    every width. Without a frame paragraph (no About yet) the 1440 figures
    stand in, and the line says so by reporting them.
  */
  const [cell, setCell] = useState<{ width: number; lines: number }>({ width: 322, lines: ABOUT_LINES });
  useEffect(() => {
    const frame = document.querySelector<HTMLElement>('[data-field="about"]');
    if (frame === null) return;
    const read = () => {
      const width = frame.getBoundingClientRect().width;
      const budget = Number(frame.getAttribute('data-line-budget'));
      setCell({ width: width > 0 ? width : 322, lines: Number.isFinite(budget) && budget > 0 ? budget : ABOUT_LINES });
    };
    read();
    const resize = new ResizeObserver(read);
    resize.observe(frame);
    const mutation = new MutationObserver(read);
    mutation.observe(frame, { attributes: true, attributeFilter: ['data-line-budget'] });
    return () => { resize.disconnect(); mutation.disconnect(); };
  }, []);
  useEffect(() => {
    const el = probe.current;
    if (el === null) return;
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
    setLines(text.trim() === '' ? 0 : Math.round(el.getBoundingClientRect().height / lineHeight));
  }, [text, cell.width]);
  const { chars, budget } = aboutBudget(text);
  const past = lines !== null && lines > cell.lines;
  /*
    §34: "the editor reports whether the text clamps in the rendered cell,
    not whether it exceeds 535; it never says 'over' on a text that fits."
    The clamp is the measured line count against ten; the budget is stated
    as the guide it is.
  */
  return (
    <>
      <p data-testid="about-budget" className="mt-1 text-meta text-muted-foreground" aria-live="polite">
        {lines === null ? '' : `${lines} of ${cell.lines} lines · `}
        {chars} of about {budget} characters
        {past ? ` · past ${cell.lines} lines: the frame will show ${cell.lines - 1} and more ↓` : ''}
      </p>
      {/* The frame cell's measure, so the line count is the one the cell will draw. */}
      <p
        ref={probe}
        aria-hidden="true"
        className="text-prose"
        style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none', width: cell.width, whiteSpace: 'pre-line' }}
      >
        {text}
      </p>
    </>
  );
}
