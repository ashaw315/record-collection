'use client';

import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  buildTree,
  flattenTree,
  validParents,
  type GenreRow,
} from './genre-tree';

/**
 * The genre hierarchy editor.
 *
 * NO drag-and-drop. A drag tree needs a non-drag path for touch and keyboard
 * anyway, and a second path serving a minority case is the one nobody
 * exercises. Instead every row has a "Move to…" `<select>` of valid parents:
 * identical on touch and pointer, keyboard-native, and screen-reader-native
 * without custom tree ARIA to get wrong.
 *
 * The list is a real nested `<ul>` with `aria-level`, so the hierarchy is
 * conveyed structurally rather than by indentation alone.
 */

const TOUCH_TARGET =
  "relative after:absolute after:left-1/2 after:top-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] pointer-coarse:after:block after:hidden";

type Props = {
  rows: GenreRow[];
  busyId?: string;
  rowError?: { id: string; message: string };
  createError?: string;
  onCreate: (values: Record<string, string>) => void;
  onRename: (id: string, name: string) => void;
  onMove: (id: string, parentGenreId: string | null) => void;
  onDelete: (row: GenreRow) => void;
};

export function GenreTree({
  rows,
  busyId,
  rowError,
  createError,
  onCreate,
  onRename,
  onMove,
  onDelete,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [newName, setNewName] = useState('');

  const nodes = flattenTree(buildTree(rows));

  return (
    <div className="w-full">
      <div className="flex gap-2 border-b border-border bg-secondary/40 px-3 py-2">
        <Input
          aria-label="New genre name"
          placeholder="New genre…"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && newName.trim() !== '') {
              onCreate({ name: newName });
              setNewName('');
            }
          }}
          className="h-8 max-w-xs"
        />
        <Button
          size="sm"
          className="h-8"
          onClick={() => {
            if (newName.trim() === '') return;
            onCreate({ name: newName });
            setNewName('');
          }}
        >
          Add
        </Button>
      </div>

      {createError !== undefined && (
        <p role="alert" className="px-3 py-2 text-sm text-destructive">
          {createError}
        </p>
      )}

      {nodes.length === 0 ? (
        <p className="px-3 py-8 text-center text-sm text-muted-foreground">No genres yet.</p>
      ) : (
        <ul className="list-none">
          {nodes.map((node) => {
            const isEditing = editingId === node.id;
            const parents = validParents(rows, node.id);

            return (
              <li
                key={node.id}
                aria-level={node.depth + 1}
                className="border-b border-border last:border-0"
              >
                <div
                  className="flex flex-wrap items-center gap-2 px-3 py-1.5 hover:bg-accent/60"
                  // Indent scales with depth but is capped, so a deep tree
                  // still fits a 390px viewport.
                  style={{ paddingLeft: `${Math.min(node.depth, 6) * 1.1 + 0.75}rem` }}
                >
                  {node.depth > 0 && (
                    <span aria-hidden="true" className="font-mono text-xs text-muted-foreground">
                      └
                    </span>
                  )}

                  {isEditing ? (
                    <Input
                      aria-label={`Rename ${node.name}`}
                      value={draftName}
                      onChange={(event) => setDraftName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          onRename(node.id, draftName);
                          setEditingId(null);
                        }
                        if (event.key === 'Escape') setEditingId(null);
                      }}
                      className="h-8 max-w-[14rem]"
                    />
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-sm">{node.name}</span>
                  )}

                  {/*
                    The move control. A select rather than a drag handle: one
                    control that works with touch, mouse and keyboard, instead
                    of a primary path plus an untested fallback.

                    Descendants are already excluded, so the API's cycle guard
                    is normally unreachable from here — it remains the
                    guarantee for the concurrent case.
                  */}
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="sr-only">Move {node.name} under</span>
                    <span aria-hidden="true">Under</span>
                    <select
                      value={node.parentGenreId ?? ''}
                      disabled={busyId === node.id}
                      onChange={(event) =>
                        onMove(node.id, event.target.value === '' ? null : event.target.value)
                      }
                      className="h-9 min-w-[8rem] rounded-xs border border-input bg-background px-2 text-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      <option value="">— top level —</option>
                      {parents.map((parent) => (
                        <option key={parent.id} value={parent.id}>
                          {parent.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="flex gap-1">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Edit ${node.name}`}
                      className={TOUCH_TARGET}
                      onClick={() => {
                        setEditingId(node.id);
                        setDraftName(node.name);
                      }}
                    >
                      <Pencil aria-hidden="true" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete ${node.name}`}
                      disabled={busyId === node.id}
                      onClick={() => onDelete(node)}
                      className={cn(TOUCH_TARGET, 'text-destructive hover:bg-destructive/10')}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </div>

                {rowError?.id === node.id && (
                  <p role="alert" className="px-3 pb-2 text-xs text-destructive">
                    {rowError.message}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
