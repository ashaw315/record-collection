import { formatPrice } from '@/app/collection-format';
import { conditionLabel } from '@/app/records/record-detail-format';

/**
 * §10b's back face, as data.
 *
 * "**The back face is never empty.** Most records will have a front cover from
 * Discogs and nothing else for a long time. Rather than a blank or a
 * placeholder image, the back renders what is known: label, catalogue number,
 * pressing details, matrix runout, condition, what was paid and where. That is
 * close to what a real back sleeve carries, and it means every record is a
 * two-sided object from the day it is entered."
 *
 * Pure, because what a back sleeve says is a set of decisions — which fields,
 * in what order, and what to do when one is missing — and a component test
 * would confirm whatever markup was produced without stating what should be on
 * it.
 *
 * **"Never empty" is about the FACE, not about every row.** A field that was
 * never recorded is omitted rather than printed with a dash: an empty
 * "Matrix —" asserts the field was looked at and found blank, where absence
 * says nothing, which is the truth. A record with nothing recorded yields no
 * rows at all, and the component says so in a sentence — that is the common
 * FIRST state under §10's quick in-store entry, not an edge case.
 */

export type BackFaceRow = { label: string; value: string };

export type BackFaceInput = {
  labelName: string | null;
  catalogNumber: string | null;
  yearPressed: number | null;
  countryPressed: string | null;
  pressingPlant: string | null;
  matrixRunout: string | null;
  vinylWeightGrams: number | null;
  colorVariant: string | null;
  isReissue: boolean;
  conditionMedia: string | null;
  conditionSleeve: string | null;
  purchasePrice: string | null;
  purchaseDate: string | null;
  storeName: string | null;
};

/** Joins the parts that are present, or `null` when none are. */
function joined(parts: Array<string | null>, separator = ' · '): string | null {
  const present = parts.filter((part): part is string => part !== null && part !== '');
  return present.length === 0 ? null : present.join(separator);
}

export function backFaceDetails(record: BackFaceInput): BackFaceRow[] {
  const rows: Array<[string, string | null]> = [
    ['Label', record.labelName],
    ['Catalogue', record.catalogNumber],
    ['Pressed', record.yearPressed === null ? null : String(record.yearPressed)],
    ['Country', record.countryPressed],
    ['Plant', record.pressingPlant],
    /**
     * §4.2 calls the matrix "the true pressing fingerprint" and CLAUDE.md §8
     * makes it user-authoritative. It is the one field a collector checks
     * against the dead wax, so it belongs on the face they turned the record
     * over to read.
     */
    ['Matrix', record.matrixRunout],
    /**
     * Weight and colour combined: both describe the physical disc, both are
     * usually absent, and two rows reading "180g" and "clear w/ splatter"
     * separately are more furniture than information.
     */
    [
      'Disc',
      joined([
        record.vinylWeightGrams === null ? null : `${record.vinylWeightGrams}g`,
        record.colorVariant,
      ]),
    ],
    /**
     * Only when TRUE. `is_reissue` is NOT NULL DEFAULT false (§4.2), so `false`
     * means "not marked as a reissue" rather than "confirmed original", and
     * printing "Pressing: original" would assert a check nobody made.
     */
    ['Pressing', record.isReissue ? 'Reissue' : null],
    /**
     * Spelled out, never the Goldmine code. `VG+` is shorthand (§4.2) and
     * unreadable to anyone who has not learnt it; the detail screen already
     * expands these and the back face must not be the one place that does not.
     */
    ['Media', conditionLabel(record.conditionMedia) ?? null],
    ['Sleeve', conditionLabel(record.conditionSleeve) ?? null],
    // Through the app's single money formatter: `purchase_price` is
    // NUMERIC(10,2) and arrives as a string, and "12.50" is not a price.
    ['Paid', record.purchasePrice === null ? null : formatPrice(record.purchasePrice)],
    /**
     * Where and when together — they answer one question. Either alone is still
     * worth showing: a record bought somewhere memorable on a forgotten day is
     * ordinary, and dropping the store because the date is missing would lose
     * the fact that WAS recorded.
     */
    ['Bought', joined([record.purchaseDate, record.storeName], ' · ')],
  ];

  return rows
    .filter((entry): entry is [string, string] => entry[1] !== null && entry[1] !== '')
    .map(([label, value]) => ({ label, value }));
}
