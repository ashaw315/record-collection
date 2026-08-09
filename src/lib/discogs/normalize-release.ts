import { z } from 'zod';
import { inferReissue, meaningful, toDescriptors, toYear } from './fields';

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
    artists: z.array(z.object({ name: z.string() }).passthrough()).optional(),
    labels: z
      .array(z.object({ name: z.string().optional(), catno: z.string().optional() }).passthrough())
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
  label: string | null;
  catalogNumber: string | null;
  country: string | null;
  year: number | null;
  formats: string[];
  isReissue: boolean;
  images: Array<{ url: string; type: 'primary' | 'secondary' }>;
  matrixRunout: string[];
  otherIdentifiers: Array<{ type: string; value: string; description: string | null }>;
  pressingPlant: string | null;
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

/** "180 Gram" / "200g" in the descriptor list — a claim about this pressing. */
const GRAM_DESCRIPTOR = /(\d{2,3})\s*(?:gram|g)\b/i;

export function normalizeRelease(input: unknown): NormalizedRelease {
  const raw = rawRelease.parse(input);

  const identifiers = raw.identifiers ?? [];
  const matrixRunout = identifiers
    .filter((identifier) => (identifier.type ?? '').trim().toLowerCase() === MATRIX_TYPE)
    .map((identifier) => identifier.value ?? '')
    .filter((value) => value.trim() !== '');

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
    title: meaningful(raw.title),
    artist: meaningful(raw.artists?.[0]?.name),
    label: meaningful(raw.labels?.[0]?.name),
    catalogNumber: meaningful(raw.labels?.[0]?.catno),
    country: meaningful(raw.country),
    year: toYear(raw.year) ?? toYear(raw.released),
    formats: descriptors,
    isReissue: inferReissue(descriptors),
    images: (raw.images ?? [])
      .filter((image) => (image.uri ?? '').trim() !== '')
      .map((image) => ({
        url: image.uri as string,
        type: image.type === 'primary' ? ('primary' as const) : ('secondary' as const),
      })),
    matrixRunout,
    otherIdentifiers,
    pressingPlant: meaningful(pressedBy?.name),
    vinylWeightGrams:
      gramMatch === null || gramMatch === undefined
        ? (raw.estimated_weight ?? null)
        : Number(gramMatch[1]),
    colorVariant: meaningful(colourText),
    tracklist: (raw.tracklist ?? []).map((track) => ({
      position: meaningful(track.position),
      title: meaningful(track.title),
      // `duration: ""` is Discogs' absence again, here in every untimed track.
      duration: meaningful(track.duration),
    })),
    genres: raw.genres ?? [],
    styles: raw.styles ?? [],
    notes: meaningful(raw.notes),
    numForSale: raw.num_for_sale ?? null,
    lowestPrice: raw.lowest_price ?? null,
  };
}
