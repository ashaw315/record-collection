'use client';

import { useState } from 'react';
import { Mark } from '@/app/disclosure-mark';
import { CONTROL_BOX, CONTROL_LABEL } from '@/app/records/[id]/grid-type';
import { HIT_ALONE } from '@/app/hit-area';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { LineupAction } from './LineupAction';
import { LABEL } from '@/app/records/[id]/grid-type';

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
  "relative after:absolute after:left-1/2 after:top-1/2 after:h-11 after:w-[46px] after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] pointer-coarse:after:block after:hidden";
/** A mark's button (§T.6 part 2): the 12 mark in a 28 box, the 44 overlay under a coarse pointer, no fill. */
const MARK_BUTTON = `${TOUCH_TARGET} inline-flex size-7 shrink-0 items-center justify-center disabled:opacity-50`;

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
      {/* Manage's pass (step 133): "From 640 the tables stay, held inside the column, with the name column taking the slack so no name truncates." No minimum width and no sideways scroll; below 640 this table is not shown at all. */}
      <div>
        <table className="w-full border-collapse text-detail">
          <thead>
            <tr className="border-b border-border text-left">
              {fields.map((field) => (
                <th
                  key={field.name}
                  scope="col"
                  style={field.width === undefined ? undefined : { width: field.width }}
                  className="px-3 py-2 text-label font-medium tracking-wide text-muted-foreground uppercase"
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
            {/* §T.6 part 2 (Design, 14 Oct): "The add rows at 1280 lose their tinted band." */}
            <tr data-manage-create="" className="border-b border-border">
              {fields.map((field, index) => (
                <td key={field.name} className="px-3 py-1.5 align-top">
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
                      className={cn('h-8 pointer-coarse:h-[44px]', field.mono === true && 'font-mono')}
                    />
                  )}
                </td>
              ))}
              <td className="px-3 py-1.5 align-top">
                {/* A §9.3 box with §T.1's + where lucide's plus was. */}
                <button
                  type="button"
                  onClick={() => {
                    onCreate(newRow);
                    setNewRow({});
                  }}
                  className={`${CONTROL_BOX} w-full gap-2`}
                >
                  <Mark kind="plus" />
                  Add
                </button>
              </td>
            </tr>

            {createError !== undefined && (
              <tr>
                <td colSpan={fields.length + 1} className="px-3 py-1.5">
                  <p role="alert" className="text-prose text-destructive">
                    {createError}
                  </p>
                </td>
              </tr>
            )}

            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={fields.length + 1}
                  className="px-3 py-8 text-center text-prose text-muted-foreground"
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
                        /* A row is 44 under a coarse pointer, so each row's controls have their 44 without taking a neighbour row's. Top-aligned (§T.6 part 2): "An opened row keeps its name at the row's top, not centred in a row grown tall." */
                        'px-3 py-1.5 align-top pointer-coarse:h-[44px]',
                        field.mono === true && 'font-mono text-detail tabular-nums',
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
                          className={cn('h-8 pointer-coarse:h-[44px]', field.mono === true && 'font-mono')}
                        />
                      ) : (
                        <span className={displayValue(row, field) === '' ? 'text-muted-foreground' : ''}>
                          {displayValue(row, field) === '' ? '—' : displayValue(row, field)}
                          {field.name === 'name' && isSeeded && (
                            /* Manage's pass: "BUILT IN is a label ... without a box, because it is not a control." */
                            <span data-built-in="" className={`ml-2 ${LABEL}`}>
                              Built in
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                  ))}

                  <td className="px-3 py-1.5 align-top">
                    {/* §T.6 part 2 (Design, 14 Oct): the actions are §9.3 labels in words, 24 apart (§G.3); the tick and the × on an inline edit are §T.1's marks in a 28 box. Across (step 132's rule): a mark's box of 28 has its 8 either side under a coarse pointer, and its overlay is 46 wide: 44 read 43 by the pixel. */}
                    <div className="flex items-start justify-end gap-6">
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
                          {/* §T.6 part 2: "the tick confirms what the × cancels", §T.1's marks where lucide's check and x were. */}
                          <button
                            type="button"
                            aria-label={`Save ${name}`}
                            className={MARK_BUTTON}
                            disabled={busyId === row.id}
                            onClick={() => {
                              onUpdate(row.id, draft);
                              setEditingId(null);
                            }}
                          >
                            <Mark kind="tick" />
                          </button>
                          <button type="button" aria-label={`Cancel editing ${name}`} className={MARK_BUTTON} onClick={() => setEditingId(null)}>
                            <Mark kind="cross" />
                          </button>
                        </>
                      ) : (
                        <>
                          {/* §T.6 part 2: "LINEUP, EDIT and DELETE, not drawn icons"; the pencil and the bin are unruled drawing, replaced by words. */}
                          <button type="button" aria-label={`Edit ${name}`} className={`${CONTROL_LABEL} ${HIT_ALONE}`} onClick={() => startEdit(row)}>
                            Edit
                          </button>

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
                                  <button
                                    type="button"
                                    aria-label={`Delete ${name}`}
                                    aria-disabled="true"
                                    className={cn(CONTROL_LABEL, HIT_ALONE, 'cursor-not-allowed opacity-40')}
                                    onClick={(event) => event.preventDefault()}
                                  >
                                    Delete
                                  </button>
                                }
                              />
                              <TooltipContent>{seededMessage(name)}</TooltipContent>
                            </Tooltip>
                          ) : (
                            <button
                              type="button"
                              aria-label={`Delete ${name}`}
                              disabled={busyId === row.id}
                              onClick={() => onDelete(row)}
                              className={cn(CONTROL_LABEL, HIT_ALONE, 'disabled:opacity-50')}
                            >
                              Delete
                            </button>
                          )}
                        </>
                      )}
                    </div>

                    {rowError?.id === row.id && (
                      <p role="alert" className="mt-1 text-right text-meta text-destructive">
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
