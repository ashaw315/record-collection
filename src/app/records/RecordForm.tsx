'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { parseApiError, fallbackMessage } from '@/lib/api/messages';
import { CONDITION_GRADES } from '@/lib/records/fields';
import { conditionLabel } from './record-detail-format';
import { buildCreateBody, buildPatchBody, type FormValues } from './record-form';
import { buildPressingBody, type PressingFormValues } from './pressing-form';
import { discogsIdToSubmit } from './pressing-identity';
import { buildImportBody, saveDestination } from './save-destination';
import { InlineCreate } from './InlineCreate';

/**
 * The add/edit record form (SPEC.md §10 `/records/new`, `/records/:id/edit`).
 *
 * Manual entry only. Discogs lookup is step 7 and is NOT stubbed here — a
 * disabled lookup field reads as broken rather than as not-yet-built, the same
 * reasoning as the absent gallery on the detail screen.
 *
 * Inline create for artist/label/store/tag (§10) lets a record be added without
 * leaving the form to define its artist first — the in-store case §10 names.
 */

/** Carries the API's per-field errors out of the pressing request. */
class PressingError extends Error {
  constructor(
    readonly fieldErrors: Record<string, string> | undefined,
    message?: string,
  ) {
    super(message ?? 'pressing');
  }
}

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
  after,
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
  /** Supporting detail rendered BELOW the hint — never between field and hint. */
  after?: ReactNode;
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
        {/*
          Below the hint, not between the input and it. The hint is the
          INSTRUCTION ("read from the dead wax"); anything here is subordinate
          reference, and splitting a field from its own instruction to make room
          for supporting detail inverts that.
        */}
        {after}
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
  initialPressing,
  initialPressingId,
  recordId,
  acquiresWantListId,
  suggestions,
  matrixReference,
  notesReference,
}: {
  reference: ReferenceData;
  initial: FormValues;
  /** The record's current pressing as form strings; blank when it has none. */
  initialPressing: PressingFormValues;
  /** The id it currently points at, so a detach can be distinguished. */
  initialPressingId?: string;
  /** Present when editing; absent when creating. */
  recordId?: string;
  /**
   * Present when this save is an ACQUISITION (§5.3). The form then posts to
   * the acquire endpoint, which creates the record and marks the want-list row
   * in ONE transaction — posting to /api/records and patching separately would
   * be the half-application §7.3 forbids.
   */
  acquiresWantListId?: string;
  /**
   * Names an import supplied that matched no existing row (§5.7), offered in
   * the inline-create boxes. Artist and label only: Discogs has no notion of
   * WHERE you bought a record, so store never has a suggestion, and format is a
   * fixed reference list where "choose the closest" is the right instruction.
   */
  suggestions?: { artist: string | null; label: string | null };
  /**
   * Discogs' Matrix / Runout values, shown beside the field as reference.
   * Deliberately not a prefilled VALUE — §5.7 requires the user to read this
   * one off the dead wax, and a release carries variants from several
   * pressings at once.
   */
  matrixReference?: string | null;
  /**
   * Discogs' notes about the RELEASE, shown beside the field. Never a value:
   * the field is the user's note about their own copy, and a prefilled one
   * reads as verified while making §7.8's "never overwrite user-entered data"
   * unenforceable.
   */
  notesReference?: string | null;
}) {
  const router = useRouter();

  /**
   * The ORIGINAL is kept alongside the current values, because PATCH sends only
   * what changed (§5.2). Without it the form can express "set" and "clear" but
   * never "leave alone", and the API's absent-vs-[] distinction becomes a
   * capability no UI can reach.
   */
  const [values, setValues] = useState<FormValues>(initial);
  const [pressing, setPressing] = useState<PressingFormValues>(initialPressing);
  /**
   * A local copy of the selectable options, so a row created inline is
   * available immediately. The server's copy arrives on the next load; until
   * then this holds what the user just added, which is the only way the new
   * value can be selected without losing the half-filled form.
   */
  const [options, setOptions] = useState<ReferenceData>(reference);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  /**
   * A TEST-SUPPORT AFFORDANCE, and deliberately so.
   *
   * `data-hydrated` appears only after the effect runs, which is only after
   * React has hydrated and attached its event handlers. Nothing in the product
   * reads it.
   *
   * It exists because WebKit reaches the DOM appreciably before hydration
   * completes, so a test filling an input in that window sets the DOM value
   * while React's state never receives it — the field then submits as
   * undefined. Measured: 6 of 8 submissions lost a filled field without a
   * hydration wait.
   *
   * Waiting on a RENDERED CONTROL does not fix it, which is the reason this
   * marker exists rather than a selector: the controls are server-rendered, so
   * their presence proves the markup arrived, not that it is interactive —
   * exactly the failing state.
   *
   * The alternative is tests guessing at hydration timing, and the guessing is
   * the bug. A marker the app sets when it is genuinely ready is honest; a
   * timeout tuned until it usually passes is not.
   */
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    // The DOM attribute IS the external system here, which is the case
    // react-hooks/set-state-in-effect names as the legitimate use of an
    // effect. Setting it directly also avoids a second render purely to
    // publish a flag no React code reads.
    formRef.current?.setAttribute('data-hydrated', 'true');
  }, []);

  const set = (field: keyof FormValues, value: string) =>
    setValues((current) => ({ ...current, [field]: value }));

  /**
   * The API's error for one pressing field, rendered beside it.
   *
   * `aria-describedby` on the input points here, so a screen reader announces
   * the reason when focus lands on the offending field rather than leaving it
   * in a banner elsewhere on the page.
   */
  const pressingError = (field: string) =>
    fieldErrors[field] === undefined ? null : (
      <p id={`${field}-error`} role="alert" className="mt-1 text-xs text-destructive">
        {fieldErrors[field]}
      </p>
    );

  const setPressingField = (field: keyof PressingFormValues, value: string | boolean) =>
    setPressing((current) => ({ ...current, [field]: value }));

  /**
   * Resolves the pressing section to an id, per §10.
   *
   * `undefined` means "leave the record's pressing_id as it is"; `null` means
   * DETACH. §10 is explicit that clearing every field detaches and never
   * deletes — pressings are shared (§4), so deleting one could silently alter
   * another record.
   */
  async function resolvePressingId(): Promise<string | null | undefined> {
    /**
     * §10: "a corrected pressing is a different pressing."
     *
     * The prefill's release id is sent only while the identifying fields still
     * match what Discogs supplied. `discogs_release_id` is unique (§4.2) and
     * pressings are shared (§4), so sending it alongside an edited catalog
     * number would find the existing shared row and silently discard the
     * user's correction — or, worse, write it onto every record matching that
     * release.
     *
     * `initialPressing` is the untouched prefill; `pressing` is what the user
     * is looking at now.
     */
    const body = buildPressingBody({
      ...pressing,
      discogsReleaseId: discogsIdToSubmit(
        initialPressing.discogsReleaseId,
        initialPressing,
        pressing,
      ),
    });

    if (body === undefined) {
      // Nothing entered. On create that means no pressing at all; on edit it
      // means detach if one was attached, and nothing if there was not.
      return recordId === undefined || initialPressingId === undefined ? undefined : null;
    }

    const response = await fetch('/api/pressings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      /**
       * Surface the API's own fieldErrors rather than a bare banner.
       *
       * §5 requires them on a 400 and `/api/pressings` returns them — the form
       * used to discard the parsed body, so "199" in Year pressed produced
       * "Could not save the pressing details" naming neither the field nor the
       * reason. The user had to guess which of eight fields was wrong.
       */
      const parsed = parseApiError(await response.json().catch(() => null));
      throw new PressingError(parsed?.fieldErrors, parsed?.message);
    }

    // §4 find-or-create: 200 is an existing shared row, 201 a new one. Both
    // give the id this record should point at.
    return (await response.json()).id as string;
  }

  /** Adds a newly created row to its list and selects it. */
  function adopt(
    group: 'artists' | 'labels' | 'stores' | 'tags',
    field: keyof FormValues,
    option: Option,
    message?: string,
  ) {
    setOptions((current) => {
      // A duplicate resolves to a row that may already be listed — adding it
      // twice would render two identical options.
      const already = current[group].some((entry) => entry.id === option.id);
      if (already) return current;
      return {
        ...current,
        [group]: [...current[group], option].sort((a, b) => a.name.localeCompare(b.name)),
      };
    });

    if (group === 'tags') {
      setValues((current) =>
        current.tagIds.includes(option.id)
          ? current
          : { ...current, tagIds: [...current.tagIds, option.id] },
      );
    } else {
      set(field, option.id);
    }

    setNotice(message);
  }

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

      let pressingId: string | null | undefined;
      try {
        pressingId = await resolvePressingId();
      } catch (thrown) {
        if (thrown instanceof PressingError) {
          setFieldErrors(thrown.fieldErrors ?? {});
          // The banner only says what the field errors cannot: that the record
          // was not written either. Verified true — the pressing POST fails
          // before the record POST is issued.
          setError(
            thrown.fieldErrors === undefined
              ? (thrown.message ?? 'Could not save the pressing details. Nothing was saved.')
              : 'The pressing details need a correction. Nothing was saved yet.',
          );
          return;
        }
        setError('Could not save the pressing details. Nothing was saved.');
        return;
      }

      const body = editing ? buildPatchBody(initial, values) : buildCreateBody(values);
      // Only when it changed, so an untouched pressing is absent from a PATCH
      // and the record keeps what it had (§5.2's absent-means-leave-alone).
      if (pressingId !== undefined && pressingId !== initialPressingId) {
        body.pressingId = pressingId;
      } else if (pressingId === null && initialPressingId !== undefined) {
        body.pressingId = null;
      }

      /**
       * The pressing is resolved separately ONLY on the record path. The import
       * creates its own from the release plus overrides, so sending a
       * `pressingId` there would attach one pressing and orphan another —
       * `buildImportBody` drops it, and this skips the round trip entirely.
       */
      // Nothing changed: navigating is the honest response to a save that has
      // nothing to save, rather than a request the API would reject for having
      // an empty body.
      if (editing && Object.keys(body).length === 0) {
        router.push(`/records/${recordId}`);
        return;
      }

      /**
       * §5.7's stage two: a create that came from a Discogs release posts to
       * `/api/discogs/import` with the user's corrections as `overrides`.
       *
       * It previously posted every create to `/api/records`, which skipped the
       * import entirely — so §6's genre mapping, implemented and tested inside
       * that transaction, was unreachable from anything a user could do. Every
       * imported record arrived with no genres, starving §7.1's hierarchy, the
       * facet chips, `matchedVia`, and steps 10-12.
       */
      /**
       * The release this form was prefilled FROM, not whatever the pressing
       * currently claims. `discogsIdToSubmit` may legitimately drop the id when
       * the user corrects an identifying field (§10) — but the import still
       * needs to know which release to fetch, and the endpoint applies the same
       * rule itself when deciding whether to keep it on the pressing.
       */
      const importReleaseId = editing ? undefined : (initialPressing.discogsReleaseId ?? undefined);

      const target = saveDestination({
        editing,
        recordId,
        discogsReleaseId: importReleaseId,
        acquiresWantListId,
      });

      const response = await fetch(target.path, {
        method: target.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          target.shape === 'import' && importReleaseId !== undefined
            ? buildImportBody(importReleaseId, body)
            : body,
        ),
      });

      if (!response.ok) {
        const parsed = parseApiError(await response.json().catch(() => null));
        if (parsed?.fieldErrors !== undefined) setFieldErrors(parsed.fieldErrors);
        setError(fallbackMessage(parsed));
        return;
      }

      const saved = await response.json();

      /**
       * Carried through the URL because this navigates immediately — a message
       * set in state here would be unmounted before anyone read it.
       *
       * Only for a genuine FAILURE. `reason: 'none'` means the release had no
       * images, which is not worth saying: a notice on every coverless record
       * would train the user to ignore the one that matters. §5.7's rule that
       * Discogs is imperfect cuts both ways — a missing cover is normal, a
       * failed fetch is information.
       */
      const coverFailed = saved?.cover?.attached === false && saved.cover.reason === 'failed';
      const destination = `/records/${editing ? recordId : saved.id}`;

      router.push(coverFailed ? `${destination}?cover=failed` : destination);
    } catch {
      setError('Could not reach the server. Nothing was saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate>
      {error !== undefined && (
        <p role="alert" className="mb-3 rounded-xs border border-destructive px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* A collision is not an error — the row exists and has been selected —
          so it is announced politely rather than as an alert. */}
      {notice !== undefined && (
        <p role="status" className="mb-3 rounded-xs border border-border px-3 py-2 text-sm text-muted-foreground">
          {notice}
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
          options={options.artists}
          placeholder="Choose an artist"
        />
        <InlineCreate
          noun="artist"
          path="/api/artists"
          suggestion={suggestions?.artist ?? undefined}
          onCreated={(option, message) => adopt('artists', 'artistId', option, message)}
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
          options={options.labels}
          placeholder="No label"
        />
        <InlineCreate
          noun="label"
          path="/api/labels"
          suggestion={suggestions?.label ?? undefined}
          
          onCreated={(option, message) => adopt('labels', 'labelId', option, message)}
        />
      </Row>

      <Row label="Format" htmlFor="formatId">
        <Select
          id="formatId"
          value={values.formatId}
          onChange={(value) => set('formatId', value)}
          options={options.formats}
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
          placeholder="e.g. 24.50"
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
          options={options.stores}
          placeholder="No store"
        />
        <InlineCreate
          noun="store"
          path="/api/stores"
          onCreated={(option, message) => adopt('stores', 'storeId', option, message)}
        />
      </Row>

      <Row label="Genres">
        <CheckboxGroup
          legend="Genres"
          options={options.genres}
          selected={values.genreIds}
          onToggle={(id) => toggle('genreIds', id)}
        />
      </Row>

      <Row label="Tags">
        <CheckboxGroup
          legend="Tags"
          options={options.tags}
          selected={values.tagIds}
          onToggle={(id) => toggle('tagIds', id)}
        />
        <InlineCreate
          noun="tag"
          path="/api/tags"
          onCreated={(option, message) => adopt('tags', 'tagIds', option, message)}
        />
      </Row>

      {/*
        Pressing details (§10). Entered here rather than on a separate screen:
        a pressing has no meaning apart from the record it describes.

        ALL OPTIONAL. §10 requires the in-store case to stay enterable in
        seconds, and leaving every field blank attaches no pressing at all
        rather than creating an empty row.
      */}
      <fieldset className="mt-5 border-t border-border pt-3">
        <legend className="font-heading text-sm font-semibold tracking-tight">
          Pressing details
        </legend>
        <p className="mb-1 text-xs text-muted-foreground">
          All optional. Leave blank if you are logging the record quickly.
        </p>

        <Row label="Catalog no." htmlFor="catalogNumber">
          <Input
            id="catalogNumber"
            aria-describedby={fieldErrors.catalogNumber === undefined ? undefined : 'catalogNumber-error'}
            aria-invalid={fieldErrors.catalogNumber !== undefined}
            value={pressing.catalogNumber}
            onChange={(event) => setPressingField('catalogNumber', event.target.value)}
            placeholder="e.g. CLAY LP 3"
            className="h-9 font-mono"
          />
        {pressingError('catalogNumber')}
        </Row>

        <Row
          label="Matrix / runout"
          htmlFor="matrixRunout"
          hint="Read from the dead wax. This is what identifies your exact pressing, and nothing overwrites it later."
          after={
            /*
              Reference, not a value. Discogs lists every runout its
              contributors have submitted — eight on the captured fixture,
              across FOUR different pressings — so this is what to compare
              against while reading the wax, not something to accept. Rendered
              as text rather than in the input so it cannot be saved by leaving
              the field untouched.
            */
            matrixReference === null || matrixReference === undefined ? undefined : (
              <p
                data-testid="matrix-reference"
                className="mt-1 font-mono text-xs text-muted-foreground"
              >
                <span className="font-sans">Discogs lists:</span> {matrixReference}
              </p>
            )
          }
        >
          <Input
            id="matrixRunout"
            aria-describedby={fieldErrors.matrixRunout === undefined ? undefined : 'matrixRunout-error'}
            aria-invalid={fieldErrors.matrixRunout !== undefined}
            value={pressing.matrixRunout}
            onChange={(event) => setPressingField('matrixRunout', event.target.value)}
            className="h-9 font-mono"
          />
        {pressingError('matrixRunout')}
        </Row>

        <Row label="Country" htmlFor="countryPressed">
          <Input
            id="countryPressed"
            aria-describedby={fieldErrors.countryPressed === undefined ? undefined : 'countryPressed-error'}
            aria-invalid={fieldErrors.countryPressed !== undefined}
            value={pressing.countryPressed}
            onChange={(event) => setPressingField('countryPressed', event.target.value)}
            placeholder="e.g. UK"
            className="h-9"
          />
        {pressingError('countryPressed')}
        </Row>

        <Row label="Year pressed" htmlFor="yearPressed" hint="This pressing's year, not the album's.">
          <Input
            id="yearPressed"
            aria-describedby={fieldErrors.yearPressed === undefined ? undefined : 'yearPressed-error'}
            aria-invalid={fieldErrors.yearPressed !== undefined}
            inputMode="numeric"
            value={pressing.yearPressed}
            onChange={(event) => setPressingField('yearPressed', event.target.value)}
            className="h-9 font-mono"
          />
        {pressingError('yearPressed')}
        </Row>

        <Row label="Pressing plant" htmlFor="pressingPlant">
          <Input
            id="pressingPlant"
            aria-describedby={fieldErrors.pressingPlant === undefined ? undefined : 'pressingPlant-error'}
            aria-invalid={fieldErrors.pressingPlant !== undefined}
            value={pressing.pressingPlant}
            onChange={(event) => setPressingField('pressingPlant', event.target.value)}
            className="h-9"
          />
        {pressingError('pressingPlant')}
        </Row>

        <Row label="Weight (g)" htmlFor="vinylWeightGrams">
          <Input
            id="vinylWeightGrams"
            aria-describedby={fieldErrors.vinylWeightGrams === undefined ? undefined : 'vinylWeightGrams-error'}
            aria-invalid={fieldErrors.vinylWeightGrams !== undefined}
            inputMode="numeric"
            value={pressing.vinylWeightGrams}
            onChange={(event) => setPressingField('vinylWeightGrams', event.target.value)}
            placeholder="e.g. 180"
            className="h-9 font-mono"
          />
        {pressingError('vinylWeightGrams')}
        </Row>

        <Row label="Colour" htmlFor="colorVariant">
          <Input
            id="colorVariant"
            aria-describedby={fieldErrors.colorVariant === undefined ? undefined : 'colorVariant-error'}
            aria-invalid={fieldErrors.colorVariant !== undefined}
            value={pressing.colorVariant}
            onChange={(event) => setPressingField('colorVariant', event.target.value)}
            placeholder="e.g. Black"
            className="h-9"
          />
        {pressingError('colorVariant')}
        </Row>

        <Row label="Reissue" htmlFor="isReissue">
          <label className="flex items-center gap-2 text-sm">
            <input
              id="isReissue"
              type="checkbox"
              checked={pressing.isReissue}
              onChange={(event) => setPressingField('isReissue', event.target.checked)}
              className="size-4 accent-primary"
            />
            This is a reissue
          </label>
        </Row>
      </fieldset>

      <Row
        label="Notes"
        htmlFor="notes"
        after={
          // Second instance of the matrix treatment: shown, not filled.
          notesReference === null || notesReference === undefined ? undefined : (
            <p
              data-testid="notes-reference"
              className="mt-1 text-xs whitespace-pre-line text-muted-foreground"
            >
              <span className="font-medium">Discogs lists:</span> {notesReference}
            </p>
          )
        }
      >
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
          {saving
            ? 'Saving…'
            : recordId !== undefined
              ? 'Save changes'
              : acquiresWantListId === undefined
                ? 'Add record'
                : 'Add to collection'}
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
