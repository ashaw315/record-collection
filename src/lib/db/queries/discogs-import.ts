import 'server-only';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  artists,
  genres,
  labels,
  pressings,
  recordGenres,
  recordTags,
  records,
  wantList,
  wantListGenres,
} from '@/db/schema';
import { contradictsDiscogs } from '@/app/records/pressing-identity';
import type { NormalizedRelease } from '@/lib/discogs/normalize-release';

/**
 * SPEC.md §5.7 `POST /api/discogs/import` — the transactional write.
 *
 * An import creates up to five rows across four tables. §5.7 says
 * "Transactional", and a half-applied one is worse than a rejected one: it
 * leaves reference rows with nothing pointing at them, which nobody notices
 * until the artist list has names that belong to no record.
 *
 * **§7.8 shapes everything here: never overwrite user-entered data with
 * external data.** Every find-or-create in this file FINDS and returns; none
 * of them updates. A re-import is therefore idempotent by construction rather
 * than by a check somebody has to remember — which matters most for
 * `matrix_runout`, read off the dead wax by someone holding the record and
 * called user-authoritative by CLAUDE.md §8. Discogs' own value is
 * contributor-submitted and frequently absent; overwriting would replace the
 * best identification in the database with a guess.
 */

type Tx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

/**
 * The fields a user may correct before saving (§5.7's `overrides`).
 *
 * Absent means "no opinion", never "clear it" — the `.default()` trap from
 * NOTES in override form. Only keys actually present take precedence.
 */
export type ImportOverrides = {
  title?: string;
  releaseYear?: number | null;
  conditionMedia?: string | null;
  conditionSleeve?: string | null;
  purchasePrice?: string | null;
  purchaseDate?: string | null;
  notes?: string | null;
  matrixRunout?: string | null;
  catalogNumber?: string | null;
  countryPressed?: string | null;
  yearPressed?: number | null;
  pressingPlant?: string | null;
  /**
   * Reference selections the FORM owns and Discogs has no opinion about.
   *
   * Added when the form was pointed at this endpoint (§5.7's stage two). Without
   * them the user picks a format, a store, or a genre, the endpoint returns 201,
   * and the choice is silently discarded — the tagIds defect from step 6
   * exactly: validated, dropped, and reported as success.
   */
  formatId?: string | null;
  storeId?: string | null;
  labelId?: string | null;
  /**
   * When present these REPLACE the genres derived from Discogs, per §5.7's
   * "overrides take precedence for every field they cover". The user has seen
   * both and chosen; silently unioning would make a removal impossible.
   */
  genreIds?: string[];
  tagIds?: string[];
};

export type ImportInput = {
  release: NormalizedRelease;
  target: 'record' | 'want_list';
  overrides?: ImportOverrides;
};

/** `undefined` means the caller expressed no opinion; `null` means clear it. */
function pick<T>(override: T | undefined, fromDiscogs: T): T {
  return override === undefined ? fromDiscogs : override;
}

/**
 * Find-or-create by Discogs id first, then by name (§6).
 *
 * The order matters and is not interchangeable. Two bands genuinely share the
 * name "Discharge"; one band's name may have been edited by the user. Matching
 * on the id when we have one is the only way to be right about either — and
 * when a row is found, its NAME IS LEFT ALONE (§7.8), so a user's "Discharge
 * (UK)" survives an import that thinks it is called "Discharge".
 */
async function findOrCreateArtist(
  tx: Tx,
  name: string,
  discogsArtistId: number | null,
): Promise<string> {
  if (discogsArtistId !== null) {
    const [byId] = await tx
      .select({ id: artists.id })
      .from(artists)
      .where(eq(artists.discogsArtistId, discogsArtistId))
      .limit(1);
    if (byId !== undefined) return byId.id;
  }

  const [byName] = await tx
    .select({ id: artists.id })
    .from(artists)
    .where(sql`lower(${artists.name}) = lower(${name})`)
    .limit(1);
  if (byName !== undefined) return byName.id;

  const [created] = await tx
    .insert(artists)
    .values({ name, discogsArtistId })
    .returning({ id: artists.id });
  return created.id;
}

