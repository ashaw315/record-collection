'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Section } from './Section';
import { LABEL } from './grid-type';
import {
  CONTROL_HEIGHT,
  FIELD_HEIGHT,
  SECTION_RULE,
  TYPED_LEADING,
  TYPED_SIZE,
} from './extended-grid';
import { COLLECTION_DATE_MIN } from '@/lib/api/date';

/**
 * §10's "journal entries with add-entry form" on the record detail screen.
 *
 * The journal is what a collection is FOR beyond the inventory — when you played
 * it, what you noticed, what the sleeve smells like. Entries read newest first,
 * matching §5.2's hydrated order: the last thing you thought is what you want
 * to see.
 */

export type JournalEntryView = {
  id: string;
  entryDate: string;
  note: string;
};

/**
 * Today on the USER's calendar, in the form the date input and the API use.
 *
 * **`toISOString()` was wrong here, and wrong in the direction that files real
 * entries under the wrong day.** It converts to UTC first, so for a user west of
 * Greenwich every evening reads as tomorrow: 20:30 on Friday the 15th in New
 * York is 00:30 Saturday the 16th in UTC, and a note written on Friday night was
 * captioned Saturday. Measured, not reasoned about.
 *
 * A journal entry's date is a HUMAN fact — the day the user played the record —
 * not a machine timestamp. `journal_entries.entry_date` is a `DATE`, and the
 * only calendar that makes it true is the one the user was looking at.
 *
 * `en-CA` because it formats as `YYYY-MM-DD`, which is what the input and the
 * API want; the locale is a formatting trick, not a claim about the user's
 * language.
 */
function todayIso(): string {
  return new Date().toLocaleDateString('en-CA');
}

