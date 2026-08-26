import { z } from 'zod';
import {
  FIELD_LIMITS,
  bounded,
  inferReissue,
  meaningful,
  safeImageUrl,
  toDescriptors,
  toYear,
} from './fields';

/**
 * Discogs release detail → SPEC.md §5.7's normalized release shape.
 *
 * This is the payload that PREFILLS THE FORM, which makes it the highest-stakes
 * normalizer in the project: whatever it gets wrong, the user is invited to
 * save into their collection. §5.7 is explicit that import is two-stage for
 * exactly this reason — the user verifies against the physical record before
 * anything is written — but a field that arrives confidently wrong is far more
 * likely to be accepted than one that arrives blank.
 *
 * Shaped differently again from search results and master versions:
 *   - `title` is the TITLE ALONE, with the artist in `artists[0].name`, where
 *     search sends them combined;
 *   - `genres`/`styles` are plural here, singular in search;
 *   - the weight lives in a top-level `estimated_weight`.
 */

const rawRelease = z
  .object({
    id: z.number(),
    title: z.string().optional(),
    year: z.union([z.string(), z.number()]).optional(),
    released: z.string().optional(),
    country: z.string().optional(),
    notes: z.string().optional(),
    master_id: z.number().nullable().optional(),
    estimated_weight: z.number().nullable().optional(),
    num_for_sale: z.number().nullable().optional(),
    lowest_price: z.number().nullable().optional(),
    artists: z
      .array(z.object({ name: z.string(), id: z.number().optional() }).passthrough())
      .optional(),
    labels: z
      .array(
        z
          .object({
            name: z.string().optional(),
            catno: z.string().optional(),
            id: z.number().optional(),
          })
          .passthrough(),
      )
      .optional(),
    formats: z
      .array(
        z
          .object({
            name: z.string().optional(),
            descriptions: z.array(z.string()).optional(),
            text: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
    companies: z
      .array(
        z
          .object({ name: z.string().optional(), entity_type_name: z.string().optional() })
          .passthrough(),
      )
      .optional(),
    identifiers: z
      .array(
        z
          .object({
            type: z.string().optional(),
            value: z.string().optional(),
            description: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
    images: z
      .array(z.object({ type: z.string().optional(), uri: z.string().optional() }).passthrough())
      .optional(),
    tracklist: z
      .array(
        z
          .object({
            position: z.string().optional(),
            title: z.string().optional(),
            duration: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
    genres: z.array(z.string()).optional(),
    styles: z.array(z.string()).optional(),
  })
  .passthrough();

export type NormalizedRelease = {
  discogsId: number;
  masterId: number | null;
  title: string | null;
  artist: string | null;
  /**
   * Discogs' own ids for the artist and label, carried so the importer can
   * find-or-create by id BEFORE falling back to name (§6). Matching by name
   * alone would merge two different bands who share one, and split one band
   * whose name the user has since edited.
   */
  artistDiscogsId: number | null;
  label: string | null;
  labelDiscogsId: number | null;
  catalogNumber: string | null;
  country: string | null;
  year: number | null;
  formats: string[];
  isReissue: boolean;
  images: Array<{ url: string; type: 'primary' | 'secondary' }>;
  matrixRunout: string[];
  /**
   * The same runouts, each with the per-side description Discogs holds
   * ("Runout side A"). §12 step 14c's evidence panel reads THIS rather than
   * `matrixRunout`: on the committed collision pair the values are
   * byte-identical and the descriptions are not, so dropping them shows two
   * identical lists for two different records.
   *
   * `matrixRunout` is unchanged and still feeds the form field (§5.7), which
   * wants the strings alone.
   */
  matrixRunoutDetail: Array<{ value: string; description: string | null }>;
  otherIdentifiers: Array<{ type: string; value: string; description: string | null }>;
  pressingPlant: string | null;
  /**
   * EVERY manufacturing role, for comparing two pressings — where
   * `pressingPlant` narrows to the one company §4.2's column can hold.
   *
   * Both are correct for their own purpose. A panel that compares releases
   * needs the roles the column discards: the collision pair separates on
   * `Lacquer Cut At: Tape One`, which is not a pressing plant and must not
   * become one.
   */
  manufacturingCompanies: Array<{ role: string; name: string }>;
  vinylWeightGrams: number | null;
  colorVariant: string | null;
  tracklist: Array<{ position: string | null; title: string | null; duration: string | null }>;
  genres: string[];
  styles: string[];
  notes: string | null;
  numForSale: number | null;
  lowestPrice: number | null;
};

/**
 * §6: identifiers "where `type == 'Matrix / Runout'`".
 *
 * Case-insensitive because the type string is contributor-entered, and this is
 * the field CLAUDE.md §8 calls user-authoritative — losing it to a capitalised
 * variant would be the worst possible silent drop.
 */
const MATRIX_TYPE = 'matrix / runout';

/**
 * §6: companies "where role indicates pressing".
 *
 * An ALLOWLIST rather than a substring test. The real payload lists four
 * companies with distinct manufacturing roles — "Published By", "Pressed By",
 * "Lacquer Cut At" — and only one of them pressed the record. A substring
 * match on "press" would also catch "Repressed By" (correct) but a looser test
 * catches the mastering studio, putting the wrong name in `pressing_plant`.
 */
const PRESSING_ROLES = new Set(['pressed by', 'repressed by', 'manufactured by']);

/**
 * Roles that describe MAKING the physical object, for §12 step 14c's panel.
 *
 * A superset of `PRESSING_ROLES`, and deliberately still an allowlist rather
 * than "every company". "Published By" and "Distributed By" are rights and
 * logistics facts: they appear identically on both members of the collision
 * pair, so including them adds rows to a comparison without adding anything to
 * compare.
 */
const MANUFACTURING_ROLES = new Set([
  ...PRESSING_ROLES,
  'lacquer cut at',
  'mastered at',
  'recorded at',
  'mixed at',
  'glass mastered at',
  'pressed at',
]);

/**
 * Colour is Discogs' `text` field, which also carries non-colour sleeve facts
 * like "Gatefold". Writing those into `color_variant` would claim a colour
 * nobody stated, on every gatefold record.
 *
 * A colour word must appear for the text to be read as one. Deliberately
 * conservative: a missed colour is a blank field the user fills in, while a
 * wrong one is data that looks entered.
 */
const COLOUR_WORDS =
  /\b(black|blue|red|green|yellow|orange|purple|pink|white|clear|gold|silver|grey|gray|brown|amber|marbled|splatter|translucent|transparent|coloured|colored)\b/i;

/**
 * "180 Gram" / "200g" in the descriptor list — a claim about this pressing,
 * made by a contributor who was looking at the record.
 *
 * The unit is REQUIRED, not optional. The same descriptor list carries "45
 * RPM", "12 Inch" and "7\"", and a digits-anywhere rule turns every one of
 * them into a weight.
 */
const GRAM_DESCRIPTOR = /\b(\d{2,3})\s*(?:gram|grams|g)\b/i;

export function normalizeRelease(input: unknown): NormalizedRelease {
  const raw = rawRelease.parse(input);

  const identifiers = raw.identifiers ?? [];
  /**
   * **Runouts are NOT normalized, and that is load-bearing** (SPEC §12 step
   * 14c). They are displayed for the user to compare against the object in
   * their hands, so every character discriminates: interior double spaces,
   * unicode glyphs (△ ✲ •), and parenthetical transcription notes are
   * frequently the only difference between two pressings.
   *
   * `bounded()` stays as a denial-of-service guard. `meaningful()` and any
   * trimming or whitespace collapsing must NOT be added here — see the
   * verbatim block in the test file, which fails if they are.
   */
  const matrixRunoutDetail = identifiers
    .filter((identifier) => (identifier.type ?? '').trim().toLowerCase() === MATRIX_TYPE)
    .map((identifier) => ({
      value: bounded(identifier.value ?? '', FIELD_LIMITS.matrix) ?? '',
      // The DESCRIPTION is prose about which side it came from, so it goes
      // through `meaningful()` — the verbatim rule protects the runout itself.
      description: meaningful(identifier.description),
    }))
    .filter((detail) => detail.value.trim() !== '');

  const matrixRunout = matrixRunoutDetail.map((detail) => detail.value);

  const otherIdentifiers = identifiers
    .filter((identifier) => (identifier.type ?? '').trim().toLowerCase() !== MATRIX_TYPE)
    .map((identifier) => ({
      type: identifier.type ?? '',
      value: identifier.value ?? '',
      description: meaningful(identifier.description),
    }));

  const formats = raw.formats ?? [];
  const descriptors = formats.flatMap((format) => [
    ...(format.name === undefined ? [] : [format.name]),
    ...toDescriptors(format.descriptions),
  ]);

  const pressedBy = (raw.companies ?? []).find((company) =>
    PRESSING_ROLES.has((company.entity_type_name ?? '').trim().toLowerCase()),
  );

  const colourText = formats
    .map((format) => format.text)
    .find((text) => text !== undefined && COLOUR_WORDS.test(text));

  /**
   * An explicit gram descriptor beats `estimated_weight`: the descriptor is a
   * claim about the PRESSING, while the estimate is Discogs' shipping-weight
   * guess for the package.
   */
  const gramMatch = descriptors.map((d) => GRAM_DESCRIPTOR.exec(d)).find((m) => m !== null);

  return {
    discogsId: raw.id,
    masterId: raw.master_id ?? null,
    // Title alone here — NOT combined with the artist as in search results.
    title: bounded(meaningful(raw.title), FIELD_LIMITS.title),
    artist: bounded(meaningful(raw.artists?.[0]?.name), FIELD_LIMITS.name),
    artistDiscogsId: raw.artists?.[0]?.id ?? null,
    label: bounded(meaningful(raw.labels?.[0]?.name), FIELD_LIMITS.name),
    labelDiscogsId: raw.labels?.[0]?.id ?? null,
    catalogNumber: meaningful(raw.labels?.[0]?.catno),
    country: meaningful(raw.country),
    year: toYear(raw.year) ?? toYear(raw.released),
    formats: descriptors,
    isReissue: inferReissue(descriptors),
    /**
     * https only. These URLs are chosen by whichever contributor edited the
     * release, and the app renders them into the user's browser.
     */
    images: (raw.images ?? [])
      .map((image) => ({ url: safeImageUrl(image.uri), type: image.type }))
      .filter((image): image is { url: string; type: string | undefined } => image.url !== null)
      .map((image) => ({
        url: image.url,
        type: image.type === 'primary' ? ('primary' as const) : ('secondary' as const),
      })),
    matrixRunout,
    matrixRunoutDetail,
    otherIdentifiers,
    pressingPlant: meaningful(pressedBy?.name),
    manufacturingCompanies: (raw.companies ?? [])
      .filter((company) =>
        MANUFACTURING_ROLES.has((company.entity_type_name ?? '').trim().toLowerCase()),
      )
      .map((company) => ({
        role: (company.entity_type_name ?? '').trim(),
        name: (company.name ?? '').trim(),
      }))
      .filter((company) => company.role !== '' && company.name !== ''),
    /**
     * ONLY from an explicit descriptor. Never from `estimated_weight`.
     *
     * FOUND IN REAL USE: `estimated_weight` is Discogs' guess at the weight of
     * the PACKAGE, and it prefilled 230 into a field labelled "Weight (g)".
     * Vinyl is pressed at 140, 180 or 200 grams — 230 is not a value the
     * column can plausibly hold, and it arrived looking like data somebody had
     * measured.
     *
     * Unit 6 wrote that the estimate is a shipping guess and then used it as a
     * fallback regardless: the knowledge was in the comment and not in the
     * code. §5.7 says "parsed from format descriptors WHEN PRESENT", and when
     * it is absent the honest answer is nothing. An empty field asks the user
     * to weigh the record; a fabricated one tells them it is already done.
     */
    vinylWeightGrams:
      gramMatch === null || gramMatch === undefined ? null : Number(gramMatch[1]),
    colorVariant: meaningful(colourText),
    tracklist: (raw.tracklist ?? []).map((track) => ({
      position: meaningful(track.position),
      title: meaningful(track.title),
      // `duration: ""` is Discogs' absence again, here in every untimed track.
      duration: meaningful(track.duration),
    })),
    genres: raw.genres ?? [],
    styles: raw.styles ?? [],
    notes: bounded(meaningful(raw.notes), FIELD_LIMITS.notes),
    numForSale: raw.num_for_sale ?? null,
    lowestPrice: raw.lowest_price ?? null,
  };
}
