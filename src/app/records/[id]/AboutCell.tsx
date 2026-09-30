'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LABEL } from './grid-type';
import { ABOUT_LINES, ABOUT_QUALIFIER, aboutBudget, aboutControlLine } from './about-cell';
import { snippetView } from './snippet-view';

/**
 * **§53 (step 60a): the About cell is the About's only place.** "It reads,
 * writes, edits and deletes it, and the lower About row is removed... At
 * rest the cell carries four things, in this order: the ABOUT label, the
 * scrolling prose, one line of controls, and the IMAGES row at its foot."
 *
 * The prose: §42 (step 50), "an About longer than its cell scrolls inside
 * the cell; there is no clamp and no more link... labelled 'About this
 * record', so a keyboard can scroll it." The region takes the cell's
 * remaining height and publishes the lines it holds (34/editor-reports-clamp).
 *
 * The controls: the by-line's short form, then Edit, Delete and Write a new
 * one, in the label's 11px mono. §10b's qualifier is the generate control's
 * own visible sentence -- never a title, which no touch or keyboard reader
 * would see -- beside Write one in the absence state and beside Save and
 * Cancel while editing, and not in the resting line, where it cost a row.
 * Editing replaces the prose in place: the textarea takes the region's
 * measured height and scrolls, the budget line takes the control line's
 * first row and Save and Cancel its second, so at 1440, where the control
 * line already wraps to two rows, nothing else in the cell moves.
 */

const SEP = ' · ';

