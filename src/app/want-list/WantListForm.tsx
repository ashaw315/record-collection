'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FORM_SECTIONS, buildWantListBody, type WantListFormValues } from './want-list-form';

/**
 * SPEC.md §10's want-list form — `/want-list/new`.
 *
 * The layout is driven by `FORM_SECTIONS`, which is where §7.2's separation is
 * DECIDED and tested: best-dig notes and max price live in different sections
 * with different headings, and no section may hold both. That property is
 * asserted against the data rather than the markup, because a DOM test passes
 * as long as two labels exist somewhere — whatever groups them.
 *
 * CLAUDE.md §8 is the reason it matters: "best dig" is the pressing worth
 * hunting for, never the cheapest or the best deal, and `max_price` is the
 * user's own unrelated ceiling.
 */

export type ReferenceOption = { id: string; name: string };

export function WantListForm({
  initial,
  artists,
  labels,
  unmatched,
}: {
  initial: WantListFormValues;
  artists: ReferenceOption[];
  labels: ReferenceOption[];
  /** Names a Discogs prefill could not match to a row (§10). */
  unmatched?: { artist: string | null; label: string | null };
}) {
  const router = useRouter();
  const [values, setValues] = useState<WantListFormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  /**
   * The hydration signal, set through a ref — the pattern RecordForm
   * established. WebKit reaches the DOM before React hydrates, so a spec that
   * fills a field in that window sets a value React never sees.
   */
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    formRef.current?.setAttribute('data-hydrated', 'true');
  }, []);

  function set(field: keyof WantListFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    setFieldErrors({});

    try {
      const response = await fetch('/api/want-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildWantListBody(values)),
      });

      const body = await response.json();

      if (!response.ok) {
        setFieldErrors(body?.error?.fieldErrors ?? {});
        setError(body?.error?.message ?? 'Could not save.');
        return;
      }

      router.push('/want-list');
      router.refresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} data-testid="want-list-form" className="space-y-6">
      {FORM_SECTIONS.map((section) => (
        <section key={section.key} data-testid={`section-${section.key}`} className="space-y-2">
          <div>
            <h2 className="font-heading text-sm font-semibold tracking-tight">
              {section.heading}
            </h2>
            {section.hint !== undefined && (
              <p className="text-xs text-muted-foreground">{section.hint}</p>
            )}
          </div>

          <div className="space-y-3 border-t border-border pt-3">
            {section.fields.map((field) => (
              <Field
                key={field}
                field={field}
                label={section.labels[field] ?? field}
                value={values[field]}
                error={fieldErrors[field]}
                artists={artists}
                labels={labels}
                onChange={(value) => set(field, value)}
              />
            ))}
          </div>
        </section>
      ))}

      {unmatched?.artist != null && (
        <p data-testid="unmatched-artist" className="text-sm">
          No artist named “{unmatched.artist}” in your collection yet — add them in Manage first.
        </p>
      )}
      {unmatched?.label != null && (
        <p data-testid="unmatched-label" className="text-sm">
          No label named “{unmatched.label}” yet — add it in Manage first.
        </p>
      )}

      {error !== undefined && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 border-t border-border pt-4">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Add to want list'}
        </Button>
        <button
          type="button"
          onClick={() => router.push('/want-list')}
          className="text-sm text-muted-foreground underline underline-offset-2"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({
  field,
  label,
  value,
  error,
  artists,
  labels,
  onChange,
}: {
  field: keyof WantListFormValues;
  label: string;
  value: string;
  error?: string;
  artists: ReferenceOption[];
  labels: ReferenceOption[];
  onChange: (value: string) => void;
}) {
  const describedBy = error === undefined ? undefined : `${field}-error`;

  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:items-baseline sm:gap-3">
      <label htmlFor={field} className="text-xs text-muted-foreground uppercase">
        {label}
      </label>

      <div className="space-y-1">
        {field === 'artistId' || field === 'labelId' ? (
          <select
            id={field}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-describedby={describedBy}
            aria-invalid={error !== undefined}
            className="h-9 w-full rounded-xs border border-border bg-background px-2 text-sm"
          >
            <option value="">{field === 'artistId' ? 'Choose an artist' : 'No label'}</option>
            {(field === 'artistId' ? artists : labels).map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        ) : field === 'priority' ? (
          <select
            id={field}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="h-9 w-full rounded-xs border border-border bg-background px-2 text-sm"
          >
            {/* Named, not numbered — §4.2 makes 1 the highest and a bare digit
                cannot tell the reader which end is the top. */}
            {[
              ['1', 'Highest'],
              ['2', 'High'],
              ['3', 'Medium'],
              ['4', 'Low'],
              ['5', 'Lowest'],
            ].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        ) : field === 'bestDigNotes' ? (
          <textarea
            id={field}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            rows={3}
            placeholder="e.g. UK first press on Clay, Porky stamp in the dead wax"
            className="w-full rounded-xs border border-border bg-background px-2 py-1.5 text-sm"
          />
        ) : (
          <Input
            id={field}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-describedby={describedBy}
            aria-invalid={error !== undefined}
            placeholder={field === 'maxPrice' ? 'e.g. 40.00' : undefined}
            className={field === 'maxPrice' ? 'h-9 font-mono' : 'h-9'}
          />
        )}

        {error !== undefined && (
          <p id={describedBy} className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
