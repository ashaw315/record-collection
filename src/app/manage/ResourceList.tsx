'use client';

import { useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { HIT } from '@/app/hit-area';
import { CONTROL_BOX, CONTROL_LABEL, LABEL, LABEL_TYPE } from '@/app/records/[id]/grid-type';
import { seededMessage } from '@/lib/api/messages';
import { LineupAction } from './LineupAction';
import { formFields, tableFields, type FieldSpec, type ResourceSpec } from './resources';
import type { Row } from './ResourceTable';

/**
 * **Manage below 640: a list, not a table** (manage's pass, step 133).
 *
 * "One row per entry, its name in full on the first line and its other
 * fields on a second line in the label colour, and pressing the row opens
 * it in place as a form." The tables ran past the window at a phone's
 * widths: Stores lost Country and Favourite, Labels its Discogs ID, the
 * new-entry fields overran the edge and Genres cut names to a letter at
 * 320. Nothing here is wider than its column, so nothing can be past the
 * window's edge.
 *
 * One row is open at a time, as the filters are: opening a row, or + NEW at
 * the list's head, closes whatever was open, and pressing the open row
 * closes it and saves nothing. The floor is built with it: a row, a field
 * with its label, SAVE and DELETE are each 44 to a coarse pointer.
 *
 * A close that would lose something asks first (step 137, Design's ruling
 * of 12 Oct): "One line, with DISCARD CHANGES and KEEP EDITING. A close
 * with nothing changed stays silent." A close is the open row pressed
 * again, another row pressed, or + NEW pressed; what was pressed waits for
 * the answer. SAVE is not a close.
 *
 * SAVE is in every open form, changed or not, and the question is asked
 * only when there is something to save. A drop of 12 Oct said "the form
 * shows SAVE only once something has changed" and that was built for one
 * commit (8da8d48); Design withdrew it (`T.6/save-when-changed`): "a
 * control that comes and goes moves what stands beside it, against the
 * reserved-slot rule." Escape is a close like the others. Escape while the
 * question is showing answers it KEEP EDITING: it dismisses the question,
 * not the form.
 *
 * Genres come through the same list with a depth and a parent: indented 12
 * a level and no further than three, Under Parent as the second line, and
 * the parent's select in the open form, so no name is ever cut to make room
 * for one.
 */
export type ListGenres = {
  /** The row's depth in the tree, by id. */
  depthOf: (id: string) => number;
  /** The row's parent's name, if it has one. */
  parentNameOf: (id: string) => string | undefined;
  parentIdOf: (id: string) => string | null;
  /** The genres this one may be moved under: never itself or its own descendants. */
  parentsOf: (id: string) => Array<{ id: string; name: string }>;
  onMove: (id: string, parentGenreId: string | null) => void;
};

type Props = {
  resource: ResourceSpec;
  rows: Row[];
  busyId?: string;
  rowError?: { id: string; message: string };
  createError?: string;
  onCreate: (values: Record<string, string>) => void;
  onUpdate: (id: string, values: Record<string, string>) => void;
  onDelete: (row: Row) => void;
  genres?: ListGenres;
};

const NEW = 'new';
/** Genres indent 12 a level, "capped at three levels". */
const INDENT = 12;
const DEEPEST = 3;

function shown(row: Row, field: FieldSpec): string {
  const value = row[field.name];
  if (value === null || value === undefined || value === '') return '';
  /* A boolean is its own name where it is true and nothing where it is not: "A field with nothing in it is left out of the line." */
  if (field.kind === 'boolean') return value === true ? field.label : '';
  return String(value);
}

function draftOf(row: Row, field: FieldSpec): string {
  const value = row[field.name];
  if (field.kind === 'boolean') return value === true ? 'Yes' : 'No';
  return value === null || value === undefined ? '' : String(value);
}

/* The field ruling: the label is the field's width and stands on it with nothing between, so label and field are one target. */
const FIELD_LABEL = `block pb-1 ${LABEL}`;
const FIELD = 'h-9 w-full';

export function ResourceList({ resource, rows, busyId, rowError, createError, onCreate, onUpdate, onDelete, genres }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [parent, setParent] = useState('');
  /* The form as it was opened, to tell a change from none: a field put back is not a change. */
  const [opened, setOpened] = useState<{ draft: Record<string, string>; parent: string }>({ draft: {}, parent: '' });
  /* What was pressed while the open form had changes, held until DISCARD CHANGES or KEEP EDITING. */
  const [asked, setAsked] = useState<{ id: string; row?: Row } | null>(null);
  /* A genre is its name here; its description is not edited on this screen in the table either. */
  const fields = genres === undefined ? formFields(resource) : resource.fields.filter((field) => field.name === 'name');
  const second = tableFields(resource).filter((field) => field.name !== 'name');

  const changed = openId !== null && (parent !== opened.parent || fields.some((field) => (draft[field.name] ?? '') !== (opened.draft[field.name] ?? '')));

  function go(id: string, row?: Row) {
    setAsked(null);
    if (openId === id) {
      setOpenId(null);
      return;
    }
    const nextDraft = row === undefined ? {} : Object.fromEntries(fields.map((field) => [field.name, draftOf(row, field)]));
    const nextParent = row === undefined || genres === undefined ? '' : (genres.parentIdOf(row.id) ?? '');
    setOpenId(id);
    setDraft(nextDraft);
    setParent(nextParent);
    setOpened({ draft: nextDraft, parent: nextParent });
  }

  function open(id: string, row?: Row) {
    if (changed) {
      setAsked({ id, row });
      return;
    }
    go(id, row);
  }

  function form(row: Row | undefined, lineup: { control: ReactNode; status: ReactNode | null } | null = null) {
    const name = row === undefined ? '' : String(row.name ?? '');
    const called = (field: FieldSpec) => (row === undefined ? `New ${resource.singular} ${field.label.toLowerCase()}` : `${name} ${field.label.toLowerCase()}`);
    const seeded = row !== undefined && resource.hasSeeded === true && row.isSeeded === true;
    const save = () => {
      if (row === undefined) {
        onCreate(draft);
      } else {
        onUpdate(row.id, draft);
        if (genres !== undefined && parent !== (genres.parentIdOf(row.id) ?? '')) genres.onMove(row.id, parent === '' ? null : parent);
      }
      setAsked(null);
      setOpenId(null);
    };

    return (
      <form
        data-manage-form=""
        className="space-y-3 pb-4"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.stopPropagation();
          if (asked !== null) setAsked(null);
          else open(row?.id ?? NEW, row);
        }}
      >
        {fields.map((field) => {
          const id = `manage-${resource.key}-${row?.id ?? NEW}-${field.name}`;
          if (field.kind === 'boolean') {
            return (
              /* A box and its words, 44 to a coarse pointer by overlay and no wider than they are: the record form's Reissue. */
              <label key={field.name} className={`${HIT} flex w-fit items-center gap-2 text-detail before:inset-x-0`}>
                <input
                  type="checkbox"
                  aria-label={called(field)}
                  checked={draft[field.name] === 'Yes'}
                  onChange={(event) => setDraft({ ...draft, [field.name]: event.target.checked ? 'Yes' : 'No' })}
                  className="size-4 accent-primary"
                />
                {field.label}
              </label>
            );
          }
          return (
            <div key={field.name}>
              <label htmlFor={id} className={FIELD_LABEL}>
                {field.label}
              </label>
              <Input
                id={id}
                aria-label={called(field)}
                value={draft[field.name] ?? ''}
                placeholder={field.placeholder}
                onChange={(event) => setDraft({ ...draft, [field.name]: event.target.value })}
                className={field.mono === true ? `${FIELD} font-mono` : FIELD}
              />
            </div>
          );
        })}

        {genres !== undefined && row !== undefined && (
          <div>
            <label htmlFor={`manage-under-${row.id}`} className={FIELD_LABEL}>
              Under
            </label>
            <select
              id={`manage-under-${row.id}`}
              aria-label={`Move ${name} under`}
              value={parent}
              onChange={(event) => setParent(event.target.value)}
              className="h-9 w-full rounded-xs border border-input bg-background px-2 text-label"
            >
              <option value="">— top level —</option>
              {genres.parentsOf(row.id).map((each) => (
                <option key={each.id} value={each.id}>
                  {each.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* §T.6 part 2 (Design, 14 Oct): SAVE a §9.3 box, DELETE a §9.3 label, and "at 390, LINEUP joins SAVE and DELETE in the form's action row", 24 apart (§G.3). */}
        <div data-manage-actions="" className="flex flex-wrap items-center gap-6 pt-1">
          <button type="submit" aria-label={row === undefined ? `Save new ${resource.singular}` : `Save ${name}`} disabled={row !== undefined && busyId === row.id} className={`${CONTROL_BOX} disabled:opacity-50`}>
            Save
          </button>
          {row !== undefined &&
            (seeded ? (
              /* A seeded row's Delete is shown refused, with its reason beside it: an action that always errors would be a lie, and there is no hover on a phone to explain it. */
              <button type="button" aria-label={`Delete ${name}`} aria-disabled="true" className={`${CONTROL_LABEL} cursor-not-allowed opacity-40`} onClick={(event) => event.preventDefault()}>
                Delete
              </button>
            ) : (
              <button type="button" aria-label={`Delete ${name}`} disabled={busyId === row.id} className={`${CONTROL_LABEL} disabled:opacity-50`} onClick={() => onDelete(row)}>
                Delete
              </button>
            ))}
          {/* §12 step 11, artists only: the lineup walk is asked for, here with the artist's other actions; its status in a slot the row's width beneath (§T.6 part 2). */}
          {lineup?.control}
        </div>
        {lineup?.status != null && (
          <div data-lineup-slot={row?.id} className="w-full">
            {lineup.status}
          </div>
        )}
        {seeded && <p className="text-meta text-muted-foreground">{seededMessage(name)}</p>}

        {asked !== null && (
          /* One line, and the two answers only: each says what it does. Text controls, 44 to a finger by the row's height and their own width. */
          <div data-manage-confirm="" role="group" aria-label="Unsaved changes" className="flex items-center gap-4">
            <button type="button" onClick={() => go(asked.id, asked.row)} className={`${LABEL_TYPE} flex items-center whitespace-nowrap pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px]`}>
              Discard changes
            </button>
            <button type="button" autoFocus onClick={() => setAsked(null)} className={`${LABEL_TYPE} flex items-center whitespace-nowrap pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px]`}>
              Keep editing
            </button>
          </div>
        )}

      </form>
    );
  }

  return (
    <ul data-manage-list="" className="border-t border-border">
      <li className="border-b border-border">
        <button
          type="button"
          data-manage-new=""
          aria-expanded={openId === NEW}
          onClick={() => open(NEW)}
          className={`flex w-full items-center py-3 text-left ${LABEL_TYPE} pointer-coarse:min-h-[44px]`}
        >
          + New {resource.singular}
        </button>
        {createError !== undefined && (
          <p role="alert" className="pb-3 text-prose text-destructive">
            {createError}
          </p>
        )}
        {openId === NEW && form(undefined)}
      </li>

      {rows.length === 0 && <li className="py-8 text-center text-prose text-muted-foreground">No {resource.label.toLowerCase()} yet.</li>}

      {rows.map((row) => {
        const name = String(row.name ?? '');
        const depth = genres === undefined ? 0 : genres.depthOf(row.id);
        const under = genres?.parentNameOf(row.id);
        const line = genres === undefined ? second.map((field) => shown(row, field)).filter((value) => value !== '').join(' · ') : under === undefined ? '' : `Under ${under}`;
        const seeded = resource.hasSeeded === true && row.isSeeded === true;

        return (
          <li key={row.id} data-manage-row="" aria-level={genres === undefined ? undefined : depth + 1} className="border-b border-border last:border-0">
            <button
              type="button"
              data-manage-open=""
              aria-expanded={openId === row.id}
              onClick={() => open(row.id, row)}
              className="block w-full py-2 text-left pointer-coarse:flex pointer-coarse:min-h-[44px] pointer-coarse:flex-col pointer-coarse:justify-center"
              style={depth === 0 ? undefined : { paddingLeft: Math.min(depth, DEEPEST) * INDENT }}
            >
              <span data-manage-name="" className="block text-detail break-words">
                {name}
                {seeded && (
                  <span data-built-in="" className={`ml-2 ${LABEL}`}>
                    Built in
                  </span>
                )}
              </span>
              {line !== '' && (
                <span data-manage-second="" className="block text-meta text-[oklch(0.44_0.008_70)]">
                  {line}
                </span>
              )}
            </button>
            {rowError?.id === row.id && (
              <p role="alert" className="pb-2 text-meta text-destructive">
                {rowError.message}
              </p>
            )}
            {openId === row.id &&
              (resource.key === 'artists' ? (
                <LineupAction artistId={row.id} artistName={name} render={(parts) => form(row, parts)} />
              ) : (
                form(row)
              ))}
          </li>
        );
      })}
    </ul>
  );
}
