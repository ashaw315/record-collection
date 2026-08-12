import type { NormalizedVersion } from '@/lib/discogs/normalize-versions';

/**
 * Versions that render as the same row, collapsed into one (SPEC.md §5.7).
 *
 * §5.7 calls the version table "the step where the user identifies THEIR
 * pressing". For some masters it cannot: Hot Tuna's master 133514 has FIVE US
 * 1970 versions identical on every field the versions endpoint returns —
 * `LSP-4353 | US | 1970 | LP, Album, Stereo | RCA Victor`.
 *
 * **No column fixes it.** Measured against the live API: `format.text`, which
 * carries "Rockaway Pressing" and would have separated the two releases that
 * misled a user here, exists on the RELEASE endpoint and not on versions. Its
 * keys are id, label, country, title, major_formats, format, catno, released,
 * status, resource_url, thumb, stats. Fetching each release to get the pressing
 * plant would cost one rate-limited call per row.
 *
 * So the honest rendering is to say so. Five identical rows look like an
 * answer — a user picked one, believed they had another, and reported the
 * pressing plant as wrong when it was correct for the release they had.
 */

export type VersionGroup = {
  /** Most-owned first; see `groupIdenticalVersions`. */
  versions: NormalizedVersion[];
};

/**
 * Whether a group must stay expanded regardless of the user's toggle.
 *
 * A version the user OWNS carries a §7.7 badge, and hiding it inside a
 * collapsed group would turn "you already have this" into silence — the
 * absence-as-success failure this build keeps meeting, in the place it costs
 * most: someone in a shop reads no badge as "buy it".
 */
export function mustStayExpanded(
  group: VersionGroup,
  owns: (version: NormalizedVersion) => boolean,
): boolean {
  return group.versions.length > 1 && group.versions.some(owns);
}

/**
 * Everything the table DISPLAYS, joined.
 *
 * Deliberately excludes `discogsId` and the community counts: those differ
 * between the twins, and including them would defeat the grouping. It includes
 * `isReissue` because §5.7 shows that as a badge, so two rows differing only by
 * it are genuinely distinguishable on screen.
 */
export function comparisonKey(version: NormalizedVersion): string {
  return JSON.stringify([
    version.year,
    version.country,
    version.catalogNumber,
    version.label,
    version.formats,
    version.isReissue,
  ]);
}

/** Nulls last: a missing count is not "nobody owns it". */
function byOwnersDescending(a: NormalizedVersion, b: NormalizedVersion): number {
  const left = a.communityHave ?? -1;
  const right = b.communityHave ?? -1;
  return right - left;
}

export function groupIdenticalVersions(versions: NormalizedVersion[]): VersionGroup[] {
  const groups = new Map<string, NormalizedVersion[]>();

  // Insertion-ordered: Discogs orders versions meaningfully, and regrouping
  // must not reshuffle rows the user can already tell apart.
  for (const version of versions) {
    const key = comparisonKey(version);
    const existing = groups.get(key);

    if (existing === undefined) {
      groups.set(key, [version]);
      continue;
    }
    existing.push(version);
  }

  return [...groups.values()].map((members) => ({
    /**
     * Most-owned first. This is the only signal available to tell the collapsed
     * rows apart and it is a real one — the pressing 3,936 people own is more
     * likely to be the common one than the pressing 47 people own.
     *
     * It does NOT identify which pressing is in the user's hands, and the UI
     * must not imply that it does.
     */
    versions: [...members].sort(byOwnersDescending),
  }));
}
