import 'server-only';
import { readCachedRelease, writeCachedRelease } from '@/lib/discogs/cache';
import { DiscogsError, getDiscogsClient } from '@/lib/discogs/client';
import { normalizeRelease, type NormalizedRelease } from '@/lib/discogs/normalize-release';
import { findArtistByDiscogsId, findArtistByName } from '@/lib/db/queries/artists';
import { findLabelByDiscogsId, findLabelByName } from '@/lib/db/queries/labels';
import type { FormValues } from './record-form';
import type { PressingFormValues } from './pressing-form';

/**
 * SPEC.md §10: `/records/new` is a "form prefilled from a lookup result".
 *
 * Stage two of §5.7's two-stage import, seen from the screen. The release is
 * fetched here and rendered into the form; nothing is written until the user
 * has checked it against the object in their hand and pressed save.
 *
 * **Reference rows are matched, never created.** A prefill is not a commitment
 * — the user may abandon the form — and creating an artist for a record that
 * never gets saved leaves debris nothing points at. When the artist or label is
 * unknown the select stays empty and the form's existing inline-create handles
 * it, which is the path §10 already specifies for manual entry.
 */

export type DiscogsPrefill = {
  values: Partial<FormValues>;
  pressing: PressingFormValues;
  release: NormalizedRelease;
  /**
   * Names Discogs gave for an artist or label we do not have yet, so the form
   * can say what it could not fill in rather than silently leaving a blank the
   * user has to notice.
   */
  unmatched: { artist: string | null; label: string | null };
};

/**
 * The release, from cache when fresh (§6).
 *
 * Reuses the cache the release endpoint fills, so opening a result and then
 * importing it costs one Discogs call rather than two — the drill-down invites
 * looking at several releases in a row, and 60/minute is the budget.
 */
async function loadRelease(discogsReleaseId: number): Promise<NormalizedRelease | null> {
  const cached = await readCachedRelease(discogsReleaseId);
  if (cached !== null) return normalizeRelease(cached.payload);

  try {
    const payload = await getDiscogsClient().get(`/releases/${discogsReleaseId}`);
    await writeCachedRelease(discogsReleaseId, payload);

    return normalizeRelease(payload);
  } catch (error) {
    // A failed lookup returns null rather than throwing: §10 says the form must
    // still work for manual entry, so an unreachable Discogs degrades to a
    // blank form with a notice rather than an error page.
    if (error instanceof DiscogsError) return null;
    throw error;
  }
}

/**
 * The album's year, from the MASTER, when the release does not carry one.
 *
 * FOUND IN REAL USE: release 12856557 (the US Carpenters LP, `SP-3502`) has
 * `year: 0` and no `released` field — Discogs records no year on that release
 * at all, and the 1971 a user sees on the site comes from the master.
 *
 * §4.2 makes the master the CORRECT source rather than merely an available
 * one: `release_year` is the album's original year, and a master is precisely
 * a description of an album across its pressings.
 *
 * Asked only when the release cannot answer. The release's own year is more
 * specific — a 1989 reissue of a 1971 album says 1989, and the master says
 * 1971 — so preferring the master would date every reissue to its original,
 * which is CLAUDE.md §8's collapse arriving through a date field. It also
 * costs a rate-limited call.
 */
async function masterYear(masterId: number | null): Promise<number | null> {
  if (masterId === null) return null;

  try {
    const master = await getDiscogsClient().get<{ year?: number }>(`/masters/${masterId}`);
    const year = master.year;

    return typeof year === 'number' && year > 0 ? year : null;
  } catch {
    // A failed master must not cost the user the whole prefill: the release is
    // already in hand and the master is an enhancement. Same shape as the
    // versions endpoint degrading to tier 1.
    return null;
  }
}

export async function loadDiscogsPrefill(
  discogsReleaseId: number,
): Promise<DiscogsPrefill | null> {
  const release = await loadRelease(discogsReleaseId);
  if (release === null) return null;

  const year = release.year ?? (await masterYear(release.masterId));

  /**
   * By Discogs id first, then by name — the same order §6 gives the importer,
   * and for the same reason: two bands share the name "Discharge", and one
   * band's name may have been edited by the user.
   */
  const artist =
    release.artistDiscogsId === null
      ? undefined
      : await findArtistByDiscogsId(release.artistDiscogsId);
  const artistByName =
    artist ?? (release.artist === null ? undefined : await findArtistByName(release.artist));

  const label =
    release.labelDiscogsId === null
      ? undefined
      : await findLabelByDiscogsId(release.labelDiscogsId);
  const labelByName =
    label ?? (release.label === null ? undefined : await findLabelByName(release.label));

  /**
   * §5.7 types `matrixRunout` as an array — a release carries one per side and
   * variant, eight on the captured fixture. Joined rather than truncated: every
   * variant is identifying information, and keeping only the first would
   * discard the side the user is looking at.
   */
  const matrixRunout = release.matrixRunout.length === 0 ? '' : release.matrixRunout.join(' / ');

  return {
    values: {
      title: release.title ?? '',
      artistId: artistByName?.id ?? '',
      labelId: labelByName?.id ?? '',
      // §4.2: the ALBUM's year. The pressing's own year goes in the pressing
      // section below, and conflating them is CLAUDE.md §8's central error.
      releaseYear: year === null ? '' : String(year),
    },
    pressing: {
      catalogNumber: release.catalogNumber ?? '',
      matrixRunout,
      countryPressed: release.country ?? '',
      yearPressed: year === null ? '' : String(year),
      pressingPlant: release.pressingPlant ?? '',
      vinylWeightGrams:
        release.vinylWeightGrams === null ? '' : String(release.vinylWeightGrams),
      colorVariant: release.colorVariant ?? '',
      isReissue: release.isReissue,
    },
    release,
    unmatched: {
      artist: artistByName === undefined ? release.artist : null,
      label: labelByName === undefined ? release.label : null,
    },
  };
}
