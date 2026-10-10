import { describe, expect, it } from 'vitest';
import { CAP, FIGURE_FRACTION, FORK, OTHER_COLUMNS, RECORD_AT_FORK, RECORD_MINIMUM, SIDEBAR, contentColumn, figureBox, figureColumnMinimum, gridColumns, sidebarRules } from './sidebar-layout';

/**
 * Step 113, §T.1: the sidebar's arithmetic, held in one module so the
 * stylesheet, the page and the specs read the same figures.
 */
describe('the sidebar’s figures', () => {
  it('takes 417 from the window: the 336 sidebar, its 1px rule and 40 either side of the content', () => {
    expect(SIDEBAR.width + SIDEBAR.rule + SIDEBAR.gap + SIDEBAR.gap).toBe(417);
    expect(SIDEBAR.taken).toBe(417);
    expect(SIDEBAR.width - 2 * SIDEBAR.inset, 'its content, 18 to 318').toBe(300);
    expect(SIDEBAR.width + SIDEBAR.rule + SIDEBAR.gap, 'the content column’s first element').toBe(377);
  });

  /* Coordinator, 10 Oct: the fork is set from Record at 269, the width it has at a 768 window today; 128 is the floor Design ruled. */
  it('forks at 1054: Record at 269, the other five columns’ 367.6, and the 417', () => {
    expect(RECORD_AT_FORK + OTHER_COLUMNS + SIDEBAR.taken).toBeCloseTo(1053.6, 5);
    expect(FORK).toBe(1054);
    expect(RECORD_MINIMUM, 'the longest title in two lines, measured once on 10 Oct').toBe(128);
    expect(RECORD_MINIMUM + OTHER_COLUMNS + SIDEBAR.taken, 'the fork that floor alone would give').toBeCloseTo(912.6, 5);
  });

  it('gives the content column the window less 417, and stops it where a 1440 window puts it', () => {
    expect(contentColumn(1054)).toBe(637);
    expect(contentColumn(1440)).toBe(1023);
    expect(contentColumn(1920), 'a wider monitor shows the 1440 composition').toBe(1023);
    expect(CAP - SIDEBAR.gap, 'the content’s right edge').toBe(1400);
  });
});

describe('the grid’s columns against the content column', () => {
  /* "A column needs 184n − 24." */
  it('sets as many 160 covers 24 apart as the column holds', () => {
    expect(gridColumns(159)).toBe(2);
    expect(gridColumns(3 * 184 - 24)).toBe(3);
    expect(gridColumns(4 * 184 - 24 - 1)).toBe(3);
    expect(gridColumns(4 * 184 - 24)).toBe(4);
  });

  it('above the fork: three from 1054, four from 1129, five from 1313, and five at the cap', () => {
    const at = (window: number) => gridColumns(contentColumn(window));
    expect([1054, 1128, 1129, 1312, 1313, 1440, 1920].map(at)).toEqual([3, 3, 4, 4, 5, 5, 5]);
  });

  it('just below the fork the grid has the whole window less its 20 insets, so five', () => {
    expect(gridColumns(1053 - 40)).toBe(5);
  });
});

