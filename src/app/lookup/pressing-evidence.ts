import type { NormalizedRelease } from '@/lib/discogs/normalize-release';

/**
 * SPEC.md §12 step 14c — verification-by-display.
 *
 * Release detail carries what a search payload cannot: the deadwax, the plant,
 * and a contributor's description. This shapes those into what the panel
 * displays, and **that is all it does**. It does not match, score, rank, or
 * decide which release the user is holding — the user's eye is the matcher.
 *
 * **Why a module rather than inline JSX.** The separation between evidence and
 * context is a RULE (§7.8's shape: a description is not a fact), and a rule that
 * lives only in a component's markup is one render-refactor away from being
 * flattened. Keeping `notes` in its own field means the panel *cannot*
 * accidentally merge it into the identifier list.
 */

export type PressingEvidence = {
  /**
   * The deadwax, in Discogs' order, VERBATIM.
   *
   * `description` is carried alongside because it is frequently the only thing
   * separating two pressings — measured on the committed collision pair, whose
   * runout VALUES are byte-identical and whose descriptions are not.
   */
  runouts: Array<{ value: string; description: string | null }>;
  /** Pressing Plant ID, Rights Society, Label Code — everything not a runout. */
  otherIdentifiers: Array<{ type: string; value: string; description: string | null }>;
  /** Pressed By / Manufactured By / Lacquer Cut At — who physically made it. */
  companies: Array<{ role: string; name: string }>;
  /**
   * A contributor's prose. Kept in its own field, never merged into the lists
   * above: it is CONTEXT, not evidence the user can check against the object.
   */
  notes: string | null;
  /**
   * Whether Discogs holds anything to compare at all.
   *
   * §12 step 14c: "Absence reads as absence." 3 of 41 measured releases carry
   * no matrix, and the panel must say so rather than render an empty region
   * that looks like a field which failed to load.
   */
  hasEvidence: boolean;
};

export function pressingEvidence(release: NormalizedRelease): PressingEvidence {
  /**
   * **Runout values pass through UNTOUCHED** (§12 step 14c, the rule this
   * feature lives or dies by). `normalizeRelease` has already applied
   * `bounded()` as a denial-of-service guard and deliberately nothing else.
   *
   * Do NOT add `.trim()`, whitespace collapsing or `meaningful()` here in good
   * faith — every character is discrimination the user's eye is relying on, and
   * a tidied runout still looks like a runout, so the loss would be silent.
   * `pressing-evidence.test.ts` fails if this changes.
   */
  const runouts = release.matrixRunoutDetail;
  const companies = release.manufacturingCompanies;

  return {
    runouts,
    otherIdentifiers: release.otherIdentifiers,
    companies,
    notes: release.notes,
    hasEvidence:
      runouts.length > 0 || companies.length > 0 || release.otherIdentifiers.length > 0,
  };
}