async function findOrCreateLabel(
  tx: Tx,
  name: string,
  discogsLabelId: number | null,
): Promise<string> {
  if (discogsLabelId !== null) {
    const [byId] = await tx
      .select({ id: labels.id })
      .from(labels)
      .where(eq(labels.discogsLabelId, discogsLabelId))
      .limit(1);
    if (byId !== undefined) return byId.id;
  }

  const [byName] = await tx
    .select({ id: labels.id })
    .from(labels)
    .where(sql`lower(${labels.name}) = lower(${name})`)
    .limit(1);
  if (byName !== undefined) return byName.id;

  const [created] = await tx
    .insert(labels)
    .values({ name, discogsLabelId })
    .returning({ id: labels.id });
  return created.id;
}

/**
 * §4: pressings are SHARED and found-or-created. Two records of the same
 * pressing point at one row, so importing the same release twice must not
 * produce two pressings — and must not touch the one it finds.
 */
async function findOrCreatePressing(
  tx: Tx,
  values: typeof pressings.$inferInsert,
): Promise<string | null> {
  const identifying = [
    values.discogsReleaseId,
    values.catalogNumber,
    values.matrixRunout,
    values.countryPressed,
    values.yearPressed,
  ];
  // §10's rule, not §4's match key: if the release says nothing about the
  // pressing, no pressing row is created rather than an empty one.
  if (identifying.every((value) => value === null || value === undefined)) return null;

  if (values.discogsReleaseId != null) {
    const [byId] = await tx
      .select({ id: pressings.id })
      .from(pressings)
      .where(eq(pressings.discogsReleaseId, values.discogsReleaseId))
      .limit(1);
    // FOUND, NOT UPDATED. This is where §7.8 is enforced for matrix_runout: a
    // second import of the same release returns the existing row untouched,
    // whatever the user has since corrected on it.
    if (byId !== undefined) return byId.id;
  }

  const [byTuple] = await tx
    .select({ id: pressings.id })
    .from(pressings)
    .where(
      and(
        sql`${pressings.catalogNumber} IS NOT DISTINCT FROM ${values.catalogNumber ?? null}`,
        sql`${pressings.countryPressed} IS NOT DISTINCT FROM ${values.countryPressed ?? null}`,
        sql`${pressings.yearPressed} IS NOT DISTINCT FROM ${values.yearPressed ?? null}`,
        isNull(pressings.discogsReleaseId),
      ),
    )
    .limit(1);
  if (byTuple !== undefined) return byTuple.id;

  const [created] = await tx.insert(pressings).values(values).returning({ id: pressings.id });
  return created.id;
}

/**
 * §6: "genres + styles→genres (find-or-create; prefer styles since it's more
 * specific)."
 *
 * BOTH are imported, styles first. CLAUDE.md §8 forbids flattening the
 * hierarchy, and dropping the broad genre would lose the parent that §7.1's
 * tree hangs from — while dropping styles would file a UK82 hardcore record
 * under "Rock".
 */
async function findOrCreateGenres(tx: Tx, names: string[]): Promise<string[]> {
  const ids: string[] = [];

  for (const name of names) {
    const [existing] = await tx
      .select({ id: genres.id })
      .from(genres)
      .where(sql`lower(${genres.name}) = lower(${name})`)
      .limit(1);

    if (existing !== undefined) {
      ids.push(existing.id);
      continue;
    }

    const [created] = await tx.insert(genres).values({ name }).returning({ id: genres.id });
    ids.push(created.id);
  }

  return ids;
}

/**
 * Overloaded on `target` so the caller gets the row it asked for rather than a
 * union it has to narrow. A bare union would make every consumer write a cast,
 * and the cast is where a want-list row gets read as a record.
 */
