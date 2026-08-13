'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { comparisonKey, groupIdenticalVersions, mustStayExpanded } from './identical-versions';
import { OwnershipBadge } from './OwnershipBadge';
import { COMPARISON_COLUMNS, comparisonCells, isOnTheShelf } from './version-row';
import type { OwnershipPayload } from '@/lib/discogs/ownership-payload';
import type { NormalizedVersion } from '@/lib/discogs/normalize-versions';

/**
 * §5.7's version-comparison table — "the step where the user identifies THEIR
 * pressing rather than just the album".
 *
 * The reading situation is a phone at 390px in a shop, and the user is scanning
 * DOWN a column to see how eleven versions differ. Two consequences shape this
 * component:
 *
 *   - owned rows must be unmistakable WITHOUT reading them, so they carry a
 *     struck-through title, muted text and a marker column — three signals, not
 *     one, because colour alone fails in sunlight and for colour-blind readers;
 *   - the comparison columns stay side by side rather than stacking, because
 *     stacked rows cannot be compared. The table scrolls horizontally instead,
 *     with year and country — the fields that discriminate most — pinned left.
 */

export type VersionWithOwnership = NormalizedVersion & { ownership: OwnershipPayload };

export function VersionTable({
  versions,
  ownershipChecked = true,
}: {
  versions: VersionWithOwnership[];
  /**
   * False when §7.7's check could not run — the master lookup failed, so no
   * row can carry a badge.
   *
   * Rendered rather than swallowed: a table with no badges looks exactly like a
   * table where you own nothing, and someone in a shop reads that as "buy it".
   */
  ownershipChecked?: boolean;
}) {
  /**
   * BEFORE the early return: hooks must run in the same order on every render,
   * and this sat after the empty-versions guard — so a card that first rendered
   * with no versions and then received some would call a different number of
   * hooks. Caught by `react-hooks/rules-of-hooks`, not by any test: the two
   * orderings only diverge when the props change mid-life, which no fixture in
   * this suite does.
   */
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  if (versions.length === 0) {
    return (
      <p className="px-3 py-4 text-sm text-muted-foreground">
        Discogs lists no other versions of this release.
      </p>
    );
  }

  const ownedCount = versions.filter((version) => isOnTheShelf(version.ownership)).length;

  /**
   * §5.7 calls this "the step where the user identifies THEIR pressing", and
   * for some masters the columns cannot: Hot Tuna's 133514 has FIVE US 1970
   * versions identical on every field the versions endpoint returns. Rendering
   * five identical rows LOOKS LIKE AN ANSWER — a user picked one, believed they
   * had another, and reported its pressing plant as wrong when it was right for
   * the release they actually had.
   *
   * Collapsed to one row that says so, expandable. A group containing something
   * the user OWNS never collapses: §7.7's badge outranks the tidier table.
   */
  const groups = groupIdenticalVersions(versions);
  const rows = groups.flatMap((group) => {
    const forced = mustStayExpanded(group, (version) =>
      isOnTheShelf((version as VersionWithOwnership).ownership),
    );

    return expanded.has(comparisonKey(group.versions[0])) || forced
      ? group.versions
      : [group.versions[0]];
  }) as VersionWithOwnership[];

  /** How many versions the row at this id stands for, when it stands for more. */
  const standsFor = new Map<number, number>();
  for (const group of groups) {
    const forced = mustStayExpanded(group, (version) =>
      isOnTheShelf((version as VersionWithOwnership).ownership),
    );
    if (group.versions.length > 1 && !expanded.has(comparisonKey(group.versions[0])) && !forced) {
      standsFor.set(group.versions[0].discogsId, group.versions.length);
    }
  }

  function toggle(key: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="border-t border-border">
      {/*
        The count first, because it is the answer to "have I got this already?"
        before any row is read — and on a phone it is what fits above the fold.
      */}
      <p className="px-3 py-2 text-xs text-muted-foreground">
        {versions.length} version{versions.length === 1 ? '' : 's'}
        {ownershipChecked && ownedCount > 0 && (
          <span className="font-medium text-foreground"> · {ownedCount} already on your shelf</span>
        )}
      </p>

      {/*
        Said plainly, in the place the answer would have been. The alternative
        is an absence that reads as "you own none of these" — and the cost of
        that misreading is buying a record you already have.
      */}
      {!ownershipChecked && (
        <p
          data-testid="ownership-unchecked"
          role="status"
          className="mx-3 mb-2 rounded-xs border border-primary px-2 py-1.5 text-xs font-medium"
        >
          Could not check what you already own — this list does not show your collection. Search
          again in a moment.
        </p>
      )}

      {/*
        Horizontal scroll rather than stacking. A stacked card per version reads
        fine and cannot be COMPARED, which is the only thing this table is for.
      */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-xs">
          <thead>
            <tr className="border-y border-border text-left text-muted-foreground">
              <th scope="col" className="w-6 px-2 py-1.5" aria-label="Owned" />
              {COMPARISON_COLUMNS.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    'px-2 py-1.5 font-normal whitespace-nowrap',
                    // Dropped first when the viewport cannot hold everything.
                    column.optionalOnNarrow && 'hidden sm:table-cell',
                  )}
                >
                  {column.heading}
                </th>
              ))}
              <th scope="col" className="px-2 py-1.5 font-normal">
                <span className="sr-only">Ownership</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((version) => {
              const onShelf = isOnTheShelf(version.ownership);
              const cells = comparisonCells(version);

              return (
                <tr
                  key={version.discogsId}
                  data-testid="version-row"
                  data-discogs-id={version.discogsId}
                  data-owned={onShelf ? 'true' : 'false'}
                  className={cn(
                    'border-b border-border last:border-0',
                    // Muted, not hidden: an owned pressing is still evidence
                    // about which versions exist, and §7.7 never hides a row.
                    onShelf && 'text-muted-foreground',
                  )}
                >
                  <td className="px-2 py-2 text-center">
                    {onShelf && (
                      // A glyph as well as the colour — three signals for the
                      // same fact, since colour alone fails in sunlight.
                      <span aria-label="On your shelf" title="On your shelf">
                        ●
                      </span>
                    )}
                  </td>

                  {COMPARISON_COLUMNS.map((column) => (
                    <td
                      key={column.key}
                      data-column={column.key}
                      className={cn(
                        'px-2 py-2 whitespace-nowrap',
                        column.key === 'catalogNumber' && 'font-mono',
                        onShelf && 'line-through decoration-1',
                        column.optionalOnNarrow && 'hidden sm:table-cell',
                      )}
                    >
                      {cells[column.key]}
                    </td>
                  ))}

                  <td className="px-2 py-2">
                    <OwnershipBadge ownership={version.ownership} />
                    {/*
                      Said plainly, on the row it applies to. "3 more look
                      identical from here" is the honest description: Discogs
                      distinguishes them, this table's columns cannot, and
                      pretending otherwise is what misled a user into believing
                      they had a different pressing.
                    */}
                    {standsFor.has(version.discogsId) && (
                      <button
                        type="button"
                        data-testid="identical-toggle"
                        onClick={() => toggle(comparisonKey(version))}
                        className="mt-1 block text-left text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      >
                        {(standsFor.get(version.discogsId) ?? 1) - 1} more look identical from here
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
