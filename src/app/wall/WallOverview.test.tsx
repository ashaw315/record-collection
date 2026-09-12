import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WallOverview } from './WallOverview';
import type { ShelfSeat } from './shelf-runs';

/**
 * The overview renderer (The Wall 5b §5): **polygons only — no text, no
 * interaction.**
 *
 * §5's rule is that labels render at 1:1 and are REMOVED below it, never
 * shrunk: a 9px label is an absolute floor, so a wall scaled to 0.41 to fit a
 * 1440px viewport would render it at 3.7px and violate the floor silently.
 * This component is the unlabelled state, and the claim worth testing at this
 * layer is that it draws the geometry the shared module produces and nothing
 * else.
 *
 * **The threshold between this component and the labelled one is NOT here.**
 * The rule is settled; how the switch is expressed is its own decision.
 */

const seats = (count: number, sections = 1): ShelfSeat[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `r${index}`,
    section: `S${index % sections}`,
  }));

const render = (props: Parameters<typeof WallOverview>[0]) =>
  renderToStaticMarkup(<WallOverview {...props} />);

const countTag = (html: string, tag: string) =>
  html.split(`<${tag}`).length - 1;

describe('the overview draws the collection as polygons', () => {
  it('draws one polygon per record plus one per shelf run', () => {
    const html = render({ seats: seats(6, 2), pulledId: null });

    // 6 spines + 2 runs.
    expect(countTag(html, 'polygon')).toBe(8);
  });

  /**
   * **No text at any size.** The load-bearing claim of this component: at the
   * overview scale a label would be below the 9px floor, so the state is
   * unlabelled rather than small-labelled.
   */
  it('renders no text at all', () => {
    const html = render({ seats: seats(40, 3), pulledId: null });

    expect(countTag(html, 'text')).toBe(0);
    expect(html).not.toMatch(/<tspan/);
  });

  /** No interaction: nothing clickable, nothing focusable, no handlers. */
  it('renders nothing interactive', () => {
    const html = render({ seats: seats(20, 2), pulledId: null });

    expect(countTag(html, 'button')).toBe(0);
    expect(html).not.toMatch(/tabindex|onclick|role="button"/i);
  });

  it('renders an empty collection without drawing anything', () => {
    const html = render({ seats: [], pulledId: null });

    expect(countTag(html, 'polygon')).toBe(0);
  });
});

/**
 * **§2's distinction, at the rendered layer.** The geometry module asserts it
 * on points; this asserts that the renderer actually emits what it produced.
 */
describe('a pulled record leaves the shelf whole', () => {
  it('draws the same number of shelf outlines with a record pulled', () => {
    const shelf = seats(6, 2);
    const seated = render({ seats: shelf, pulledId: null });
    const pulled = render({ seats: shelf, pulledId: 'r2' });

    /* One fewer spine, the SAME number of outlines. */
    expect(countTag(pulled, 'polygon')).toBe(countTag(seated, 'polygon') - 1);
  });
});

/**
 * **200 records, which is the state the whole density sequence was about.**
 *
 * The design file's §7 draws five shelves of forty and reports 33% ink against
 * 67% empty. Nobody had rendered that in SVG, so the cost is measured here
 * rather than asserted — and the number that matters is what it costs when
 * something CHANGES, because the two-state switch will eventually mount and
 * unmount this whole thing.
 */
describe('200 records', () => {
  it('renders without error and reports its node count', () => {
    const html = render({ seats: seats(200, 5), pulledId: null });
    const polygons = countTag(html, 'polygon');

    /*
      200 spines + 25 outlines. Five shelves of forty, and because the sections
      cycle every fifth seat, each shelf contains all five sections interleaved
      — so each draws five runs rather than one. My first expectation said 205,
      assuming one run per section across the whole wall; runs are per SHELF,
      which is what makes the wall wrap without a run spanning a row break.
    */
    expect(polygons).toBe(225);
    expect(html.length).toBeGreaterThan(0);
  });

  it('costs a re-render less than a budget a switch could not absorb', () => {
    const shelf = seats(200, 5);

    /* Warm, so the measurement is steady-state rather than first-compile. */
    render({ seats: shelf, pulledId: null });

    const started = performance.now();
    for (let run = 0; run < 5; run += 1) {
      render({ seats: shelf, pulledId: `r${run}` });
    }
    const perRender = (performance.now() - started) / 5;

    /*
      Generous on purpose: this is a REGRESSION bound, not a target. It exists
      so a future change that makes the overview quadratic fails here rather
      than being noticed as jank after the switch lands. The measured figure is
      reported in the unit's notes.
    */
    expect(perRender, `${perRender.toFixed(1)}ms per 200-record render`).toBeLessThan(100);
  });
});
