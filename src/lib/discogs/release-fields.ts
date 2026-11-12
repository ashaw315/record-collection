import { z } from 'zod';

/**
 * **§66, three fields from the release (Design, 11 Nov; Adam's ruling; step 179).** The format text (such as
 * "Gatefold"), the barcode and the full release date are not columns: they live only in the cached Discogs payload,
 * keyed by the pressing's release id, so this reads them from it. Only these three are read; anything else in the
 * payload is not. The format text is as Discogs gives it; the barcode is the first Barcode identifier as given, with
 * every barcode's digits beside it for search (§66: "compared by its digits alone"); the date is Discogs' `released`
 * string, drawn by `formatReleaseDate` as day month year, month year, or year, as known, never inventing a day.
 */
export type ReleaseFields = { formatText: string | null; barcode: string | null; barcodeDigits: string[]; released: string | null };

const Shape = z.object({
  formats: z.array(z.object({ text: z.string().optional() })).optional(),
  identifiers: z.array(z.object({ type: z.string().optional(), value: z.string().optional() })).optional(),
  released: z.string().optional(),
});

const NONE: ReleaseFields = { formatText: null, barcode: null, barcodeDigits: [], released: null };

/** The digits and nothing else: a typed barcode and a stored one are compared this way, so spaces and dashes on either side never matter. */
export function barcodeDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/** Each distinct barcode once, by its digits, with the value as Discogs first gives it: a printed and a scanned reading of one code are one. */
export function releaseBarcodes(payload: unknown): Array<{ digits: string; given: string }> {
  const parsed = Shape.safeParse(payload);
  if (!parsed.success) return [];
  const out: Array<{ digits: string; given: string }> = [];
  for (const identifier of parsed.data.identifiers ?? []) {
    if (identifier.type !== 'Barcode') continue;
    const given = (identifier.value ?? '').trim();
    const digits = barcodeDigits(given);
    if (digits !== '' && !out.some((b) => b.digits === digits)) out.push({ digits, given });
  }
  return out;
}

export function releaseFields(payload: unknown): ReleaseFields {
  const parsed = Shape.safeParse(payload);
  if (!parsed.success) return NONE;
  const raw = parsed.data;
  const texts = (raw.formats ?? []).map((format) => (format.text ?? '').trim()).filter((text) => text !== '');
  const barcodes = releaseBarcodes(payload);
  const released = (raw.released ?? '').trim();
  return {
    formatText: texts.length === 0 ? null : texts.join(', '),
    barcode: barcodes[0]?.given ?? null,
    barcodeDigits: barcodes.map((b) => b.digits),
    released: released === '' ? null : released,
  };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Discogs' `released` as words: "1982-03-15" is 15 March 1982, "1982-03" or "1982-03-00" is March 1982, "1982" or
 * "1982-00-00" is 1982. Null for nothing, zero, or a shape not known, since a guessed day is the one thing §66 forbids.
 */
export function formatReleaseDate(released: string | null | undefined): string | null {
  if (released === null || released === undefined) return null;
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(released.trim());
  if (m === null) return null;
  const year = Number(m[1]);
  if (year === 0) return null;
  const month = m[2] === undefined ? 0 : Number(m[2]);
  const day = m[3] === undefined ? 0 : Number(m[3]);
  if (month > 12 || day > 31) return null;
  if (month === 0) return String(year);
  const name = MONTHS[month - 1];
  return day === 0 ? `${name} ${year}` : `${day} ${name} ${year}`;
}

/** The year the release's date dates, or null. */
export function releasedYear(released: string | null | undefined): number | null {
  const m = /^(\d{4})/.exec((released ?? '').trim());
  const year = m === null ? 0 : Number(m[1]);
  return year === 0 ? null : year;
}
