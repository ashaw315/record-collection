'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  cycleMessage,
  fallbackMessage,
  inUseMessage,
  parseApiError,
  seededMessage,
} from '@/lib/api/messages';
import { RESOURCES, type ResourceSpec } from './resources';
import { ResourceTable, type Row } from './ResourceTable';
import { GenreTree } from './GenreTree';
import { nameOf, type GenreRow } from './genre-tree';

/**
 * One screen for eight resources (SPEC.md §10 `/manage`).
 *
 * A resource rail rather than eight pages: the table, the inline row and the
 * error handling are identical, and duplicating them per resource is how they
 * drift apart.
 */

type Pending = { row: Row; resource: ResourceSpec } | null;

/**
 * One resource's rows. Mounted with `key={resource.key}` so switching resources
 * gives a fresh instance rather than clearing state inside an effect — React's
 * own answer to "reset everything when this prop changes", and it removes the
 * stale-response race a shared instance would have when a slow earlier fetch
 * lands after a faster later one.
 */
function ResourcePanel({ resource, rows }: { resource: ResourceSpec; rows: Row[] }) {
  const activeKey = resource.key;
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [busyId, setBusyId] = useState<string | undefined>(undefined);
  const [rowError, setRowError] = useState<{ id: string; message: string } | undefined>(undefined);
  const [createError, setCreateError] = useState<string | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Pending>(null);

  /**
   * Rows are fetched on the SERVER and passed in, rather than fetched from an
   * effect. That removes the cascading-render problem the lint rule names, and
   * it is the better shape regardless: the page is behind auth, the query layer
   * is server-only, and the first paint carries data instead of a spinner.
   *
   * After a mutation, router.refresh() re-runs the server component and new
   * props arrive — no client-side cache to invalidate or race.
   */
  function reload() {
    startRefresh(() => router.refresh());
  }

  /** Turns any non-OK response into a sentence, never a code. */
  async function messageFor(response: Response, row?: Row): Promise<string> {
    const error = parseApiError(await response.json().catch(() => null));

    if (error?.code === 'IN_USE') {
      return inUseMessage(resource.key, error.referenceCount ?? 0);
    }
    if (error?.code === 'SEEDED') {
      return seededMessage(String(row?.name ?? 'This format'));
    }
    if (error?.fieldErrors !== undefined) {
      const first = Object.values(error.fieldErrors)[0];
      if (first !== undefined) return first;
    }
    return fallbackMessage(error);
  }

  function bodyFrom(values: Record<string, string>): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    for (const field of resource.fields) {
      const raw = values[field.name];
      if (raw === undefined) continue;

      const trimmed = raw.trim();
      if (trimmed === '') {
        // Only send a clearing null for fields that are actually nullable;
        // omitting is how "leave alone" is expressed.
        if (field.required !== true) body[field.name] = null;
        continue;
      }

      if (field.kind === 'number') {
        const parsed = Number(trimmed);
        body[field.name] = Number.isFinite(parsed) ? parsed : trimmed;
      } else if (field.kind === 'boolean') {
        body[field.name] = trimmed === 'true' || trimmed === 'Yes';
      } else {
        body[field.name] = trimmed;
      }
    }
    return body;
  }

  async function create(values: Record<string, string>) {
    setCreateError(undefined);
    setCreating(true);
    try {
      const response = await fetch(`/api/${activeKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyFrom(values)),
      });

      if (!response.ok) {
        setCreateError(await messageFor(response));
        return;
      }
      reload();
    } finally {
      setCreating(false);
    }
  }

  async function update(id: string, values: Record<string, string>) {
    setBusyId(id);
    setRowError(undefined);
    try {
      const response = await fetch(`/api/${activeKey}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyFrom(values)),
      });

      if (!response.ok) {
        setRowError({ id, message: await messageFor(response) });
        return;
      }
      reload();
    } finally {
      setBusyId(undefined);
    }
  }

  /** Genre reparent — the one call whose 409 needs both names to explain itself. */
  async function move(id: string, parentGenreId: string | null) {
    setBusyId(id);
    setRowError(undefined);
    try {
      const response = await fetch(`/api/genres/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentGenreId }),
      });

      if (!response.ok) {
        const moving = nameOf(rows as GenreRow[], id);
        const target = nameOf(rows as GenreRow[], parentGenreId);

        // A cycle rejection names both genres and which one already contains
        // the other; anything else falls back to the API's own message.
        const message =
          moving !== undefined && target !== undefined
            ? cycleMessage(moving, target)
            : await messageFor(response);

        setRowError({ id, message });
        return;
      }
      reload();
    } finally {
      setBusyId(undefined);
    }
  }

  async function confirmDelete() {
    if (pendingDelete === null) return;
    const { row } = pendingDelete;

    setBusyId(row.id);
    setPendingDelete(null);
    try {
      const response = await fetch(`/api/${activeKey}/${row.id}`, { method: 'DELETE' });

      if (!response.ok) {
        setRowError({ id: row.id, message: await messageFor(response, row) });
        return;
      }
      reload();
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <>
      <section
        aria-label={resource.label}
        aria-busy={refreshing || creating}
        className="min-w-0 flex-1"
      >
        {resource.hierarchical === true ? (
          <GenreTree
            rows={rows as GenreRow[]}
            busyId={busyId}
            rowError={rowError}
            createError={createError}
            onCreate={(values) => void create(values)}
            onRename={(id, name) => void update(id, { name })}
            onMove={(id, parentGenreId) => void move(id, parentGenreId)}
            onDelete={(row) => setPendingDelete({ row: row as Row, resource })}
          />
        ) : (
          <ResourceTable
            resource={resource}
            rows={rows}
            busyId={busyId}
            rowError={rowError}
            createError={createError}
            onCreate={(values) => void create(values)}
            onUpdate={(id, values) => void update(id, values)}
            onDelete={(row) => setPendingDelete({ row, resource })}
          />
        )}
      </section>

      {/* Destructive actions confirm. Any 409 that follows is shown on the row,
          so a refusal is not lost with the dialog. */}
      <Dialog open={pendingDelete !== null} onOpenChange={() => setPendingDelete(null)}>
        <DialogContent>
          <DialogTitle>Delete {pendingDelete?.resource.singular}?</DialogTitle>
          <DialogDescription>
            {String(pendingDelete?.row.name ?? 'This row')} will be removed. This cannot be undone.
          </DialogDescription>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">Cancel</Button>} />
            <Button
              variant="destructive"
              onClick={() => void confirmDelete()}
              data-testid="confirm-delete"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ManageClient({ rowsByResource }: { rowsByResource: Record<string, Row[]> }) {
  const [activeKey, setActiveKey] = useState(RESOURCES[0].key);
  const resource = RESOURCES.find((entry) => entry.key === activeKey) as ResourceSpec;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <header className="mb-5">
        <h1 className="font-heading text-xl font-semibold tracking-tight">Manage</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Reference data used across the collection.
        </p>
      </header>

      <div className="flex flex-col gap-5 md:flex-row md:gap-8">
        {/* Sidebar on desktop, horizontally scrolling rail on mobile — the same
            list, not a separate mobile navigation. */}
        <nav aria-label="Resource" className="md:w-44 md:shrink-0">
          <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:flex-col md:overflow-visible md:px-0">
            {RESOURCES.map((entry) => (
              <li key={entry.key} className="shrink-0">
                <button
                  type="button"
                  aria-current={entry.key === activeKey ? 'page' : undefined}
                  onClick={() => setActiveKey(entry.key)}
                  className={cn(
                    'w-full rounded-xs px-3 py-2 text-left text-sm whitespace-nowrap transition-colors',
                    entry.key === activeKey
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-accent',
                  )}
                >
                  {entry.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Keyed: a new resource is a new instance with fresh state. */}
        <ResourcePanel key={resource.key} resource={resource} rows={rowsByResource[resource.key] ?? []} />
      </div>
    </div>
  );
}
