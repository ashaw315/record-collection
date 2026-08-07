/**
 * Turning form strings into an API payload (SPEC.md §5.2).
 *
 * The highest-risk conversion in the app. An HTML input only ever yields a
 * STRING — `''` when empty — and `''` has to mean different things depending
 * on the field and the verb. Every Zod coercion trap recorded in NOTES.md
 * originated in this shape, and all three shared a property: they produced a
 * VALID-LOOKING value rather than an error, so nothing downstream could tell.
 *
 * The three states §5.2 distinguishes, and which this module exists to produce:
 *
 *   absent  → leave the stored value alone   (PATCH only)
 *   null    → clear the stored value
 *   value   → set it
 *
 * A form that always submits every field cannot express the first, and the
 * API's absent-vs-[] distinction becomes a capability no UI can reach.
 */

export type FormValues = {
  title: string;
  artistId: string;
  labelId: string;
  formatId: string;
  storeId: string;
  releaseYear: string;
  conditionMedia: string;
  conditionSleeve: string;
  purchasePrice: string;
  purchaseDate: string;
  notes: string;
  genreIds: string[];
  tagIds: string[];
};

/** The scalar fields, and how each blank string is interpreted. */
const TEXT_FIELDS = ['title', 'notes'] as const;
const ID_FIELDS = ['artistId', 'labelId', 'formatId', 'storeId'] as const;
const ENUM_FIELDS = ['conditionMedia', 'conditionSleeve'] as const;
/** Sent as strings: NUMERIC(10,2) and DATE both arrive as text (§4.2). */
const STRING_VALUE_FIELDS = ['purchasePrice', 'purchaseDate'] as const;

type Payload = Record<string, unknown>;

function blank(value: string): boolean {
  return value.trim() === '';
}

/**
 * The year as a NUMBER, or undefined when not supplied.
 *
 * `Number('')` is 0 — the coercion trap, in the direction a form produces it.
 * A record created with releaseYear 0 passes the column and is wrong forever,
 * so emptiness is checked BEFORE any conversion rather than after.
 */
function yearValue(raw: string): number | undefined {
  return blank(raw) ? undefined : Number(raw.trim());
}

/**
 * The body for POST: only what was actually filled in.
 *
 * No explicit nulls for blank fields — the columns already default to null, and
 * sending them is noise the endpoint has to validate. It also keeps the create
 * and update paths visibly different, so the PATCH semantics are not eroded by
 * copying this function.
 */
export function buildCreateBody(values: FormValues): Payload {
  const body: Payload = {};

  for (const field of TEXT_FIELDS) {
    if (!blank(values[field])) body[field] = values[field].trim();
  }
  for (const field of ID_FIELDS) {
    if (!blank(values[field])) body[field] = values[field];
  }
  for (const field of ENUM_FIELDS) {
    if (!blank(values[field])) body[field] = values[field];
  }
  for (const field of STRING_VALUE_FIELDS) {
    if (!blank(values[field])) body[field] = values[field].trim();
  }

  const year = yearValue(values.releaseYear);
  if (year !== undefined) body.releaseYear = year;

  // Omitted when empty rather than sent as []. Equivalent on create, but
  // sending [] here is how the PATCH distinction gets lost to copy-paste.
  if (values.genreIds.length > 0) body.genreIds = values.genreIds;
  if (values.tagIds.length > 0) body.tagIds = values.tagIds;

  return body;
}

/** Same members, order-insensitive: checkbox order is a UI artefact, not an edit. */
function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const seen = new Set(a);
  return b.every((value) => seen.has(value));
}

/**
 * The body for PATCH: only what CHANGED, with a cleared field sent as `null`.
 *
 * Comparing against the original is what makes all three states reachable. The
 * alternative — submitting every field every time — can express "set" and
 * "clear" but never "leave alone", and an unmodified save would rewrite every
 * column.
 */
export function buildPatchBody(original: FormValues, current: FormValues): Payload {
  const body: Payload = {};

  const scalar = (field: keyof FormValues, before: string, after: string, value?: unknown) => {
    if (before.trim() === after.trim()) return;
    // Emptied a field that held something → clear it. Emptied a field that was
    // already empty is caught by the equality check above, so `null` is never
    // sent for a no-op.
    body[field] = blank(after) ? null : (value ?? after.trim());
  };

  for (const field of [...TEXT_FIELDS, ...ID_FIELDS, ...ENUM_FIELDS, ...STRING_VALUE_FIELDS]) {
    scalar(field, original[field], current[field]);
  }

  scalar('releaseYear', original.releaseYear, current.releaseYear, yearValue(current.releaseYear));

  // [] means REMOVE ALL and absent means LEAVE ALONE (§5.2). Both are
  // reachable here precisely because the array is compared rather than always
  // sent — the distinction NOTES records as having caused silent data loss.
  if (!sameSet(original.genreIds, current.genreIds)) body.genreIds = current.genreIds;
  if (!sameSet(original.tagIds, current.tagIds)) body.tagIds = current.tagIds;

  return body;
}
