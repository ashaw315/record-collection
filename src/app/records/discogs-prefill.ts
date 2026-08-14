import 'server-only';
import { readCachedRelease, writeCachedRelease } from '@/lib/discogs/cache';
import { DiscogsError, getDiscogsClient } from '@/lib/discogs/client';
import { normalizeRelease, type NormalizedRelease } from '@/lib/discogs/normalize-release';
import { findArtistByDiscogsId, findArtistsNamed } from '@/lib/db/queries/artists';
import { findLabelByDiscogsId, findLabelByName } from '@/lib/db/queries/labels';
import { findOrCreateGenresByName } from '@/lib/db/queries/genres';
import { findFormatByName } from '@/lib/db/queries/formats';
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
  unmatched: { artist: string | null; label: string | null; format: string | null };
  /**
   * §4.1: names repeat. A count rather than a boolean, so the form can say
   * "you have 2 artists named Discharge" rather than pointing at one as though
   * it were the one.
   */
  ambiguous: { artist: number | null; artistName: string | null };
  /**
   * Every Matrix / Runout value Discogs holds, joined for display BESIDE the
   * field — never in it. See the note where this is built.
   */
  matrixReference: string | null;
  /**
   * Discogs' own notes, shown BESIDE the notes field (§5.7).
   *
   * They describe the RELEASE — sleeve text, gatefold, publishing, copyright —
   * which is true of every copy ever pressed. `records.notes` is the user's
   * note about THEIR copy, so this is reference, never a value. §6's field
   * mapping does not import `notes` at all.
   */
  notesReference: string | null;
};

/**
 * The format, matched from Discogs' DESCRIPTIONS rather than its `name`.
 *
 * §6's field mapping says `formats[0].name`→`formats.name`, and the real
 * payloads say otherwise: `name` is the MEDIUM ("Vinyl", "CD") while the
 * descriptions carry what §4.1 seeds — "LP", "7\"", "Album". Matching on
 * `name` never matches any of the seven seeded formats, which is why every
 * imported record had no format at all.
 *
 * FOUND IN REAL USE. The spec's mapping was written against a field that does
 * not hold that value, and no test caught it because nothing asserted the
 * format was populated end to end.
 */
async function matchFormat(
  release: NormalizedRelease,
): Promise<{ id: string | undefined; attempted: string | null }> {
  /**
   * Most specific first. `formats` on the normalized release is the medium
   * followed by the descriptors, and the seeded set contains physical formats
   * — so "7\"" should win over "Single", and "LP" over "Album".
   */
  for (const descriptor of release.formats) {
    const match = await findFormatByName(descriptor.trim());
    if (match !== undefined) return { id: match.id, attempted: null };
  }

  // Nothing matched: report the medium, which is the most recognisable thing
  // to tell the user we could not place.
  return { id: undefined, attempted: release.formats[0] ?? null };
}

/**
 * The release, from cache when fresh (§6).
 *
 * Reuses the cache the release endpoint fills, so opening a result and then
 * importing it costs one Discogs call rather than two — the drill-down invites
 * looking at several releases in a row, and 60/minute is the budget.
 */
/**
 * Exported so the cover path (`POST /api/records`) reads a release the same
 * way. A second copy of "cache first, then Discogs, null on failure" is how the
 * two would drift — the `create-schema` precedent, where two definitions agreed
 * field for field and survived a whole step because nothing failed while they
 * agreed.
 */
