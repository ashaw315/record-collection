import type { MergePlan } from '@/lib/db/queries/merge-artists';

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

export type MergeSummary = {
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

export function mergeSummary(plan: MergePlan): MergeSummary {
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

  const moves =
    moved === ''
      ? 'The duplicate artist row will be deleted. Nothing else moves.'
      : `${moved} will move to the artist you keep, and the duplicate artist row will be deleted.`;

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
      plan.discards.selfEdges > 0
        ? `${plural(plan.discards.selfEdges, 'link')} between these two artists, which stop meaning anything once they are one`
        : null,
    ].filter((part): part is string => part !== null),
  );

  return {
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
