/**
 * The row-to-screen mapping for 8a (SPEC.md §10).
 *
 * The probe carried these as literals, which proved the component and proved
 * nothing about the mapping — and the mapping is where a nullable column lands
 * wrong. §4.2 makes almost everything nullable, so every combination below is a
 * real record rather than a defensive case.
 */

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
}): string {
  const origin = [record.countryPressed, record.yearPressed]
    .filter((part): part is string | number => part !== null)
    .join(', ');

  return [record.labelName, record.catalogNumber, origin === '' ? null : origin]
    .filter((part): part is string => part !== null && part !== '')
    .join(' · ');
}
