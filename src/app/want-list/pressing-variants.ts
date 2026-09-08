/**
 * SPEC.md §12b (A55, 2026-09-08) — the pressing facts the app HOLDS, displayed.
 *
 * **Why this exists, and it is a defect report rather than a feature idea.**
 * A43's assessment was handed `{ artist, title }` and nothing else. Asked about
 * Deerhunter's *Halcyon Digest* it produced three pressings under **CAD 3016** —
 * not this release — a gatefold sleeve that does not exist, and a US/EU/repress
 * frame that is a template rather than a description. The genuine distinction was
 * in the app's possession from a lookup: two variants differing in whether
 * *Desire Lines* fades early, told apart by **"Salt" etched in the side B
 * runout**.
 *
 * **So: display, not description.** These values are shown verbatim. A model
 * cannot fabricate a catalogue number it was never asked to produce, which makes
 * this a stronger guarantee than any prompt rule — and `isCheckable` is precisely
 * the rule that could not help, because it tests an identifier's SHAPE and
 * `CAD 3016` is well-formed.
 *
 * **A year is displayed but never counts as detail**, carrying A43's rule
 * forward: a year is an output of identification rather than an input to it, and
 * "the 2010 pressing" cannot be checked in a shop.
 */

export type HeldPressing = {
  catalogNumber: string | null;
  matrixRunout: string | null;
  countryPressed: string | null;
  colorVariant: string | null;
  pressingPlant: string | null;
  yearPressed: number | null;
};

export type VariantField = { label: string; value: string };

/**
 * **Three states, never two**, and they are the same distinction the walk's zero
 * needed (A52) — reused deliberately rather than invented again:
 *
 * - `no-pressing` — nothing attached. The app does not know WHICH record is
 *   being hunted, so it can say nothing about the pressing. Showing nothing is
 *   TRUE here, and attaching a pressing is what unlocks the panel.
 * - `no-detail` — a pressing is attached and carries nothing distinguishing.
 *   The app knows the record and has no variant facts, which is a different
 *   statement and implies a different action.
 * - `detail` — facts to show.
 */
export type VariantPanel = {
  state: 'no-pressing' | 'no-detail' | 'detail';
  fields: VariantField[];
  message: string | null;
};

/** Blank is absent. A whitespace-only field is not content. */
const present = (value: string | null): string | null => {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export function pressingVariantPanel(pressing: HeldPressing | null): VariantPanel {
  if (pressing === null) {
    return {
      state: 'no-pressing',
      fields: [],
      /*
       * **A56: the message also names why the assessment is unavailable.** The
       * two statements belong together — the app cannot say which pressing is
       * being hunted, and therefore cannot ask about one either. Splitting them
       * across two panels is what let "no anchor" sit above an invented CAD 3020.
       */
      message:
        'No target pressing on this want-list entry, so there is nothing recorded ' +
        'about which pressing you are hunting. Attach a target pressing to ask about it.',
    };
  }

  /*
   * Ordered by how useful each is when holding the record: the catalogue number
   * and the runout are what you read off the object, the variant descriptor is
   * what distinguishes two otherwise identical copies.
   *
   * **`yearPressed` is deliberately absent from this list.** See the docblock —
   * it is not a checkable identifier, so including it could make a pressing with
   * only a year look distinguished.
   */
  const candidates: Array<[string, string | null]> = [
    ['Catalogue number', present(pressing.catalogNumber)],
    ['Matrix / runout', present(pressing.matrixRunout)],
    ['Variant', present(pressing.colorVariant)],
    ['Pressing plant', present(pressing.pressingPlant)],
    ['Country', present(pressing.countryPressed)],
  ];

  const fields = candidates
    .filter((entry): entry is [string, string] => entry[1] !== null)
    .map(([label, value]) => ({ label, value }));

  /*
   * **Absent fields are omitted, not dashed.** The collection table uses an
   * em-dash because its columns must align; this panel exists to show what
   * DISTINGUISHES a pressing, and a row of dashes would be noise standing in for
   * a distinction that does not exist.
   */
  if (fields.length === 0) {
    return {
      state: 'no-detail',
      fields: [],
      message:
        'The target pressing on this entry carries no identifying details yet — ' +
        'no catalogue number, runout or variant. Edit it to add what you know.',
    };
  }

  return { state: 'detail', fields, message: null };
}
