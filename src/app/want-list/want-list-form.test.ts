import { describe, expect, it } from 'vitest';
import { BEST_DIG_LABEL, MAX_PRICE_LABEL } from './want-list-format';
import { FORM_SECTIONS, buildWantListBody, type WantListFormValues } from './want-list-form';

/**
 * SPEC.md §10's want-list form: "**`best_dig_notes` and `max_price` are
 * visually and structurally separate** (§7.2) — never one section, never one
 * label."
 *
 * The spec states it as a SCREEN requirement because a prefilled want-list form
 * is the likeliest place for the two to be collapsed: they are adjacent in the
 * schema, both optional, both about "what I want", and a form that grouped them
 * under a heading like "Wishlist details" would read perfectly well while
 * teaching the user that the best dig is a price.
 *
 * CLAUDE.md §8: "best dig" means the highest-fidelity pressing worth hunting
 * for — not the cheapest, the best deal, or the best price. `max_price` is a
 * separate, unrelated field.
 */

const BLANK: WantListFormValues = {
  title: '',
  artistId: '',
  labelId: '',
  priority: '3',
  targetPressingId: '',
  bestDigNotes: '',
  maxPrice: '',
};

describe('§7.2 separation, as a structural property', () => {
  /**
   * Asserted on the SECTIONS, not on the rendered output, so the property is
   * pinned where it is decided. A test that read the DOM would pass as long as
   * two labels existed somewhere, whatever grouped them.
   */
  it('puts best-dig notes and max price in DIFFERENT sections', () => {
    const bestDig = FORM_SECTIONS.find((section) =>
      section.fields.includes('bestDigNotes'),
    );
    const maxPrice = FORM_SECTIONS.find((section) => section.fields.includes('maxPrice'));

    expect(bestDig, 'best-dig notes belong to a section').toBeDefined();
    expect(maxPrice, 'max price belongs to a section').toBeDefined();
    expect(bestDig?.key, 'never one section').not.toBe(maxPrice?.key);
  });

  it('never puts them in the same section, whatever the sections are called', () => {
    // The general form: no section may contain both. A future third section
    // that gathered them would pass the test above if the two named sections
    // still existed.
    for (const section of FORM_SECTIONS) {
      const both =
        section.fields.includes('bestDigNotes') && section.fields.includes('maxPrice');

      expect(both, `section "${section.key}" holds both fields`).toBe(false);
    }
  });

  it('reuses the tested §7.2 labels rather than restating them', () => {
    /**
     * One definition. The labels are asserted in `want-list-format.test.ts` —
     * that "best dig" never mentions price, deals or value, and that max price
     * reads as the user's own ceiling rather than an appraisal. A second copy
     * here would drift out from under those assertions, which is exactly what
     * happened with the ownership badge and with create-schema.
     */
    const labels = FORM_SECTIONS.flatMap((section) => section.fields.map(fieldLabel));

    expect(labels).toContain(BEST_DIG_LABEL);
    expect(labels).toContain(MAX_PRICE_LABEL);
  });

  it('describes the best dig as being about the pressing', () => {
    const section = FORM_SECTIONS.find((s) => s.fields.includes('bestDigNotes'));

    expect(section?.heading).toMatch(/dig|pressing|hunt/i);
    expect(section?.heading, 'never a price heading').not.toMatch(/price|budget|cost|deal/i);
  });

  it('describes the ceiling as the user own limit, not a valuation', () => {
    const section = FORM_SECTIONS.find((s) => s.fields.includes('maxPrice'));

    expect(section?.heading).toMatch(/pay|budget|limit|ceiling/i);
    expect(section?.heading, 'this app never appraises').not.toMatch(/worth|value|market/i);
  });
});

describe('buildWantListBody', () => {
  it('sends only what was filled in', () => {
    // §5.3's POST body. An empty optional field is absent, not an empty string
    // — the coercion trap from NOTES, in form-submission shape.
    const body = buildWantListBody({ ...BLANK, title: 'Hear Nothing', artistId: 'a1' });

    expect(body).toEqual({ title: 'Hear Nothing', artistId: 'a1', priority: 3 });
  });

  it('keeps the two §7.2 fields as separate keys', () => {
    const body = buildWantListBody({
      ...BLANK,
      title: 'x',
      artistId: 'a1',
      bestDigNotes: 'UK first press, Porky stamp',
      maxPrice: '40.00',
    });

    expect(body.bestDigNotes).toBe('UK first press, Porky stamp');
    expect(body.maxPrice).toBe('40.00');
  });

  it('sends the priority as a number, since the column is an integer', () => {
    const body = buildWantListBody({ ...BLANK, title: 'x', artistId: 'a1', priority: '1' });

    expect(body.priority).toBe(1);
  });

  it('keeps the price a STRING, so it never routes through a float', () => {
    // NUMERIC(10,2) as a string end to end (§4.2). Number('40.00') is 40 and
    // the cents are gone from the wire.
    const body = buildWantListBody({ ...BLANK, title: 'x', artistId: 'a1', maxPrice: '40.00' });

    expect(body.maxPrice).toBe('40.00');
    expect(typeof body.maxPrice).toBe('string');
  });

  it('omits a blank target pressing rather than sending an empty id', () => {
    const body = buildWantListBody({ ...BLANK, title: 'x', artistId: 'a1' });

    expect(body).not.toHaveProperty('targetPressingId');
  });

  it('trims whitespace, so a stray space is not stored as a value', () => {
    const body = buildWantListBody({
      ...BLANK,
      title: '  Hear Nothing  ',
      artistId: 'a1',
      bestDigNotes: '   ',
    });

    expect(body.title).toBe('Hear Nothing');
    expect(body, 'whitespace-only notes are absent, not blank').not.toHaveProperty(
      'bestDigNotes',
    );
  });
});

/** The label a field carries on the form. */
function fieldLabel(field: keyof WantListFormValues): string {
  const section = FORM_SECTIONS.find((s) => s.fields.includes(field));
  return section?.labels[field] ?? '';
}
