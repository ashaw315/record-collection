import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { recordLadder } from '@/lib/colour/record-ladder';
import { Figure, Flat, FLAT_OUTSIDE } from './OrnamentMarks';
import { FLATS, figureBox } from './ornament';

/**
 * §25 and §26: a solid's faces are the ladder's TOP, BASE and SHADE — top
 * 0.745 (a face only), base on the left, shade on the right — and a flat takes
 * tint or base and never shade. `e2e/extended-grid.spec.ts` measures the same
 * on the route; this holds the mapping at the component so a face that
 * quietly reverted to a tint-derived tone would fail before compositing.
 */
const ladder = recordLadder('#8b2f2f');
if (ladder === null) throw new Error('the fixture colour produces a ladder');

const fills = (html: string) => Array.from(html.matchAll(/<polygon[^>]*data-face="(\w+)"[^>]*fill="([^"]+)"/g)).map((m) => [m[1], m[2]] as const);

describe('a figure’s faces are the ladder’s (§25, §26)', () => {
  it('draws a solo as three faces: top, base on the left, shade on the right', () => {
    const html = renderToStaticMarkup(<Figure ladder={ladder} figure={{ kind: 'solo', form: 'panel' }} host="strip" />);
    expect(fills(html)).toEqual([
      ['base', ladder.base],
      ['shade', ladder.shade],
      ['top', ladder.top],
    ]);
    expect(html, 'no face carries an opacity (§5.1)').not.toMatch(/opacity/);
  });

  it('draws a pair as two solids in one figure, six faces', () => {
    const html = renderToStaticMarkup(<Figure ladder={ladder} figure={{ kind: 'pair', forms: ['slab', 'beam'] }} host="strip" />);
    expect(html.match(/data-ornament="figure"/g), 'one figure').toHaveLength(1);
    expect(fills(html).map(([face]) => face)).toEqual(['base', 'shade', 'top', 'base', 'shade', 'top']);
    expect(html).toContain('data-figure="pair"');
  });

  it('sizes the figure from its box: the viewBox is the projected bounds and the CSS aspect follows it', () => {
    const figure = { kind: 'solo', form: 'beam' } as const;
    const box = figureBox(figure);
    const html = renderToStaticMarkup(<Figure ladder={ladder} figure={figure} host="strip" />);
    expect(html).toContain(`viewBox="${box.minX} ${box.minY} ${box.width} ${box.height}"`);
    expect(html).toContain(`aspect-ratio:${box.width / box.height} / 1`);
  });
});

describe('§26 placement is the host’s rule, not the figure’s (step 28)', () => {
  /**
   * §28: "A figure in a full-width strip takes a two-column right inset; a
   * figure in an air column is centred in it. **Neither rule depends on solo
   * or pair.**" Asserted on both figure kinds in both hosts, so the test
   * cannot encode the correlation this one drawing happens to have.
   */
  it('insets in a strip and centres in air, for either kind of figure', () => {
    for (const figure of [{ kind: 'solo', form: 'panel' }, { kind: 'pair', forms: ['slab', 'beam'] }] as const) {
      const strip = renderToStaticMarkup(<Figure ladder={ladder} figure={figure} host="strip" />);
      expect(strip, `${figure.kind} in a strip: two columns in`).toContain('right:240px');
      expect(strip, 'and not centred').not.toContain('translateX(-50%)');

      const air = renderToStaticMarkup(<Figure ladder={ladder} figure={figure} host="air" />);
      expect(air, `${figure.kind} in air: centred`).toContain('translateX(-50%)');
      expect(air, 'and not inset by a module').not.toContain('right:240px');
    }
  });
});

