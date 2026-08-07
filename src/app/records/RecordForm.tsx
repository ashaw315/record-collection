'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { parseApiError, fallbackMessage } from '@/lib/api/messages';
import { CONDITION_GRADES } from '@/lib/records/fields';
import { conditionLabel } from './record-detail-format';
import { buildCreateBody, buildPatchBody, type FormValues } from './record-form';

/**
 * The add/edit record form (SPEC.md §10 `/records/new`, `/records/:id/edit`).
 *
 * Manual entry only. Discogs lookup is step 7 and is NOT stubbed here — a
 * disabled lookup field reads as broken rather than as not-yet-built, the same
 * reasoning as the absent gallery on the detail screen.
 *
 * Inline create for artist/label/store/tag (§10) is unit 9b: it is four more
 * write paths and would push this unit past the file budget in CLAUDE.md §1.
 * Until then the selects offer existing reference data, which /manage creates.
 */

export type Option = { id: string; name: string };

export type ReferenceData = {
  artists: Option[];
  labels: Option[];
  formats: Option[];
  stores: Option[];
  genres: Option[];
  tags: Option[];
};

function Row({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  /**
   * Omitted for a row whose control is a GROUP rather than a single input.
   * A <label for> pointing at an id that does not exist is worse than no
   * label: assistive technology announces nothing and the markup claims an
   * association it does not have. Those rows get a plain heading, and the group
   * carries its own <legend>.
   */
  htmlFor?: string;
  children: React.ReactNode;
  hint?: string;
}) {
  const labelClass =
    'text-xs tracking-wide text-muted-foreground uppercase sm:w-40 sm:shrink-0 sm:pt-2';

  return (
    <div className="border-b border-border py-3 last:border-0 sm:flex sm:gap-4">
      {htmlFor === undefined ? (
        <span className={labelClass}>{label}</span>
      ) : (
        <label htmlFor={htmlFor} className={labelClass}>
          {label}
        </label>
      )}
      <div className="mt-1 min-w-0 flex-1 sm:mt-0">
        {children}
        {hint !== undefined && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

const selectClass =
  'h-9 w-full rounded-xs border border-input bg-transparent px-2 text-sm';

function Select({
  id,
  value,
  onChange,
  options,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder: string;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={selectClass}
    >
      {/* The empty option is how a field is CLEARED — buildPatchBody turns it
          into an explicit null. Without it a set value could never be unset. */}
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
    </select>
  );
}

function CheckboxGroup({
  legend,
  options,
  selected,
  onToggle,
}: {
  legend: string;
  options: Option[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (options.length === 0) {
    return <p className="text-xs text-muted-foreground">None defined yet — add some in Manage.</p>;
  }

  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => {
          const active = selected.includes(option.id);
          return (
            <label
              key={option.id}
              className={cn(
                'cursor-pointer rounded-xs border px-2 py-1 text-xs transition-colors',
                active ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent',
              )}
            >
              <input
                type="checkbox"
                checked={active}
                onChange={() => onToggle(option.id)}
                className="sr-only"
              />
              {option.name}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function RecordForm({
  reference,
  initial,
  recordId,
}: {
  reference: ReferenceData;
  initial: FormValues;
  /** Present when editing; absent when creating. */
  recordId?: string;
}) {
  const router = useRouter();

  /**
   * The ORIGINAL is kept alongside the current values, because PATCH sends only
   * what changed (§5.2). Without it the form can express "set" and "clear" but
   * never "leave alone", and the API's absent-vs-[] distinction becomes a
   * capability no UI can reach.
   */
  const [values, setValues] = useState<FormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const set = (field: keyof FormValues, value: string) =>
    setValues((current) => ({ ...current, [field]: value }));

  const toggle = (field: 'genreIds' | 'tagIds', id: string) =>
    setValues((current) => ({
      ...current,
      [field]: current[field].includes(id)
        ? current[field].filter((value) => value !== id)
        : [...current[field], id],
    }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    setFieldErrors({});

    try {
      const editing = recordId !== undefined;
      const body = editing ? buildPatchBody(initial, values) : buildCreateBody(values);

      // Nothing changed: navigating is the honest response to a save that has
      // nothing to save, rather than a request the API would reject for having
      // an empty body.
      if (editing && Object.keys(body).length === 0) {
        router.push(`/records/${recordId}`);
        return;
      }

      const response = await fetch(editing ? `/api/records/${recordId}` : '/api/records', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const parsed = parseApiError(await response.json().catch(() => null));
        if (parsed?.fieldErrors !== undefined) setFieldErrors(parsed.fieldErrors);
        setError(fallbackMessage(parsed));
        return;
      }

      const saved = await response.json();
      router.push(`/records/${editing ? recordId : saved.id}`);
    } catch {
      setError('Could not reach the server. Nothing was saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      {error !== undefined && (
        <p role="alert" className="mb-3 rounded-xs border border-destructive px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Row label="Title" htmlFor="title">
        <Input
          id="title"
          value={values.title}
          onChange={(event) => set('title', event.target.value)}
          required
          className="h-9"
        />
        {fieldErrors.title !== undefined && (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {fieldErrors.title}
          </p>
        )}
      </Row>

      <Row label="Artist" htmlFor="artistId">
        <Select
          id="artistId"
          value={values.artistId}
          onChange={(value) => set('artistId', value)}
          options={reference.artists}
          placeholder="Choose an artist"
        />
        {fieldErrors.artistId !== undefined && (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {fieldErrors.artistId}
          </p>
        )}
      </Row>

      <Row label="Label" htmlFor="labelId">
        <Select
          id="labelId"
          value={values.labelId}
          onChange={(value) => set('labelId', value)}
          options={reference.labels}
          placeholder="No label"
        />
      </Row>

      <Row label="Format" htmlFor="formatId">
        <Select
          id="formatId"
          value={values.formatId}
          onChange={(value) => set('formatId', value)}
          options={reference.formats}
          placeholder="No format"
        />
      </Row>

      <Row
        label="Release year"
        htmlFor="releaseYear"
        hint="The album's original year, not this pressing's."
      >
        <Input
          id="releaseYear"
          // `inputMode` rather than type="number": a number input allows
          // scientific notation and silently discards non-numeric text, so what
          // the user typed and what the form reads can differ.
          inputMode="numeric"
          value={values.releaseYear}
          onChange={(event) => set('releaseYear', event.target.value)}
          className="h-9 font-mono"
        />
        {fieldErrors.releaseYear !== undefined && (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {fieldErrors.releaseYear}
          </p>
        )}
      </Row>

      {(['conditionMedia', 'conditionSleeve'] as const).map((field) => (
        <Row
          key={field}
          label={field === 'conditionMedia' ? 'Media condition' : 'Sleeve condition'}
          htmlFor={field}
        >
          <select
            id={field}
            value={values[field]}
            onChange={(event) => set(field, event.target.value)}
            className={selectClass}
          >
            {/* §4.2 keeps these nullable so a record can be logged before it is
                graded — "not graded" has to stay reachable. */}
            <option value="">Not graded</option>
            {CONDITION_GRADES.map((grade) => (
              <option key={grade} value={grade}>
                {grade} — {conditionLabel(grade)}
              </option>
            ))}
          </select>
        </Row>
      ))}

      <Row label="Paid" htmlFor="purchasePrice">
        <Input
          id="purchasePrice"
          inputMode="decimal"
          placeholder="24.50"
          value={values.purchasePrice}
          onChange={(event) => set('purchasePrice', event.target.value)}
          className="h-9 font-mono"
        />
        {fieldErrors.purchasePrice !== undefined && (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {fieldErrors.purchasePrice}
          </p>
        )}
      </Row>

      <Row label="Bought on" htmlFor="purchaseDate">
        <Input
          id="purchaseDate"
          type="date"
          value={values.purchaseDate}
          onChange={(event) => set('purchaseDate', event.target.value)}
          className="h-9 font-mono"
        />
      </Row>

      <Row label="Bought from" htmlFor="storeId">
        <Select
          id="storeId"
          value={values.storeId}
          onChange={(value) => set('storeId', value)}
          options={reference.stores}
          placeholder="No store"
        />
      </Row>

      <Row label="Genres">
        <CheckboxGroup
          legend="Genres"
          options={reference.genres}
          selected={values.genreIds}
          onToggle={(id) => toggle('genreIds', id)}
        />
      </Row>

      <Row label="Tags">
        <CheckboxGroup
          legend="Tags"
          options={reference.tags}
          selected={values.tagIds}
          onToggle={(id) => toggle('tagIds', id)}
        />
      </Row>

      <Row label="Notes" htmlFor="notes">
        <textarea
          id="notes"
          rows={4}
          value={values.notes}
          onChange={(event) => set('notes', event.target.value)}
          className="w-full rounded-xs border border-input bg-transparent px-2 py-1.5 text-sm"
        />
      </Row>

      <div className="mt-4 flex items-center gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : recordId === undefined ? 'Add record' : 'Save changes'}
        </Button>
        <Link
          href={recordId === undefined ? '/' : `/records/${recordId}`}
          className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
