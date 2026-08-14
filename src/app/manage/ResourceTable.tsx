'use client';

import { useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { LineupAction } from './LineupAction';

import { seededMessage } from '@/lib/api/messages';
import { tableFields, type FieldSpec, type ResourceSpec } from './resources';

/**
 * A 28px icon button is comfortable with a mouse and too small for a thumb.
 * SPEC.md §10 makes mobile an equal priority, so the hit area is expanded to
 * 44px on coarse pointers via a pseudo-element — the button stays visually
 * dense while the tap target meets guidance. Applied to every icon action in
 * this table.
 */
const TOUCH_TARGET =
  "relative after:absolute after:left-1/2 after:top-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] pointer-coarse:after:block after:hidden";

/**
 * The one table every flat resource renders through. Rows edit in place — these
 * are mostly one-field records, and navigating away to change a tag name would
 * cost more than it saves.
 *
 * Density is the point: ~40px rows, hairline rules, no cards. This is a stock
 * list, not a dashboard.
 */

export type Row = Record<string, unknown> & { id: string };

type Props = {
  resource: ResourceSpec;
  rows: Row[];
  busyId?: string;
  rowError?: { id: string; message: string };
  createError?: string;
  onCreate: (values: Record<string, string>) => void;
  onUpdate: (id: string, values: Record<string, string>) => void;
  onDelete: (row: Row) => void;
};

function displayValue(row: Row, field: FieldSpec): string {
  const value = row[field.name];
  if (value === null || value === undefined || value === '') return '';
  if (field.kind === 'boolean') return value === true ? 'Yes' : 'No';
  return String(value);
}

export function ResourceTable({
  resource,
  rows,
  busyId,
  rowError,
  createError,
  onCreate,
  onUpdate,
  onDelete,
}: Props) {
  const fields = tableFields(resource);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [newRow, setNewRow] = useState<Record<string, string>>({});

  function startEdit(row: Row) {
    setEditingId(row.id);
    setDraft(
      Object.fromEntries(resource.fields.map((field) => [field.name, displayValue(row, field)])),
    );
  }

  return (
    <div className="w-full">
      {/* Horizontal scroll rather than hiding columns: on a phone the catalog
          number and year are exactly what you came to check. */}
      <div className="-mx-4 overflow-x-auto sm:mx-0">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              {fields.map((field) => (
                <th
                  key={field.name}
                  scope="col"
                  style={field.width === undefined ? undefined : { width: field.width }}
                  className="px-3 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase"
                >
                  {field.label}
                </th>
              ))}
              <th scope="col" className="w-24 px-3 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {/* Create row sits at the top, always visible — no "add" mode. */}
            <tr className="border-b border-border bg-secondary/40">
              {fields.map((field, index) => (
                <td key={field.name} className="px-3 py-1.5">
                  {field.kind === 'boolean' ? null : (
                    <Input
                      aria-label={`New ${resource.singular} ${field.label.toLowerCase()}`}
                      placeholder={index === 0 ? `New ${resource.singular}…` : field.placeholder}
                      value={newRow[field.name] ?? ''}
                      onChange={(event) =>
                        setNewRow({ ...newRow, [field.name]: event.target.value })
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          onCreate(newRow);
                          setNewRow({});
                        }
                      }}
                      className={cn('h-8', field.mono === true && 'font-mono')}
                    />
                  )}
                </td>
              ))}
              <td className="px-3 py-1.5">
                <Button
                  size="sm"
                  onClick={() => {
                    onCreate(newRow);
                    setNewRow({});
                  }}
                  className="h-8 w-full"
                >
                  <Plus aria-hidden="true" />
                  Add
                </Button>
              </td>
            </tr>

            {createError !== undefined && (
              <tr>
                <td colSpan={fields.length + 1} className="px-3 py-1.5">
                  <p role="alert" className="text-sm text-destructive">
                    {createError}
                  </p>
                </td>
              </tr>
            )}

            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={fields.length + 1}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
                  No {resource.label.toLowerCase()} yet.
                </td>
              </tr>
            )}

            {rows.map((row) => {
              const isEditing = editingId === row.id;
              const isSeeded = resource.hasSeeded === true && row.isSeeded === true;
              const name = String(row.name ?? '');

              return (
                <tr key={row.id} className="border-b border-border last:border-0 hover:bg-accent/60">
                  {fields.map((field) => (
                    <td
                      key={field.name}
                      className={cn(
                        'px-3 py-1.5 align-middle',
                        field.mono === true && 'font-mono text-[0.8125rem] tabular-nums',
                      )}
                    >
                      {isEditing && field.kind !== 'boolean' ? (
                        <Input
                          aria-label={`${name} ${field.label.toLowerCase()}`}
                          value={draft[field.name] ?? ''}
                          onChange={(event) =>
                            setDraft({ ...draft, [field.name]: event.target.value })
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              onUpdate(row.id, draft);
                              setEditingId(null);
                            }
                            if (event.key === 'Escape') setEditingId(null);
                          }}
                          className={cn('h-8', field.mono === true && 'font-mono')}
                        />
                      ) : (
                        <span className={displayValue(row, field) === '' ? 'text-muted-foreground' : ''}>
                          {displayValue(row, field) === '' ? '—' : displayValue(row, field)}
                          {field.name === 'name' && isSeeded && (
                            <span className="ml-2 rounded-xs border border-border px-1 py-0.5 text-[0.625rem] tracking-wide text-muted-foreground uppercase">
                              Built in
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                  ))}

                  <td className="px-3 py-1.5">
                    <div className="flex items-start justify-end gap-1">
                      {/*
                        §12 step 11: artists only. A lineup is band membership,
                        which no other resource here has — and the walk is ~32
                        requests, so it must be asked for rather than offered
                        everywhere.
                      */}
                      {resource.key === 'artists' && !isEditing && (
                        <LineupAction artistId={row.id} artistName={name} />
                      )}
                      {isEditing ? (
                        <>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Save ${name}`}
                            className={TOUCH_TARGET}
                            disabled={busyId === row.id}
                            onClick={() => {
                              onUpdate(row.id, draft);
                              setEditingId(null);
                            }}
                          >
                            <Check aria-hidden="true" />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Cancel editing ${name}`}
                            className={TOUCH_TARGET}
                            onClick={() => setEditingId(null)}
                          >
                            <X aria-hidden="true" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Edit ${name}`}
                            className={TOUCH_TARGET}
                            onClick={() => startEdit(row)}
                          >
                            <Pencil aria-hidden="true" />
                          </Button>

                          {/*
                            A seeded row gets a DISABLED control with an
                            explanation, not a button that always errors. The
                            refusal is permanent, so presenting it as an action
                            would be a lie.
                          */}
                          {isSeeded ? (
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <Button
                                    size="icon-sm"
                                    variant="ghost"
                                    aria-label={`Delete ${name}`}
                                    aria-disabled="true"
                                    className={cn(TOUCH_TARGET, 'cursor-not-allowed opacity-40')}
                                    onClick={(event) => event.preventDefault()}
                                  >
                                    <Trash2 aria-hidden="true" />
                                  </Button>
                                }
                              />
                              <TooltipContent>{seededMessage(name)}</TooltipContent>
                            </Tooltip>
                          ) : (
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`Delete ${name}`}
                              disabled={busyId === row.id}
                              onClick={() => onDelete(row)}
                              className={cn(TOUCH_TARGET, 'text-destructive hover:bg-destructive/10')}
                            >
                              <Trash2 aria-hidden="true" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>

                    {rowError?.id === row.id && (
                      <p role="alert" className="mt-1 text-right text-xs text-destructive">
                        {rowError.message}
                      </p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
