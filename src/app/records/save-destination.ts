/**
 * Where a save goes, and which body shape it takes (SPEC.md §5.7, §7.3, §10).
 *
 * §5.7 specifies a two-stage import: `/api/discogs/release/:id` renders into
 * the form, the user verifies and corrects, and **only then** is
 * `/api/discogs/import` called with the corrections as `overrides`. The form
 * previously posted every create to `/api/records`, which skipped stage two —
 * so §6's genre mapping, implemented and tested inside the import transaction,
 * was unreachable from anything a user could do.
 *
 * Extracted rather than inlined: four destinations chosen by three conditions
 * is a rule, and a rule inside a submit handler can only be tested through a
 * browser.
 */

export type SaveDestination = {
  method: 'POST' | 'PATCH';
  path: string;
  /**
   * Which payload the caller must build. `record` is the flat field object;
   * `import` is `{ discogsReleaseId, target, overrides }`.
   */
  shape: 'record' | 'import';
};

export function saveDestination(input: {
  editing: boolean;
  recordId?: string;
  discogsReleaseId?: number;
  acquiresWantListId?: string;
}): SaveDestination {
  // An edit is a PATCH of an existing row. Re-importing would create a SECOND
  // record for the same release — duplicates are legal (§4), which is exactly
  // why nothing may create one by accident.
  if (input.editing) {
    return { method: 'PATCH', path: `/api/records/${input.recordId}`, shape: 'record' };
  }

  /**
   * Acquire outranks import.
   *
   * §7.3: acquiring creates the record and marks the want-list row in ONE
   * transaction. Routing an acquisition to the import endpoint would create the
   * record and leave the want-list item unacquired — the half-application §7.3
   * forbids.
   */
  if (input.acquiresWantListId !== undefined) {
    return {
      method: 'POST',
      path: `/api/want-list/${input.acquiresWantListId}/acquire`,
      shape: 'record',
    };
  }

  if (input.discogsReleaseId !== undefined) {
    return { method: 'POST', path: '/api/discogs/import', shape: 'import' };
  }

  // §10: "or blank for manual entry."
  return { method: 'POST', path: '/api/records', shape: 'record' };
}

/**
 * The `/api/discogs/import` payload, built from the form body (§5.7).
 *
 * The endpoint derives artist, label rows, the pressing, genres and styles from
 * the release itself. This carries only what the USER can have changed — and
 * **every field the form offers must appear here**, or the user edits it, sees
 * a 201, and loses it. That is the step 6 `tagIds` defect, and the reason this
 * is a listed allow-list rather than a spread: a new form field is then a
 * deliberate addition here, not a silent omission.
 */
const OVERRIDE_FIELDS = [
  'title',
  'labelId',
  'formatId',
  'storeId',
  'releaseYear',
  'conditionMedia',
  'conditionSleeve',
  'purchasePrice',
  'purchaseDate',
  'notes',
  'genreIds',
  'tagIds',
  'catalogNumber',
  'countryPressed',
  'yearPressed',
  'matrixRunout',
  'pressingPlant',
] as const;

export type ImportBody = {
  discogsReleaseId: number;
  target: 'record';
  overrides: Record<string, unknown>;
};

export function buildImportBody(
  discogsReleaseId: number,
  body: Record<string, unknown>,
): ImportBody {
  const overrides: Record<string, unknown> = {};

  for (const field of OVERRIDE_FIELDS) {
    // Absent means "Discogs' value stands"; an explicit null means "make it
    // empty". A blank form field must not clear what Discogs supplied.
    if (body[field] !== undefined) overrides[field] = body[field];
  }

  /**
   * `artistId` and `pressingId` are deliberately NOT forwarded.
   *
   * The import find-or-creates the artist from the release, and creates its own
   * pressing — sending the form's selections would be a second, conflicting
   * source for each, and in the pressing's case would leave an orphan row.
   */
  return { discogsReleaseId, target: 'record', overrides };
}