export async function loadRelease(discogsReleaseId: number): Promise<NormalizedRelease | null> {
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

  /**
   * TWO DIFFERENT YEARS, and conflating them is CLAUDE.md §8's central error.
   *
   * `release.year` describes THIS pressing, so it answers both questions. The
   * master describes the ALBUM across every pressing, so it answers only the
   * first — a 1989 reissue of a 1971 album was pressed in 1989, and the master
   * says 1971.
   *
   * The `masterYear` comment below makes exactly this argument and I applied it
   * to `releaseYear` alone, leaving the line beside it to fabricate a pressing
   * year. Found by the security review, and the compounding is the bad part:
   * `yearPressed` is one of `IDENTIFYING_FIELDS`, so a user correcting the
   * fabricated value contradicted an identifying field and silently lost tier 1
   * — punished for fixing our error.
   */
  const albumYear = release.year ?? (await masterYear(release.masterId));
  const pressingYear = release.year;

  /**
   * By Discogs id first, then by name — the same order §6 gives the importer,
   * and for the same reason: two bands share the name "Discharge", and one
   * band's name may have been edited by the user.
   */
  const artist =
    release.artistDiscogsId === null
      ? undefined
      : await findArtistByDiscogsId(release.artistDiscogsId);
  /**
   * §4.1: a name identifies nothing, so N artists may carry it.
   *
   * **With more than one, prefill NOTHING and say why.** Guessing between two
   * bands called Discharge is §8's hazard on the one screen where the user is
   * holding the record and can settle it themselves. Silence would be worse
   * than a guess only if it were unexplained — hence `ambiguous` below, which
   * is a different fact from `unmatched`: "you have two artists with this name"
   * is not "Discogs named an artist you do not have".
   */
  const namedArtists =
    artist !== undefined || release.artist === null ? [] : await findArtistsNamed(release.artist);

  const artistByName = artist ?? (namedArtists.length === 1 ? namedArtists[0] : undefined);
  const ambiguousArtist = namedArtists.length > 1 ? namedArtists.length : null;

  const label =
    release.labelDiscogsId === null
      ? undefined
      : await findLabelByDiscogsId(release.labelDiscogsId);
  const labelByName =
    label ?? (release.label === null ? undefined : await findLabelByName(release.label));

  const format = await matchFormat(release);

  /**
   * §5.7 types `matrixRunout` as an array — a release carries one per side and
   * variant, EIGHT on the captured fixture, spanning four documented pressings.
   *
   * **Shown as reference, never prefilled into the field.** §5.7: the matrix is
   * "frequently missing or partial — always let the user hand-enter it from the
   * dead wax". Joining four pressings' runouts into one field produces a
   * fingerprint describing no physical object, in the field §4 calls "the true
   * pressing fingerprint"; and a filled field reads as verified, which inverts
   * the instruction. Every variant is still worth SEEING while reading the wax,
   * so none are dropped — they move beside the field instead of into it.
   */
  const matrixReference = release.matrixRunout.length === 0 ? null : release.matrixRunout.join(' / ');

  return {
    values: {
      title: release.title ?? '',
      artistId: artistByName?.id ?? '',
      labelId: labelByName?.id ?? '',
      formatId: format.id ?? '',
      // §4.2: the ALBUM's year. The pressing's own year goes in the pressing
      // section below, and conflating them is CLAUDE.md §8's central error.
      releaseYear: albumYear === null ? '' : String(albumYear),
      /**
       * §6: "genres + styles→genres (find-or-create; prefer styles since it's
       * more specific)" — applied at PREFILL, not only on save.
       *
       * The import transaction already derived these, so chips appeared after
       * saving. But the form showed nothing: its checkbox group renders one box
       * per EXISTING genre, so an unmatched genre is unselectable, and §5.7's
       * "the user verifies and corrects" cannot happen for a field they cannot
       * see. A record filed under Rock and Blues when the user would have
       * chosen otherwise is CLAUDE.md §8 arriving by omission.
       *
       * Styles first, matching the import's order.
       */
      genreIds: await findOrCreateGenresByName([...release.styles, ...release.genres]),
    },
    pressing: {
      // Carried so §7.7 can reach tier 1. Whether it is SENT on save is
      // decided by `discogsIdToSubmit` — §10's "a corrected pressing is a
      // different pressing".
      discogsReleaseId: release.discogsId,
      catalogNumber: release.catalogNumber ?? '',
      matrixRunout: '',
      countryPressed: release.country ?? '',
      // Empty rather than fabricated: an empty field asks the user to read
      // the year off the record, a wrong one tells them it is already known.
      yearPressed: pressingYear === null ? '' : String(pressingYear),
      pressingPlant: release.pressingPlant ?? '',
      vinylWeightGrams:
        release.vinylWeightGrams === null ? '' : String(release.vinylWeightGrams),
      colorVariant: release.colorVariant ?? '',
      isReissue: release.isReissue,
    },
    release,
    unmatched: {
      // Not reported as unmatched when the name is AMBIGUOUS: the artist is not
      // missing, there are several, and the form says so separately.
      artist: artistByName === undefined && ambiguousArtist === null ? release.artist : null,
      label: labelByName === undefined ? release.label : null,
      format: format.attempted,
    },
    ambiguous: {
      /** How many local artists share the name, when more than one do. */
      artist: ambiguousArtist,
      artistName: ambiguousArtist === null ? null : release.artist,
    },
    matrixReference,
    notesReference: release.notes,
  };
}