export async function importRelease(
  input: ImportInput & { target: 'record' },
): Promise<typeof records.$inferSelect>;
export async function importRelease(
  input: ImportInput & { target: 'want_list' },
): Promise<typeof wantList.$inferSelect>;
export async function importRelease(
  input: ImportInput,
): Promise<typeof records.$inferSelect | typeof wantList.$inferSelect>;
export async function importRelease(
  input: ImportInput,
): Promise<typeof records.$inferSelect | typeof wantList.$inferSelect> {
  const { release, target } = input;
  const overrides = input.overrides ?? {};

  const db = getDb();

  return db.transaction(async (tx) => {
    const artistName = release.artist ?? 'Unknown Artist';
    const artistId = await findOrCreateArtist(tx, artistName, release.artistDiscogsId);

    const labelId =
      release.label === null
        ? null
        : await findOrCreateLabel(tx, release.label, release.labelDiscogsId);

    /**
     * §5.7 types `matrixRunout` as an array because a release carries one per
     * side and variant; the column is a single field. Joined rather than
     * truncated — every variant is identifying information, and keeping only
     * the first would discard the side the user is looking at.
     */
    const discogsMatrix = release.matrixRunout.length === 0 ? null : release.matrixRunout.join(' / ');

    /**
     * §10 / §7.6: **a corrected pressing is a different pressing.**
     *
     * The id was sent unconditionally here, even when the user's overrides
     * contradicted an identifying field — while the form path applied
     * `discogsIdToSubmit` for exactly this case. `discogs_release_id` is unique
     * (§4.2) and pressings are SHARED (§4), so keeping it on a corrected
     * pressing either finds the existing shared row and discards the
     * correction, or writes that correction onto every record matching the
     * release. The second is worse and silent.
     *
     * The rule is imported rather than restated — two copies of one spec
     * sentence is how they drift, and these two already had.
     */
    const asText = (value: string | number | null | undefined): string =>
      value === null || value === undefined ? '' : String(value);

    const corrected = contradictsDiscogs([
      [asText(release.catalogNumber), asText(pick(overrides.catalogNumber, release.catalogNumber))],
      [asText(release.country), asText(pick(overrides.countryPressed, release.country))],
      [asText(release.year), asText(pick(overrides.yearPressed, release.year))],
    ]);

    const pressingId = await findOrCreatePressing(tx, {
      discogsReleaseId: corrected ? null : release.discogsId,
      catalogNumber: pick(overrides.catalogNumber, release.catalogNumber),
      countryPressed: pick(overrides.countryPressed, release.country),
      yearPressed: pick(overrides.yearPressed, release.year),
      matrixRunout: pick(overrides.matrixRunout, discogsMatrix),
      pressingPlant: pick(overrides.pressingPlant, release.pressingPlant),
      vinylWeightGrams: release.vinylWeightGrams,
      colorVariant: release.colorVariant,
      isReissue: release.isReissue,
    });

    /**
     * Styles first: §6 prefers them, and the order is what a UI showing the
     * first badge would surface.
     *
     * An explicit `genreIds` override REPLACES this rather than adding to it —
     * the user saw the Discogs genres on the form and edited them, so a union
     * would make removing one impossible.
     */
    const genreIds =
      overrides.genreIds !== undefined
        ? overrides.genreIds
        : await findOrCreateGenres(tx, [...release.styles, ...release.genres]);

    if (target === 'want_list') {
      const [item] = await tx
        .insert(wantList)
        .values({
          artistId,
          labelId,
          title: pick(overrides.title, release.title) ?? '',
          // §7.2: the target pressing IS the best dig. Importing a specific
          // release rather than the master is a statement about which pressing
          // is wanted, and losing it discards the reason.
          targetPressingId: pressingId,
          bestDigNotes: overrides.notes ?? null,
        })
        .returning();

      if (genreIds.length > 0) {
        await tx
          .insert(wantListGenres)
          .values(genreIds.map((genreId) => ({ wantListId: item.id, genreId })));
      }

      return item;
    }

    const [record] = await tx
      .insert(records)
      .values({
        artistId,
        labelId: overrides.labelId !== undefined ? overrides.labelId : labelId,
        pressingId,
        formatId: overrides.formatId ?? null,
        storeId: overrides.storeId ?? null,
        title: pick(overrides.title, release.title) ?? '',
        // §4.2: the ALBUM's year, not the pressing's. They coincide on a first
        // pressing, which is exactly why they must not be conflated.
        releaseYear: pick(overrides.releaseYear, release.year),
        conditionMedia: (overrides.conditionMedia ?? null) as typeof records.$inferInsert.conditionMedia,
        conditionSleeve: (overrides.conditionSleeve ?? null) as typeof records.$inferInsert.conditionSleeve,
        purchasePrice: overrides.purchasePrice ?? null,
        purchaseDate: overrides.purchaseDate ?? null,
        notes: overrides.notes ?? null,
      })
      .returning();

    if (genreIds.length > 0) {
      await tx.insert(recordGenres).values(genreIds.map((genreId) => ({ recordId: record.id, genreId })));
    }

    // Tags are the user's own vocabulary — Discogs has no equivalent, so these
    // only ever arrive as an override.
    const tagIds = overrides.tagIds ?? [];
    if (tagIds.length > 0) {
      await tx.insert(recordTags).values(tagIds.map((tagId) => ({ recordId: record.id, tagId })));
    }

    return record;
  });
}
