/**
 * The pressing section of the record form (SPEC.md §10).
 *
 * The decision here is whether a pressing is created at all. §10's identifying
 * set is ALL EIGHT fields, deliberately wider than §4's match key of
 * `discogs_release_id` or `(catalog_number, country_pressed, year_pressed)`.
 *
 * A user who enters only a matrix runout has identified their pressing
 * precisely — it is the dead-wax fingerprint, and the field CLAUDE.md §8 calls
 * user-authoritative. A rule keyed on the match key would discard that entry
 * silently, which is the worst outcome available.
 */

export type PressingFormValues = {
  catalogNumber: string;
  matrixRunout: string;
  countryPressed: string;
  yearPressed: string;
  pressingPlant: string;
  vinylWeightGrams: string;
  colorVariant: string;
  isReissue: boolean;
};

const TEXT_FIELDS = [
  'catalogNumber',
  'matrixRunout',
  'countryPressed',
  'pressingPlant',
  'colorVariant',
] as const;

const NUMERIC_FIELDS = ['yearPressed', 'vinylWeightGrams'] as const;

function blank(value: string): boolean {
  return value.trim() === '';
}

/**
 * Whether the user entered anything at all.
 *
 * `isReissue` counts only when TICKED. It is a boolean defaulting to false, so
 * an untouched form has it false — treating that as a detail would attach a
 * pressing to every record, which is exactly the junk row §10 forbids.
 */
export function hasAnyPressingDetail(values: PressingFormValues): boolean {
  if (values.isReissue) return true;

  return [...TEXT_FIELDS, ...NUMERIC_FIELDS].some((field) => !blank(values[field]));
}

/**
 * The body for `POST /api/pressings`, or `undefined` when nothing was entered.
 *
 * `undefined` is the "attach no pressing" signal: §10 says that when all eight
 * are blank, no row is created and `pressing_id` stays null. That is
 * deliberately NOT §4's API-side rule — the endpoint is told "make me a
 * pressing" and must always create, whereas an empty form section means the
 * user simply did not fill it in.
 */
export function buildPressingBody(
  values: PressingFormValues,
): Record<string, unknown> | undefined {
  if (!hasAnyPressingDetail(values)) return undefined;

  const body: Record<string, unknown> = {};

  for (const field of TEXT_FIELDS) {
    if (!blank(values[field])) body[field] = values[field].trim();
  }

  for (const field of NUMERIC_FIELDS) {
    // Emptiness is checked BEFORE conversion: Number('') is 0, and a pressing
    // recorded as pressed in year 0 weighing 0 g passes the columns and is
    // wrong permanently. The coercion trap from NOTES, in numeric form.
    if (!blank(values[field])) body[field] = Number(values[field].trim());
  }

  // Only when ticked. false is the column default, so sending it is noise.
  if (values.isReissue) body.isReissue = true;

  return body;
}

/** An untouched pressing section. */
export const BLANK_PRESSING: PressingFormValues = {
  catalogNumber: '',
  matrixRunout: '',
  countryPressed: '',
  yearPressed: '',
  pressingPlant: '',
  vinylWeightGrams: '',
  colorVariant: '',
  isReissue: false,
};

/** A stored pressing as form strings, for prefilling the edit form. */
export function pressingToForm(pressing: {
  catalogNumber: string | null;
  matrixRunout: string | null;
  countryPressed: string | null;
  yearPressed: number | null;
  pressingPlant: string | null;
  vinylWeightGrams: number | null;
  colorVariant: string | null;
  isReissue: boolean;
} | null): PressingFormValues {
  if (pressing === null) return BLANK_PRESSING;

  return {
    catalogNumber: pressing.catalogNumber ?? '',
    matrixRunout: pressing.matrixRunout ?? '',
    countryPressed: pressing.countryPressed ?? '',
    yearPressed: pressing.yearPressed === null ? '' : String(pressing.yearPressed),
    pressingPlant: pressing.pressingPlant ?? '',
    vinylWeightGrams:
      pressing.vinylWeightGrams === null ? '' : String(pressing.vinylWeightGrams),
    colorVariant: pressing.colorVariant ?? '',
    isReissue: pressing.isReissue,
  };
}
