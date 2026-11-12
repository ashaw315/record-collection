/**
 * The row-to-screen mapping for 8a (SPEC.md §10).
 *
 * The probe carried these as literals, which proved the component and proved
 * nothing about the mapping — and the mapping is where a nullable column lands
 * wrong. §4.2 makes almost everything nullable, so every combination below is a
 * real record rather than a defensive case.
 */
import { formatReleaseDate, releasedYear } from '@/lib/discogs/release-fields';

/**
 * `Label · Catalog · Country, Year`, with absent parts and their separators
 * removed together.
 *
 * **The country and year are ONE part, not two.** Joining them at the top level
 * yields ', 1981' when the country is null — a line starting with a comma. They
 * pair first and join as a unit, which is why the composition is two steps.
 */
export function pressingLine(record: {
  labelName: string | null;
  catalogNumber: string | null;
  countryPressed: string | null;
  yearPressed: number | null;
  /**
   * §66 (step 179): the cached release's `released`. The full date stands in place of the pressed year it dates, as
   * much of it as is known, and never where the release dates another year or gives none; with no pressed year, a
   * date the release gives stands alone.
   */
  released?: string | null;
}): string {
  const date = formatReleaseDate(record.released);
  const dated = date !== null && (record.yearPressed === null || releasedYear(record.released) === record.yearPressed);
  const when: string | number | null = dated ? date : record.yearPressed;
  const origin = [record.countryPressed, when]
    .filter((part): part is string | number => part !== null)
    .join(', ');

  return [record.labelName, record.catalogNumber, origin === '' ? null : origin]
    .filter((part): part is string => part !== null && part !== '')
    .join(' · ');
}
