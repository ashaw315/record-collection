import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { recordLadder } from '@/lib/colour/record-ladder';
import { Figure, Flat } from './OrnamentMarks';
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
    const html = renderToStaticMarkup(<Figure ladder={ladder} figure={{ kind: 'solo', form: 'panel' }} />);
    expect(fills(html)).toEqual([
      ['base', ladder.base],
      ['shade', ladder.shade],
      ['top', ladder.top],
    ]);
    expect(html, 'no face carries an opacity (§5.1)').not.toMatch(/opacity/);
  });

  it('draws a pair as two solids in one figure, six faces', () => {
    const html = renderToStaticMarkup(<Figure ladder={ladder} figure={{ kind: 'pair', forms: ['slab', 'beam'] }} />);
    expect(html.match(/data-ornament="figure"/g), 'one figure').toHaveLength(1);
    expect(fills(html).map(([face]) => face)).toEqual(['base', 'shade', 'top', 'base', 'shade', 'top']);
    expect(html).toContain('data-figure="pair"');
  });

  it('sizes the figure from its box: the viewBox is the projected bounds and the CSS aspect follows it', () => {
    const figure = { kind: 'solo', form: 'beam' } as const;
    const box = figureBox(figure);
    const html = renderToStaticMarkup(<Figure ladder={ladder} figure={figure} />);
    expect(html).toContain(`viewBox="${box.minX} ${box.minY} ${box.width} ${box.height}"`);
    expect(html).toContain(`aspect-ratio:${box.width / box.height} / 1`);
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

  it('sizes the triangle against its host too, by the same rule', () => {
    const html = renderToStaticMarkup(<Flat ladder={ladder} flat={FLATS.left} />);
    expect(html, 'no drawn-instance size survives').not.toMatch(/width:250px|height:190px/);
    expect(html).toContain('max-height:66.66666666666666%');
    expect(html).toContain('max-width:25%');
  });

  it('never paints shade on a flat', () => {
    for (const flat of [FLATS.left, FLATS.right]) {
      expect(renderToStaticMarkup(<Flat ladder={ladder} flat={flat} />)).not.toContain(ladder.shade);
    }
  });
});