function useAboutRequests(recordId: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/records/${recordId}/snippet`, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(payload?.error?.message ?? 'That did not work. Try again.');
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError('Could not reach the server.');
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, send };
}

const CONTROL = 'underline underline-offset-2 disabled:opacity-60';

export function AboutCell({ recordId, text, editedAt, configured }: { recordId: string; text: string; editedAt: string | null; configured: boolean }) {
  const region = useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = useState(false);
  const [linesHeld, setLinesHeld] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  /* The region's height when Edit was pressed, published for the spec: the textarea takes the region's space, less any row the control block grows by. */
  const [regionHeight, setRegionHeight] = useState<number | null>(null);
  const { busy, error, send } = useAboutRequests(recordId);
  const view = snippetView({ snippet: text, snippetEditedAt: editedAt === null ? null : new Date(editedAt) });
  const line = aboutControlLine({ about: text, editedAt, configured });

  useEffect(() => {
    const el = region.current;
    if (el === null) return;
    const measure = () => {
      setScrolls(el.scrollHeight > el.clientHeight + 1);
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
      setLinesHeld(lineHeight > 0 ? Math.floor(el.clientHeight / lineHeight + 1e-6) : null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, editing]);

  const startEditing = () => {
    setRegionHeight(region.current?.clientHeight ?? null);
    setDraft(text);
    setEditing(true);
  };
  const save = async () => {
    if (await send('PATCH', { snippet: draft.trim() })) setEditing(false);
  };
  const regenerate = async () => {
    if (view.confirmBeforeRegenerating && view.confirmMessage !== null) {
      if (!window.confirm(view.confirmMessage)) return;
      await send('POST', { confirmReplace: true });
      return;
    }
    await send('POST');
  };

  return (
    <>
      {editing ? (
        <textarea
          data-testid="snippet-draft"
          aria-label="About this record"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          data-region-height={regionHeight ?? undefined}
          /*
            §53 says two things at once: the textarea takes the prose region's
            height, and nothing else in the cell moves. Both hold where the
            control block keeps its row count between rest and editing, which
            at 1440 is the generated, configured case (two rows either way).
            Where the rest line is one row -- an edited About, or no writing
            key -- the budget row and Save/Cancel need a second, and the two
            sentences cannot both hold. The IMAGES foot is on the cell's floor
            (§3) and the cell clips, so the foot stays and the textarea gives
            up the row: it flexes into the region's space like the region did.
          */
          className="text-prose mt-[6px] w-full min-h-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent p-0 whitespace-pre-line focus:outline-none"
        />
      ) : (
        <div
          ref={region}
          data-field="about"
          data-scrolls={scrolls ? '' : undefined}
          data-line-budget={linesHeld ?? undefined}
          role="region"
          aria-label="About this record"
          tabIndex={0}
          className="text-prose mt-[6px] min-h-0 flex-1 overflow-y-auto whitespace-pre-line"
        >
          {text}
        </div>
      )}
      <div data-field="about-controls" className={`${LABEL} mt-[6px]`}>
        {editing ? (
          <>
            <AboutBudget text={draft} linesHeld={linesHeld} />
            <div>
              <button type="button" data-testid="snippet-save" disabled={busy || draft.trim() === ''} onClick={save} className={CONTROL}>
                Save
              </button>
              {SEP}
              <button type="button" data-testid="snippet-cancel" disabled={busy} onClick={() => { setEditing(false); setDraft(text); }} className={CONTROL}>
                Cancel
              </button>
              {configured && (
                <>
                  {' '}
                  <span data-field="about-qualifier">{ABOUT_QUALIFIER}</span>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <span data-testid={line.byline === 'Your own note' ? 'snippet-yours' : 'snippet-generated-label'}>{line.byline}</span>
            {SEP}
            <button type="button" data-testid="snippet-edit" onClick={startEditing} className={CONTROL}>
              Edit
            </button>
            {SEP}
            <button type="button" data-testid="snippet-delete" disabled={busy} onClick={() => void send('DELETE')} className={CONTROL}>
              Delete
            </button>
            {line.controls.includes('generate') && (
              <>
                {SEP}
                <button type="button" data-testid="snippet-generate" disabled={busy} onClick={regenerate} className={CONTROL}>
                  {busy ? 'Working…' : 'Write a new one'}
                </button>
              </>
            )}
          </>
        )}
      </div>
      {error !== null && (
        <p role="alert" data-testid="snippet-error" className="mt-[6px] text-meta text-destructive">
          {error}
        </p>
      )}
    </>
  );
}

/**
 * §53: "Where no About exists the absence state carries Write one as the
 * button itself." A record whose About was deleted after the user edited it
 * still confirms before writing over that history (`snippet-view.ts`).
 */
export function WriteOne({ recordId, editedAt }: { recordId: string; editedAt: string | null }) {
  const { busy, error, send } = useAboutRequests(recordId);
  const view = snippetView({ snippet: null, snippetEditedAt: editedAt === null ? null : new Date(editedAt) });
  const write = async () => {
    if (view.confirmBeforeRegenerating && view.confirmMessage !== null) {
      if (!window.confirm(view.confirmMessage)) return;
      await send('POST', { confirmReplace: true });
      return;
    }
    await send('POST');
  };
  return (
    <>
      <div className={`${LABEL} mt-[6px]`}>
        <button type="button" data-field="about-write" data-testid="snippet-write" disabled={busy} onClick={write} className={CONTROL}>
          {busy ? 'Working…' : 'Write one'}
        </button>{' '}
        <span data-field="about-qualifier">{ABOUT_QUALIFIER}</span>
      </div>
      {error !== null && (
        <p role="alert" data-testid="snippet-error" className="mt-[6px] text-meta text-destructive">
          {error}
        </p>
      )}
    </>
  );
}

/**
 * §34: "the editor reports whether the text scrolls in the rendered cell,
 * not whether it exceeds 535; it never says 'over' on a text that fits."
 * The draft is laid out at the region's width and counted against the line
 * budget the region publishes at this width, not at a fixed 322 against
 * ten. Without a region (no About yet) the 1440 figures stand in.
 */
export function AboutBudget({ text, linesHeld = null }: { text: string; /** The lines the prose region held when editing began: the textarea has replaced it, so the cell says. */ linesHeld?: number | null }) {
  const probe = useRef<HTMLParagraphElement>(null);
  const [lines, setLines] = useState<number | null>(null);
  const [cell, setCell] = useState<{ width: number; lines: number }>({ width: 322, lines: linesHeld ?? ABOUT_LINES });
  useEffect(() => {
    const frame = document.querySelector<HTMLElement>('[data-testid="snippet-draft"], [data-field="about"]');
    if (frame === null) return;
    const read = () => {
      const width = frame.getBoundingClientRect().width;
      setCell((c) => ({ width: width > 0 ? width : 322, lines: linesHeld ?? c.lines }));
    };
    read();
    const resize = new ResizeObserver(read);
    resize.observe(frame);
    return () => resize.disconnect();
  }, [linesHeld]);
  useEffect(() => {
    const el = probe.current;
    if (el === null) return;
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
    setLines(text.trim() === '' ? 0 : Math.round(el.getBoundingClientRect().height / lineHeight));
  }, [text, cell.width]);
  const { chars, budget } = aboutBudget(text);
  const past = lines !== null && lines > cell.lines;
  return (
    <>
      <p data-testid="about-budget" aria-live="polite">
        {lines === null ? '' : `${lines} of ${cell.lines} lines · `}
        {chars} of about {budget} characters
        {past ? ` · past ${cell.lines} lines: the cell scrolls it` : ''}
      </p>
      {/* The region's measure, so the line count is the one the cell will draw. */}
      <p ref={probe} aria-hidden="true" className="text-prose normal-case tracking-normal font-sans" style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none', width: cell.width, whiteSpace: 'pre-line' }}>
        {text}
      </p>
    </>
  );
}
