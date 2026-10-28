import { z } from 'zod';
import type { CollectionItem } from './collection';
import type { ImportOverrides } from '@/lib/db/queries/discogs-import';
import { normalizeRelease, type NormalizedRelease } from './normalize-release';

/**
 * Step 18 unit B (SPEC §12 step 18, §6): one collection item and its release,
 * mapped into what the importer takes, under Adam's rules of 27 Oct. Pure.
 *
 * - Discogs' genres are taken and its styles dropped: the local tree is a
 *   hierarchy (§8) and a style is a flat string under a genre.
 * - Weight is parsed from the format text, a number with g, gram or gm, and
 *   from nothing else: `estimated_weight` is Discogs' shipping guess.
 * - Colour is never parsed. The text that would have been read is listed.
 * - A format outside the seven names, and a year of 0, import blank and are
 *   listed. The format list is not grown.
 * - The matrix is carried as Discogs' reading, joined side by side as the
 *   importer joins it; whether it is written is the importer's rule, only
 *   where the pressing's field is empty, marked `discogs` (§7.8, §4.2).
 *
 * What is reported back is the point: each item's `blank` and `dropped`
 * lists are the report Adam reads, so nothing is silently lost.
 */
/** The seven seeded formats (migration 0000), the only names the mapping may give: the list is not grown. */
export type FormatName = 'LP' | '2xLP' | '7"' | '10"' | '12" Single' | 'Box Set' | 'Picture Disc';

const rawFormat = z.object({ name: z.string(), qty: z.string().optional(), descriptions: z.array(z.string()).optional(), text: z.string().optional() }).passthrough();
const rawFormats = z.object({ id: z.number().int(), formats: z.array(rawFormat).optional(), year: z.number().optional() }).passthrough();

export type RawFormat = { name: string; qty?: string; descriptions?: string[]; text?: string };

export type Omission = { field: string; value: string; reason: string };

export type MappedItem = {
  release: NormalizedRelease;
  overrides: ImportOverrides;
  genres: string[];
  formatName: FormatName | null;
  matrixRunout: string | null;
  /** Columns left blank where Discogs had something the rules do not take as it stands. */
  blank: Omission[];
  /** Discogs fields the rules drop outright. */
  dropped: Omission[];
};

/** A number with g, gram, grams or gm, in any of the format texts; the first found. */
export function parseWeightGrams(texts: readonly string[]): number | null {
  for (const text of texts) {
    const m = /\b(\d{2,3})\s*(?:grams?|gm|g)\b/i.exec(text);
    if (m !== null) return Number(m[1]);
  }
  return null;
}

/**
 * One of the seven, or null. A Box Set is its own format whatever it holds.
 * One vinyl format decides by its descriptions, then by its quantity: two
 * discs are the `2xLP`; three or more are no format the app has. Two formats
 * on one release (an LP with a 7") are no single format either.
 */
export function pickFormatName(formats: readonly RawFormat[]): FormatName | null {
  if (formats.some((f) => f.name === 'Box Set')) return 'Box Set';
  const vinyl = formats.filter((f) => f.name === 'Vinyl');
  if (vinyl.length !== 1) return null;
  const f = vinyl[0];
  const d = f.descriptions ?? [];
  const qty = Number(f.qty ?? '1');
  if (d.includes('Picture Disc')) return 'Picture Disc';
  if (d.includes('7"')) return '7"';
  if (d.includes('10"')) return '10"';
  if (d.includes('12"') && (d.includes('Single') || d.includes('Maxi-Single'))) return '12" Single';
  if (qty === 1) return 'LP';
  if (qty === 2) return '2xLP';
  return null;
}

export function mapCollectionItem(raw: unknown, item: CollectionItem): MappedItem {
  const shape = rawFormats.parse(raw);
  if (shape.id !== item.releaseId) throw new Error(`the release given is ${shape.id}, and the collection item is release ${item.releaseId}`);
  const normalized = normalizeRelease(raw);
  const formats = shape.formats ?? [];
  const texts = formats.map((f) => f.text).filter((t): t is string => typeof t === 'string' && t.trim() !== '');
  const blank: Omission[] = [];
  const dropped: Omission[] = [];

  const formatName = pickFormatName(formats);
  if (formatName === null && formats.length > 0) {
    blank.push({ field: 'format', value: formats.map((f) => `${f.name}×${f.qty ?? '1'} ${(f.descriptions ?? []).join('/')}`).join(' + '), reason: 'no single format among the seven' });
  }

  const vinylWeightGrams = parseWeightGrams(texts);
  if (texts.length > 0) blank.push({ field: 'color_variant', value: texts.join(' | '), reason: 'colour is never parsed' });

  const year = shape.year === 0 ? null : normalized.year;
  if (shape.year === 0) blank.push({ field: 'year_pressed', value: '0', reason: 'Discogs has no year' });

  if (normalized.styles.length > 0) dropped.push({ field: 'styles', value: normalized.styles.join(', '), reason: 'styles are not taken' });

  /* No styles on the release the importer sees: its genre find-or-create reads styles and genres alike, and styles are dropped (rule 2). */
  const release: NormalizedRelease = { ...normalized, year, vinylWeightGrams, colorVariant: null, styles: [] };
  const matrixRunout = normalized.matrixRunout.length === 0 ? null : normalized.matrixRunout.join(' / ');

  const overrides: ImportOverrides = {
    conditionMedia: item.conditionMedia,
    conditionSleeve: item.conditionSleeve,
    yearPressed: year,
  };

  return { release, overrides, genres: normalized.genres, formatName, matrixRunout, blank, dropped };
}
