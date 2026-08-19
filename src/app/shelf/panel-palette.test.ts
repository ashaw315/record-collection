import { describe, expect, it } from 'vitest';
import {
  PANEL_GROUND,
  PANEL_TEXT,
  contrastRatio,
  type PanelRole,
} from './panel-palette';

/**
 * The panel's colours over the wall, and the reason they are a module rather
 * than class names in the markup.
 *
 * **The values were invisible and every test passed.** `Panels.tsx` was built
 * against `/plane`'s light workbench, where `text-foreground` is correctly dark.
 * Putting a near-black ground behind it — the fix for transparent text over
 * spine glyphs — left the value column at L* 6.2 on a ground of L* 6.5: a
 * contrast ratio of 1.02:1, which reads as a panel of labels with no values.
 * That is the "field of empty labels" failure the panels were told to avoid,
 * arrived at from the opposite direction: the rows were there and correct, and
 * nobody could see them.
 *
 * Nothing could catch it because a colour in a `className` is a string. Here
 * they are values, and the relationship between them is asserted.
 */

describe('every panel role is readable on the panel ground', () => {
  /**
   * **Swept across every role, not spot-checked at two.** Unit 17's finding:
   * two endpoint assertions can both pass while a band between them collapses.
   * The roles differ deliberately in weight — provenance is quieter than the
   * imprint, because a real sleeve does not print it at all — so "the brightest
   * and the dimmest are fine" says nothing about the three in between.
   */
  const roles = Object.keys(PANEL_TEXT) as PanelRole[];

  it('has more than two roles, or the sweep below is a spot-check', () => {
    /**
     * Guards the sweep itself. If the palette were ever reduced to two entries
     * the loop would still pass and would silently stop being a sweep — the
     * shape of vacuity this project keeps meeting.
     */
    expect(roles.length).toBeGreaterThan(2);
  });

  for (const role of roles) {
    it(`${role} clears 4.5:1 against the ground`, () => {
      /**
       * WCAG AA for body text. Not a house style: these are facts a collector
       * reads off a panel — a catalogue number, a matrix string, a price — and
       * getting a character wrong is the failure mode, so they must be legible
       * rather than merely present.
       *
       * Fails against `panel-palette.ts` if any role is set to a colour that
       * disappears into the ground, which is the defect this file exists for.
       */
      const ratio = contrastRatio(PANEL_TEXT[role], PANEL_GROUND);

      expect(ratio, `${role} on the panel ground is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        4.5,
      );
    });
  }

  it('keeps the hierarchy: values brighter than their labels', () => {
    /**
     * The panel's typography carries meaning — the value is the information and
     * the label names it, so a label brighter than its value inverts what the
     * eye reads first. A contrast floor alone would accept that inversion
     * happily, since both would clear it.
     */
    expect(contrastRatio(PANEL_TEXT.value, PANEL_GROUND)).toBeGreaterThan(
      contrastRatio(PANEL_TEXT.label, PANEL_GROUND),
    );
  });

  it('keeps provenance quieter than the pressing facts, but still readable', () => {
    /**
     * Provenance is the owner's information, which a real sleeve does not carry
     * at all, so it is deliberately dimmer. "Dimmer" must not become "gone" —
     * this pins both halves, and it is the band between the endpoints that unit
     * 17 warned about.
     */
    expect(contrastRatio(PANEL_TEXT.provenance, PANEL_GROUND)).toBeLessThan(
      contrastRatio(PANEL_TEXT.value, PANEL_GROUND),
    );
    expect(contrastRatio(PANEL_TEXT.provenance, PANEL_GROUND)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('contrastRatio', () => {
  /**
   * The instrument the sweep depends on, checked against values whose answers
   * are fixed by the WCAG definition rather than by this implementation.
   */
  it('gives 21:1 for black on white, the defined maximum', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  it('gives 1:1 for a colour against itself — the defect it must catch', () => {
    /**
     * This is the case that actually shipped: value text the same lightness as
     * its ground. If the function returned anything other than 1 here it could
     * not have caught it.
     */
    expect(contrastRatio('#17140f', '#17140f')).toBeCloseTo(1, 2);
  });

  it('is symmetric, so argument order cannot change a verdict', () => {
    expect(contrastRatio('#e8e2d8', '#141210')).toBeCloseTo(
      contrastRatio('#141210', '#e8e2d8'),
      6,
    );
  });

  it('rises monotonically as text lightens against a fixed dark ground', () => {
    /**
     * The sweep's own precondition. A ratio that saturated or inverted midway
     * would pass the endpoint checks above and rank the palette wrongly in
     * exactly the band the roles occupy.
     */
    const ramp = Array.from({ length: 24 }, (_, step) => {
      const v = Math.round(40 + (step / 23) * 200)
        .toString(16)
        .padStart(2, '0');
      return contrastRatio(`#${v}${v}${v}`, '#141210');
    });

    for (let i = 1; i < ramp.length; i += 1) {
      expect(ramp[i], `step ${i} must exceed step ${i - 1}`).toBeGreaterThan(ramp[i - 1]);
    }
  });

  it('reproduces the shipped defect: 1.02:1 for the old value-on-ground pair', () => {
    /**
     * The measured numbers from the live panel, kept as a regression fixture.
     * `text-foreground` resolved to L* 6.2 on a ground of L* 6.5.
     */
    const ratio = contrastRatio('#0f0d0b', '#17140f');
    expect(ratio).toBeLessThan(1.2);
  });
});
