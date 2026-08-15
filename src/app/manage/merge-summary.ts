import type { MergePlan } from '@/lib/db/queries/merge-artists';

/** Re-exported so tests can name the shape without importing the query layer. */
export type MergePlanLike = MergePlan;

/**
 * The merge confirmation's words (SPEC.md §4.3).
 *
 * **Names what is DESTROYED, not only what moves.** The delete confirmation set
 * the precedent: a user who is told only what they gain cannot weigh what they
 * lose. And merging is irreversible in a way "different artists" is not — that
 * is a recorded opinion which can be revisited, this deletes a row.
 *
 * Pure, so the sentences are testable without a database or a browser.
 */

/** The facts that separate two artists whose names do not. */
export type MergeSide = {
  id: string;
  name: string;
  recordCount: number;
  formedYear: number | null;
  originCountry: string | null;
  musicbrainzId: string | null;
};

export type MergeSummary = {
  /**
   * WHICH row survives, in decidable terms.
   *
   * "The duplicate will be deleted" is not a sentence a user can act on when
   * both rows are called Discharge — and they always are, because that is why
   * the pair is here. Named by record count first, then the other separating
   * facts.
   */
  keeping: string;
  /** What the survivor gains. Always present — the artist row itself goes. */
  moves: string;
  /** What is thrown away, or `null` when nothing is. */
  discards: string | null;
  warning: string;
};

/** "1 record" / "3 records" — a count that reads as English. */
function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function joinClauses(parts: string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];

  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** "11 records · formed 1977 · GB" — never the name, which both rows share. */
function describeSide(side: MergeSide): string {
  return [
    plural(side.recordCount, 'record'),
    side.formedYear === null ? null : `formed ${side.formedYear}`,
    side.originCountry,
  ]
    .filter((part): part is string => part !== null && part !== '')
    .join(' · ');
}

/**
 * `sides` is REQUIRED, not optional.
 *
 * It was optional briefly, and an omitted argument produced a confirmation with
 * no `keeping` sentence — silently losing the only line that says which row
 * survives, on the screen whose entire premise is that names cannot say. An
 * optional argument that changes what the copy MEANS is not a convenience.
 */
export function mergeSummary(
  plan: MergePlan,
  sides: { survivor: MergeSide; loser: MergeSide },
): MergeSummary {
  /**
   * Empty categories are omitted rather than rendered as "0 want-list entries".
   * Zeroes are noise, and they bury the line that matters.
   */
  const moved = joinClauses(
    [
      plan.moves.records > 0 ? plural(plan.moves.records, 'record') : null,
      plan.moves.wantList > 0 ? plural(plan.moves.wantList, 'want-list entry', 'want-list entries') : null,
      plan.moves.genres > 0 ? plural(plan.moves.genres, 'genre tag') : null,
      plan.moves.memberships > 0 ? plural(plan.moves.memberships, 'band membership') : null,
      plan.moves.influences > 0 ? plural(plan.moves.influences, 'influence link') : null,
    ].filter((part): part is string => part !== null),
  );

  /**
   * Says only what MOVES. `keeping` above already states which row is deleted,
   * and repeating it there produced "…will be deleted. The duplicate artist row
   * will be deleted." — two sentences saying one thing, which reads as though
   * two rows are going.
   */
  const moves = moved === '' ? 'Nothing else moves.' : `${moved} will move to the artist you keep.`;

  /**
   * Both discards say WHY. "3 genre tags will be discarded" alone reads as data
   * loss; "because the artist you are keeping already has them" is the fact
   * that makes it acceptable.
   */
  const discarded = joinClauses(
    [
      plan.discards.duplicateGenres > 0
        ? `${plural(plan.discards.duplicateGenres, 'genre tag')} the artist you are keeping already has`
        : null,
      plan.discards.duplicateMemberships > 0
        ? `${plural(plan.discards.duplicateMemberships, 'lineup entry', 'lineup entries')} the artist you are keeping already has`
        : null,
      plan.discards.duplicateInfluences > 0
        ? `${plural(plan.discards.duplicateInfluences, 'influence link')} the artist you are keeping already has`
        : null,
      plan.discards.selfEdges > 0
        ? `${plural(plan.discards.selfEdges, 'link')} between these two artists, which stop meaning anything once they are one`
        : null,
    ].filter((part): part is string => part !== null),
  );

  /**
   * The MusicBrainz id moving across is stated only when it actually moves.
   * A user keeping the row with the records, who knows the other held the id,
   * would reasonably fear losing it — and saying so when nothing moves would
   * be noise.
   */
  const gainsMbid =
    sides.survivor.musicbrainzId === null && sides.loser.musicbrainzId !== null;

  const keeping =
    `Keeping the artist with ${describeSide(sides.survivor)}. ` +
    `The one with ${describeSide(sides.loser)} will be deleted.` +
    (gainsMbid ? ' Its MusicBrainz id moves to the artist you keep.' : '');

  return {
    keeping,
    moves,
    /**
     * `null` rather than a reassuring sentence. A permanently visible "nothing
     * will be lost" trains the reader to skip the line, and then the merge that
     * DOES discard something reads exactly like the ones that do not.
     */
    discards: discarded === '' ? null : `Discarded: ${discarded}.`,
    warning: 'This cannot be undone.',
  };
}