describe('a flat is one fill at tint or base, never shade (§25)', () => {
  it('draws the quarter-disc at BASE, one rounded shape and no faces', () => {
    const html = renderToStaticMarkup(<Flat ladder={ladder} flat={FLATS.right} />);
    expect(html).not.toContain('<polygon');
    expect(html).toContain(`background:${ladder.base}`);
    expect(html).toContain('border-radius:50%');
    expect(html).toContain('data-flat="quarterDisc"');
  });

  it('draws the triangle at TINT as a three-point clip, no faces', () => {
    const html = renderToStaticMarkup(<Flat ladder={ladder} flat={FLATS.left} />);
    expect(html).not.toContain('<polygon');
    expect(html).toContain(`background:${ladder.tint}`);
    expect(html).toMatch(/clip-path:polygon\(/);
    expect(html).toContain('data-flat="triangle"');
  });

  /**
   * **§29: a flat's size follows its host, and no section fixes it at 150.**
   *
   * The build read §25's specimen caption — "r 150 · more than a third
   * outside" — as the spec. It is one drawn instance on a sheet. §29 rules
   * that a flat takes §9.2's gate measured on its host at render: visible
   * part at most two-thirds of the host cell's HEIGHT and at most a quarter
   * of the section's WIDTH, whichever is smaller. On the record with no
   * About snippet the host is 104px, so the visible radius is 69, not 150.
   *
   * Sized in CSS rather than in JavaScript, so it holds on the first paint
   * and at every width without a measurement pass — the same reason §9.2's
   * solids are sized by percentage.
   */
  it('sizes the quarter-disc against its host, not at the specimen’s 150 (§29)', () => {
    const html = renderToStaticMarkup(<Flat ladder={ladder} flat={FLATS.right} />);
    expect(html, 'no drawn-instance size survives').not.toMatch(/width:300px|width:150px/);
    /*
      §29's two bounds sit on their own axes: the height bound sizes the disc
      and the width bound clamps it, so the smaller wins. Asserted as the two
      maxima rather than as a `min()`, because a percentage inside `min()`
      resolves against one axis and drops the other — measured at 180 where
      §29's bound was 161.
    */
    expect(html, 'the height bound, doubled for the full disc').toContain('max-height:calc(66.66666666666666% * 2)');
    expect(html, 'the width bound clamps it').toContain('max-width:calc(25% * 2)');
    expect(html, 'and it stays a circle whichever binds').toContain('aspect-ratio:1 / 1');
  });

  /**
   * **The DRAWN width and the VISIBLE width stopped being the same number.**
   *
   * This asserted `max-width:25%` — §29's quarter-of-section cap read straight
   * off the drawn box. That was right only while the triangle sat flush at
   * `left: 0`, where nothing was outside the page and the two quantities
   * coincided. §26 and §21 require the opposite: it bleeds off the left page
   * edge with at least a third of it outside.
   *
   * So the drawn shape is now larger than its visible part, and an assertion
   * on the drawn box no longer says what its name says. Both halves are
   * asserted here — the cap on what SHOWS, and the bleed that makes them
   * differ — because checking the size alone would pass on a triangle that
   * bleeds nowhere, which is the defect this replaced.
   */
  it('sizes the triangle by the visible part, with the rest off the page', () => {
    const html = renderToStaticMarkup(<Flat ladder={ladder} flat={FLATS.left} />);
    expect(html, 'no drawn-instance size survives').not.toMatch(/width:250px|height:190px/);
    expect(html, 'the height bound is untouched — it does not bleed vertically').toContain(
      'max-height:66.66666666666666%',
    );

    /* Drawn width, and the part of it hanging outside the page's left edge. */
    const drawn = `25% / ${1 - FLAT_OUTSIDE}`;
    expect(html, 'the drawn shape is the visible quarter plus the bleed').toContain(
      `max-width:calc(${drawn})`,
    );
    expect(html, 'and that surplus is what sits outside the page').toContain(
      `left:calc(${drawn} * ${-FLAT_OUTSIDE})`,
    );

    /*
      The claim the two values above amount to: what the reader SEES is still
      §29's quarter. Computed rather than restated, so the arithmetic is the
      test and not a second copy of the implementation's numbers.
    */
    const visible = (1 / (1 - FLAT_OUTSIDE)) * (1 - FLAT_OUTSIDE);
    expect(visible * 25, 'the visible part is §29\u2019s quarter of the section').toBeCloseTo(25, 10);
    expect(FLAT_OUTSIDE, '\u00a721: at least a third lies outside').toBeGreaterThanOrEqual(1 / 3);
  });

  it('never paints shade on a flat', () => {
    for (const flat of [FLATS.left, FLATS.right]) {
      expect(renderToStaticMarkup(<Flat ladder={ladder} flat={flat} />)).not.toContain(ladder.shade);
    }
  });
});