describe('the head figure', () => {
  it('is 0.328 of the content column’s width, as measured from Adam’s wireframe', () => {
    expect(FIGURE_FRACTION).toBe(0.328);
  });

  /* "Below the clearing height there is no figure." */
  it('names the narrowest content column at which a construction clears', () => {
    /* The real collection's source: 172.4 clearing at 1.19 wide to tall. */
    const column = figureColumnMinimum({ clearing: 172.4, aspect: 194 / 163 });
    expect(column).toBeCloseTo((172.4 * (194 / 163)) / 0.328, 6);
    expect(column, 'so it draws from the fork up').toBeLessThan(contentColumn(FORK));
  });

  /*
    Step 117, §T.6: "Where the source's aspect is below 1, set the head
    figure's height to 0.328 of the content column and its width to height
    × aspect." Fails against the figure as built to step 113, 0.328 wide at
    any aspect, which made a tall construction taller than the fraction.
  */
  it('caps a tall construction’s height at 0.328 of the column and takes its width from the aspect', () => {
    const tall = figureBox(0.966);
    expect(tall.height).toBe(FIGURE_FRACTION);
    expect(tall.width).toBeCloseTo(FIGURE_FRACTION * 0.966, 9);
    /* At 1440 the column is 1023: Psychic's figure. */
    expect([tall.width * 1023, tall.height * 1023].map((n) => Math.round(n * 10) / 10)).toEqual([324.1, 335.5]);
  });

  it('leaves a wide construction as it was: 0.328 of the column wide at its own ratio', () => {
    const wide = figureBox(194 / 163);
    expect(wide.width).toBe(FIGURE_FRACTION);
    expect(wide.height).toBeCloseTo(FIGURE_FRACTION / (194 / 163), 9);
    expect(figureBox(1)).toEqual({ width: FIGURE_FRACTION, height: FIGURE_FRACTION });
  });

  it('never draws a figure taller or wider than 0.328 of the column, at any aspect', () => {
    for (const aspect of [0.5, 0.794, 0.966, 1, 1.19, 1.548, 2]) {
      const box = figureBox(aspect);
      expect(box.height, `aspect ${aspect}`).toBeLessThanOrEqual(FIGURE_FRACTION);
      expect(box.width, `aspect ${aspect}`).toBeLessThanOrEqual(FIGURE_FRACTION);
      expect(box.width / box.height, 'at the construction’s own ratio').toBeCloseTo(aspect, 9);
    }
  });

  /* Fails against the minimum left as clearing × aspect: a capped figure is 0.328 of the column tall, so it clears later than the uncapped one did. */
  it('names the column at which a capped figure clears: its height is the fraction, so the aspect does not shorten it', () => {
    expect(figureColumnMinimum({ clearing: 193.2, aspect: 0.966 })).toBeCloseTo(193.2 / 0.328, 6);
    expect(figureColumnMinimum({ clearing: 193.2, aspect: 0.966 }) * figureBox(0.966).height, 'at that column the figure is exactly the clearing height tall').toBeCloseTo(193.2, 6);
    expect(figureColumnMinimum({ clearing: 172.4, aspect: 1.19 }) * figureBox(1.19).height).toBeCloseTo(172.4, 6);
  });
});

describe('the stylesheet', () => {
  const css = sidebarRules({ clearing: 172.4, aspect: 194 / 163 });

  it('applies the sidebar from the fork and not below', () => {
    expect(css).toContain(`@media (min-width: ${FORK}px)`);
    expect(css).toContain('grid-template-columns: 337px minmax(0, 1fr)');
  });

  it('sizes the figure from the column and the construction’s own ratio, and removes it where it would not clear', () => {
    expect(css).toContain('--figure-width: calc((100cqw - 417px) * 0.328)');
    expect(css).toContain(`--figure-height: calc(var(--figure-width) / ${194 / 163})`);
    expect(css).toContain(`@container collection (width < ${figureColumnMinimum({ clearing: 172.4, aspect: 194 / 163 }) + 417}px)`);
  });

  it('sizes a tall construction from its height: 0.328 of the column tall, and as wide as its ratio makes that', () => {
    const tall = sidebarRules({ clearing: 193.2, aspect: 0.966 });
    expect(tall).toContain('--figure-height: calc((100cqw - 417px) * 0.328)');
    expect(tall).toContain('--figure-width: calc(var(--figure-height) * 0.966)');
    expect(tall).toContain(`@container collection (width < ${193.2 / 0.328 + 417}px)`);
  });

  it('draws no figure rules where there is no source', () => {
    expect(sidebarRules(null)).not.toContain('--figure-width');
  });
});