export function RecordJournal({
  recordId,
  entries,
  base,
}: {
  recordId: string;
  entries: JournalEntryView[];
  /** §5.5's base step, for §9.3's rail bar. */
  base: string | null;
}) {
  const router = useRouter();
  const today = todayIso();

  const [note, setNote] = useState('');
  const [entryDate, setEntryDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  /**
   * A TEST-SUPPORT AFFORDANCE, the same one `RecordForm`, `CollectionFilters`
   * and the login page carry.
   *
   * These inputs are CONTROLLED: `add()` reads `note` from React state. A value
   * typed into the DOM before hydration never reaches that state, so the submit
   * sees an empty note and refuses it — the field looks full and nothing saves.
   * Measured on this component, not assumed: a probe showed the textarea
   * holding "probe note" while the guard fired.
   *
   * Waiting for the rendered textarea does not help: it is server-rendered, so
   * its presence proves the markup arrived, not that React is listening.
   */
  const formRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    formRef.current?.setAttribute('data-hydrated', 'true');
  }, []);

  async function add() {
    if (note.trim() === '') {
      setError('Write something first — an entry with no note records nothing.');
      return;
    }

    setBusy(true);
    setError(undefined);

    try {
      const response = await fetch(`/api/records/${recordId}/journal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryDate, note: note.trim() }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? 'That entry could not be saved.');
        return;
      }

      setNote('');
      setEntryDate(today);
      // Server-rendered, so the new entry arrives on a refresh rather than
      // being pushed into local state — one source of truth.
      router.refresh();
    } catch {
      setError('Could not reach the server. Nothing was saved.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, entryNote: string) {
    // §7.3's rule for destructive actions: say what is lost. A note is short
    // enough to quote, which is more use than "delete this entry?".
    const preview = entryNote.length > 60 ? `${entryNote.slice(0, 60)}…` : entryNote;
    if (!window.confirm(`Delete this entry? “${preview}” This cannot be undone.`)) return;

    setBusy(true);
    setError(undefined);

    try {
      const response = await fetch(`/api/journal/${id}`, { method: 'DELETE' });

      if (!response.ok) {
        setError('That entry could not be deleted.');
        return;
      }

      router.refresh();
    } catch {
      setError('Could not reach the server. Nothing was deleted.');
    } finally {
      setBusy(false);
    }
  }

  return (
    /*
      **§9.1's section, and the rail carries the name.**

      §8.3 removed this section's `<h2>` because it duplicated the frame's
      journal cell label. §9.1 then made the rail label structural — "every
      label starts at the same x on every section" — so the word is back, in a
      different role: not a heading stacked under the frame's, but the one x
      this region trains the reader to read down.

      The comment here previously claimed the rail "restores a label without
      restoring the repetition". That was wrong as stated — the word does appear
      twice — and `record-page-8a.spec.ts` caught it. What is true is that the
      two namings are different things, and that test now asserts exactly two.
    */
    <Section name="journal" title="Journal" base={base} shape="body">
      {/*
        **The entries in the 6, the form in the 4** — §9.1's `body` split is a
        body with an action beside it. A section declaring it must fill both
        cells: passing one child left the second empty, and at 390px that empty
        box sat on top of the entry's Delete control and took its clicks.
      */}
      <div data-testid="journal">
      {/*
        **No heading: 8a's journal cell already carries the label.** The frame
        says `Journal` in §4's treatment, and repeating the same word in the
        same treatment below it named one thing twice.

        The ENTRIES are not repetition — §8 makes the sections below the fold
        the full set behind the frame's summary, and the cell shows one entry
        where this shows all of them. The heading was the part the cell had
        already done.
      */}

      {error !== undefined && (
        <p role="alert" className="mb-3 text-meta text-destructive">
          {error}
        </p>
      )}

      {entries.length === 0 ? (
        <p className="text-prose text-muted-foreground">
          No entries yet. Note when you played it, or what you noticed.
        </p>
      ) : (
        <ul className="border-t border-border">
          {entries.map((entry) => (
            <li
              key={entry.id}
              data-testid="journal-entry"
              /*
                **Wraps rather than overflowing.** At 390px the journal's body
                cell is 193px, and this row's fixed 96px date plus its gaps and
                a `shrink-0` Delete exceeded it — the button rendered past the
                cell's right edge, over the cell beside it, where a click
                landed on the wrong element and Playwright waited 30s for a
                control that was enabled, visible and motionless.

                `flex-wrap` with the date no longer fixed-width: the row keeps
                its line where there is room and stacks where there is not.
              */
              className="flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-border py-2 last:border-0"
            >
              <time
                dateTime={entry.entryDate}
                className="shrink-0 font-mono text-meta text-muted-foreground tabular-nums"
              >
                {entry.entryDate}
              </time>
              <p className="flex-1 text-prose whitespace-pre-line">{entry.note}</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove(entry.id, entry.note)}
                aria-label={`Delete this entry from ${entry.entryDate}`}
                className="shrink-0 text-label text-muted-foreground underline underline-offset-2 hover:text-destructive"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      </div>

      <div data-testid="journal-actions">
      <div
        ref={formRef}
        data-testid="journal-form"
        className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start"
      >
        <div className="sm:w-40 sm:shrink-0">
          <label htmlFor="entry-date" className="sr-only">
            Entry date
          </label>
          {/*
            **§9.2's ruled field, not a box.** A 1px ink underline under a 16px
            line, 34px tall, MONO because the field takes data — §4.1's
            data/prose split applying to entry exactly as it applies to
            display. A box around a line of type is a second frame around
            something the cell already framed.

            16px is A67's amendment and its whole scope: text the user can put
            a cursor in. At 16/1.9 the line is 30.4px inside the 34px field.
          */}
          <input
            id="entry-date"
            type="date"
            value={entryDate}
            className="w-full bg-transparent font-mono"
            style={{
              height: FIELD_HEIGHT,
              boxSizing: 'border-box',
              border: 0,
              borderBottom: '1px solid oklch(0.18 0.005 60)',
              borderRadius: 0,
              padding: 0,
              fontSize: TYPED_SIZE,
              lineHeight: TYPED_LEADING,
            }}
            /**
             * Bounded in the markup as well as at the API. 1877 is when sound
             * recording began; the upper bound is today, because you cannot
             * have played a record tomorrow. The browser's picker enforcing it
             * saves a round trip — the server enforces it regardless, since a
             * client-side bound is a suggestion.
             */
            min={COLLECTION_DATE_MIN}
            max={today}
            onChange={(event) => setEntryDate(event.target.value)}
          />
        </div>

        <div className="flex-1">
          <label htmlFor="journal-note" className="sr-only">
            Journal note
          </label>
          <textarea
            id="journal-note"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Played it after the pub. Still loud."
            /*
              **The one exception to the ruled-field rule**: a textarea takes a
              full 1px grey box, because it is a REGION of text rather than a
              line, and a region with only a baseline has no shape at all.
            */
            className="w-full bg-transparent px-[10px] py-[8px]"
            style={{
              border: `1px solid ${SECTION_RULE}`,
              borderRadius: 0,
              fontSize: TYPED_SIZE,
              lineHeight: TYPED_LEADING,
            }}
          />
        </div>

        {/*
          **`Save entry`, not `Add entry` — §9.2.** A form's submit is never the
          trigger that opened it and the two never share a label: the frame's
          journal cell carries `Add entry` as the trigger (§8.1), and this
          section is its target. Drawn with the trigger's label it would be one
          control announced in two places 900px apart, and a reader who has
          already pressed `Add entry` is not adding anything by pressing it
          again. The section loses its trigger and keeps its submit — a target
          without a submit is a dead end.
        */}
        <button
          type="button"
          disabled={busy}
          onClick={() => void add()}
          className={`${LABEL} shrink-0 px-[14px] disabled:text-muted-foreground`}
          style={{
            height: CONTROL_HEIGHT,
            border: '1px solid oklch(0.18 0.005 60)',
            borderRadius: 0,
            boxSizing: 'border-box',
          }}
        >
          {busy ? 'Saving…' : 'Save entry'}
        </button>
      </div>

      </div>
    </Section>
  );
}
