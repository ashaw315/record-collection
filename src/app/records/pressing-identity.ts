import type { PressingFormValues } from './pressing-form';

/**
 * SPEC.md §10: **a corrected pressing is a different pressing.**
 *
 * The form carries `discogsReleaseId` from the prefill so §7.7's ownership
 * check can reach tier 1 — but sends it only if the identifying fields still
 * match what Discogs supplied.
 *
 * **Why not simply always send it.** `discogs_release_id` is unique (§4.2) and
 * pressings are shared (§4), so the row carrying a release id is *the* row for
 * that release. A user's edit riding along with the id would be written onto
 * every record that matches the same release — §7.8's rule broken in the
 * direction hardest to notice, because the damage lands on data they never
 * touched.
 *
 * **Why dropping the id is honest rather than a concession.** A pressing whose
 * printed details contradict Discogs' record of a release is not that release:
 * it may be one Discogs has merged, split, or got wrong, all of which §6 says
 * happen. "You own a different pressing" is then exactly true.
 *
 * The cost is real and accepted: correcting a typo in Discogs' catalog number
 * loses tier 1 for that record permanently. §7.7's asymmetry decides it — the
 * app cannot tell "Discogs is wrong" from "this is a different pressing", and
 * the error a user never discovers is the one to avoid.
 */

/**
 * The fields that make a claim about WHICH RELEASE this is.
 *
 * Printed, stable facts: a catalog number, a country and a year of pressing are
 * on the sleeve and the label, and differing from them contradicts identity.
 *
 * **`matrixRunout` is deliberately NOT here**, and §10 spells out why. Discogs'
 * runout list is incomplete by construction — it records only the variants
 * contributors have submitted — so a runout it does not list is information
 * Discogs LACKS rather than evidence of a different release. Treating it as
 * identity-contradicting would also punish the careful: it is the field the app
 * most encourages users to fill in, and every one of them would lose tier 1.
 *
 * Weight, colour and plant are absent for a plainer reason: they describe the
 * object without claiming which release it is.
 */
const IDENTIFYING_FIELDS = ['catalogNumber', 'countryPressed', 'yearPressed'] as const;

/**
 * Whitespace and case are not corrections.
 *
 * A user who retypes "sp-3502 " has contradicted nothing, and catalog numbers
 * are printed in varying case on the sleeve itself. Dropping the id there would
 * cost tier 1 for a difference nobody intended.
 */
function sameValue(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * The rule itself, over plain strings, so the FORM path and the IMPORT path
 * share one definition (§10, §7.6).
 *
 * Extracted when the form was pointed at `/api/discogs/import`: that endpoint
 * sent `discogs_release_id` unconditionally, even against a corrected catalog
 * number, while the form applied this rule. Two halves of one spec sentence in
 * two places is how they drift — and here they already had.
 *
 * Each pair is `[what Discogs said, what the user is submitting]`.
 */
export function contradictsDiscogs(pairs: Array<[string, string]>): boolean {
  return pairs.some(([original, now]) => {
    if (sameValue(original, now)) return false;

    /**
     * FILLING IN a field Discogs left blank is not a contradiction — the user
     * is adding information, not disputing it. Only a change to something
     * Discogs actually asserted drops the id.
     */
    return original.trim() !== '';
  });
}

export function discogsIdToSubmit(
  prefilledId: number | null,
  fromDiscogs: PressingFormValues,
  current: PressingFormValues,
): number | null {
  // Nothing was prefilled: this pressing claims no Discogs release, and
  // inventing one would be CLAUDE.md §8's collapse.
  if (prefilledId === null) return null;

  const contradicted = contradictsDiscogs(
    IDENTIFYING_FIELDS.map((field) => [fromDiscogs[field], current[field]]),
  );

  return contradicted ? null : prefilledId;
}
