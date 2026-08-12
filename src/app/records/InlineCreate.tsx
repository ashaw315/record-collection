'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { duplicateMessage, resolveCreated } from './inline-create';
import type { Option } from './RecordForm';

/**
 * Adding a reference row without leaving the form (SPEC.md §10: "Inline create
 * for artist/label/store/tag").
 *
 * The in-store case §10 names: you are holding a record by an artist the
 * collection has never seen, and being sent to /manage to add them — losing
 * everything typed so far — is what makes an app unusable in a shop.
 *
 * **`suggestion` opens the box with a name already in it.** Discogs supplies a
 * label or artist name matching no existing row, and the prefill deliberately
 * does not create it — but leaving the near-miss as prose ("add it with + New
 * label") made every import on a new collection a dead end: leave the form, add
 * the row in /manage, re-import, lose everything typed. The name waiting in the
 * box is one click from done, and still creates NOTHING until that click.
 *
 * A name collision is treated as SUCCESS, not failure. The row the user wanted
 * exists; §5.4's `existingId` names it; the form selects it and says so. A bare
 * "already exists" would leave them stuck, and after `cleanName` normalization
 * they may not even find the clash by eye — a double space, a non-breaking
 * space or an NFD-composed accent all collide invisibly.
 */
export function InlineCreate({
  noun,
  path,
  suggestion,
  onCreated,
}: {
  /** Singular, lowercase: 'artist', 'label', 'store', 'tag'. */
  noun: string;
  /** The §5.4 collection endpoint, e.g. '/api/artists'. */
  path: string;
  /**
   * A name from an import that matched no existing row (§5.7). Opens the box
   * with the name in it, ready to accept — never creates it.
   */
  suggestion?: string;
  onCreated: (option: Option, message?: string) => void;
}) {
  /**
   * Initial state, not an effect: the suggestion is fixed for the life of this
   * form, and syncing it would fight the user's own typing on every re-render.
   */
  const [open, setOpen] = useState(suggestion !== undefined && suggestion !== '');
  const [name, setName] = useState(suggestion ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function create() {
    const trimmed = name.trim();
    if (trimmed === '') return;

    setBusy(true);
    setError(undefined);

    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const outcome = resolveCreated({
        status: response.status,
        body: await response.json().catch(() => null),
      });

      if ('error' in outcome) {
        setError(outcome.error);
        return;
      }

      /**
       * The option is labelled with what the USER typed. On a duplicate the
       * stored spelling may differ — that is the whole point of the collision —
       * but the id is the server's, so the selection is correct and the next
       * page load will show the canonical name.
       */
      onCreated(
        { id: outcome.id, name: trimmed },
        outcome.existed ? duplicateMessage(noun, trimmed) : undefined,
      );

      setName('');
      setOpen(false);
    } catch {
      setError('Could not reach the server. Nothing was saved.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        + New {noun}
      </button>
    );
  }

  return (
    <div className="mt-1.5">
      <div className="flex gap-1.5">
        <label htmlFor={`new-${noun}`} className="sr-only">
          New {noun} name
        </label>
        <Input
          id={`new-${noun}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={`New ${noun} name`}
          className="h-8 text-sm"
          onKeyDown={(event) => {
            /**
             * Enter creates, and must NOT submit the record form — the user is
             * halfway through adding a record and a stray Enter saving it early
             * is the worst possible surprise here.
             */
            if (event.key === 'Enter') {
              event.preventDefault();
              void create();
            }
            if (event.key === 'Escape') setOpen(false);
          }}
        />
        <Button type="button" size="sm" className="h-8 shrink-0" disabled={busy} onClick={() => void create()}>
          {busy ? 'Adding…' : 'Add'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 shrink-0"
          onClick={() => {
            setOpen(false);
            setError(undefined);
          }}
        >
          Cancel
        </Button>
      </div>

      {error !== undefined && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
