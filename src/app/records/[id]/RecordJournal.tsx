'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

/** Today in the same form the date input and the API use. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function RecordJournal({
  recordId,
  entries,
}: {
  recordId: string;
  entries: JournalEntryView[];
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
    <section className="mt-6" data-testid="journal">
      <h2 className="mb-1 font-heading text-sm font-semibold tracking-tight">Journal</h2>

      <div
        ref={formRef}
        data-testid="journal-form"
        className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start"
      >
        <div className="sm:w-40 sm:shrink-0">
          <label htmlFor="entry-date" className="sr-only">
            Entry date
          </label>
          <Input
            id="entry-date"
            type="date"
            value={entryDate}
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
            className="h-9"
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
            className="w-full rounded-xs border border-input bg-transparent px-2 py-1.5 text-sm"
          />
        </div>

        <Button type="button" disabled={busy} onClick={() => void add()} className="sm:mt-0">
          {busy ? 'Saving…' : 'Add entry'}
        </Button>
      </div>

      {error !== undefined && (
        <p role="alert" className="mb-3 text-xs text-destructive">
          {error}
        </p>
      )}

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No entries yet. Note when you played it, or what you noticed.
        </p>
      ) : (
        <ul className="border-t border-border">
          {entries.map((entry) => (
            <li
              key={entry.id}
              data-testid="journal-entry"
              className="flex items-start gap-3 border-b border-border py-2 last:border-0"
            >
              <time
                dateTime={entry.entryDate}
                className="w-24 shrink-0 font-mono text-xs text-muted-foreground tabular-nums"
              >
                {entry.entryDate}
              </time>
              <p className="flex-1 text-sm whitespace-pre-line">{entry.note}</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove(entry.id, entry.note)}
                aria-label={`Delete this entry from ${entry.entryDate}`}
                className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-destructive"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
