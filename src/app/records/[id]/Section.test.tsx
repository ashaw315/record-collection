import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { recordLadder } from '@/lib/colour/record-ladder';
import { ExtendedGrid, Section } from './Section';
import { CELL_PADDING, SECTION_RULE } from './extended-grid';
import { FLATS } from './ornament';
import { MAX_ROWS, regionStylesheet } from './region-rows';

/**
 * §26: the lower region is five rows of varied spans, and a section is an
 * ITEM in a row rather than a twelve-column grid of its own.
 *
 * **That moves the label.** §9.1 made the label a two-column span of the
 * page, which a four-column section cannot carry — two of its four columns
 * would be a label. §26's drawing puts the label at the top-left of each
 * section with content beneath it, and every section's label starts at its
 * own left edge, which is the vertical line §9.1's rail was for, now once
 * per row rather than once per page.
 */
const ladder = recordLadder('#8b2f2f');
if (ladder === null) throw new Error('the fixture colour produces a ladder');

const render = (node: React.ReactNode) => renderToStaticMarkup(<>{node}</>);

describe('a section is an item in its row (§26)', () => {
  it('is placed by §28’s stylesheet, never inline, so the breakpoints can move it', () => {
    /**
     * **An inline `grid-column` beats every stylesheet rule that lacks
     * `!important`.** Placing sections inline pinned the region at twelve
     * columns and the breakpoints silently did nothing — measured at 1200,
     * where the region reported 8 columns of 150 while four air cells,
     * hidden but still inline-placed at columns 8–12, opened four implicit
     * 0px tracks beside them.
     *
     * So the markup carries the section's NAME and the generated stylesheet
     * carries its placement, per width, from the same table
     * (`region-rows.ts`) the unit tests assert.
     */
    const html = render(
      <Section name="market" title="Market" base={null} shape="pair">
        <div>a</div>
        <div>b</div>
      </Section>,
    );
    expect(html, 'the name is what the stylesheet addresses').toContain('data-section="market"');
    expect(html, 'and nothing places it inline').not.toContain('grid-column');
  });

  it('puts the label above the content, not in a two-column span beside it', () => {
    const html = render(
      <Section name="tags" title="Tags" base={null} shape="one" span={4} start={1}>
        <div data-testid="content" />
      </Section>,
    );
    const label = html.indexOf('data-cell="label"');
    const content = html.indexOf('data-cell="content-0"');
    expect(label, 'the label cell renders').toBeGreaterThan(-1);
    expect(content, 'the content cell renders').toBeGreaterThan(-1);
    expect(label, 'label first in source order, so it is above').toBeLessThan(content);
    expect(html, 'the label no longer takes a column span of its own').not.toContain(`data-cell="label" style="grid-column:span 2`);
  });

  it('carries no right rule of its own: the region stylesheet rules it, per width, and never at the page edge', () => {
    /*
      **A rule at the page's edge is a line the page does not carry.** The
      section once set `border-right: 1px solid` inline for its 1440
      placement, and an inline width beats the generated stylesheet's per-
      width `0` -- so pressing-detail, row-final at eight columns, drew a
      1px vertical down the page's right edge across its 174px (measured at
      1000), and acquisition and tags did the same at four columns, images
      at one. The width now lives only in the stylesheet, which states it per
      breakpoint from the same table as the placement.
    */
    const middle = render(
      <Section name="tags" title="Tags" base={null} shape="one" span={4} start={1}>
        <div />
      </Section>,
    );
    expect(middle, 'no inline border-right at all').not.toMatch(/border-right/);
    const css = regionStylesheet();
    const blocks = css.split('@media');
    /* Emission only: whether the cascade then widens it is `extended-grid.spec.ts`'s "rules every row item but the last". */
    expect(blocks[0], 'the region gives every section a 0-width solid rule to widen, at the width rules’ own specificity').toContain(`:where([data-region="extended-grid"]) > [data-section] { border-right: 0 solid ${SECTION_RULE}; }`);
    expect(blocks[0], 'tags is mid-row at 12 columns').toContain('[data-section="tags"] { border-right-width: 1px; }');
    expect(blocks.find((b) => b.startsWith(' (max-width: 1439px)')), 'pressing-detail ends its row at 8 columns').toContain('[data-section="pressing-detail"] { border-right-width: 0px; }');
    expect(blocks.find((b) => b.startsWith(' (max-width: 959px)')), 'tags ends its row at 4 columns').toContain('[data-section="tags"] { border-right-width: 0px; }');
    expect(middle, `content sits ${CELL_PADDING} inside`).toContain(`padding:${CELL_PADDING}px`);
  });

  it('may shrink to its span, so wide content wraps rather than growing the item', () => {
    /**
     * **A grid item's automatic minimum size is its content**, so without
     * this a section whose content is wider than its columns grows past them
     * instead of wrapping — the same reason the content cells one level down
     * carry it.
     *
     * Stated plainly because it was added on a WRONG diagnosis: About
     * painting over Images was the fork stylesheet forcing `grid-column`
     * without `grid-row`, which put both row-4 sections on one track. This
     * did not fix that and is kept for what it actually does.
     */
    const html = render(
      <Section name="images" title="Images" base={null} shape="one" span={6} start={1}>
        <div />
      </Section>,
    );
    const section = html.slice(html.indexOf('<section'), html.indexOf('>', html.indexOf('<section')));
    expect(section, 'the section may shrink to its span').toContain('min-width:0');
  });

  it('carries the stacking layer itself, so a figure measures against the SECTION, and the solo starts measuring', () => {
    /*
      §25 sizes a figure against the SECTION's height, and §57 sizes the
      Price history solo by the section's free height below its entries. A
      percentage resolves against the positioned ancestor, and the solo
      measures its parent, so that ancestor must be the section: when the
      cell inside it was the positioned box, the figure was measured against
      something shorter and the gate stopped binding.
    */
    const html = render(
      <Section name="price-history" title="Price history" base={null} shape="pair" span={12} start={1} ladder={ladder}>
        <div />
        <div />
      </Section>,
    );
    const section = html.slice(html.indexOf('<section'), html.indexOf('>', html.indexOf('<section')));
    expect(section, 'the section is the positioned box').toContain('position:relative');
    expect(section, 'and clips its own ornament — §26: a figure’s clip is its own cell').toContain('overflow:hidden');
    expect(html, 'the solo renders inside it').toContain('data-ornament="figure"');
    expect(html, '§57: served measuring, sized by the browser against its column’s text').toContain('data-figure-state="measuring"');
    /* §58: hosted in the summary column -- the first content cell -- and nowhere else in the section. */
    const figureAt = html.indexOf('data-ornament="figure"');
    expect(figureAt, 'the solo is inside the first content cell').toBeGreaterThan(html.indexOf('data-cell="content-0"'));
    expect(figureAt).toBeLessThan(html.indexOf('data-cell="content-1"'));
    expect(html.match(/data-ornament="figure"/g), 'one solo, not one per cell and none at the strip').toHaveLength(1);
    const cell = html.slice(html.indexOf('<div', html.indexOf('data-cell="content-0"') - 60), html.indexOf('>', html.indexOf('data-cell="content-0"')));
    expect(cell, 'the column is the figure’s positioned box').toContain('position:relative');
  });
});

describe('an air column is a cell with nothing in it but ornament (§26)', () => {
  it('renders a rule element for every row any width lays, so the stylesheet can show the width’s count', () => {
    const html = render(<ExtendedGrid ladder={ladder}><div /></ExtendedGrid>);
    const count = (html.match(/data-row-rule="\d+"/g) ?? []).length;
    expect(count, `MAX_ROWS (${MAX_ROWS}) rule elements`).toBe(MAX_ROWS);
  });

  it('renders as an addressable item carrying no type', () => {
    const html = render(<ExtendedGrid.Air index={0} ladder={ladder} figure={{ kind: 'pair', forms: ['slab', 'beam'] }} />);
    expect(html).toContain('data-cell="air"');
    /* The row index is what §28's stylesheet places and hides, per width. */
    expect(html).toContain('data-air="0"');
    expect(html, 'nothing places it inline').not.toContain('grid-column');
    expect(html, 'the pair sits in it').toContain('data-figure="pair"');
    /* Air carries no label and no rule: it is where the rhythm makes room, not a cell with empty content. */
    expect(html).not.toContain('data-cell="label"');
  });

  it('renders empty when the record gives it no ornament, rather than vanishing', () => {
    const html = render(<ExtendedGrid.Air index={0} ladder={null} figure={null} />);
    expect(html, 'the air still holds the row’s shape').toContain('data-cell="air"');
    expect(html).not.toContain('data-ornament');
  });
});

/**
 * §54 (step 62): the flats beside a section and in the air column draw with
 * no ladder, at ink; the figures (§25's solids, not among §5.1's eight) stay
 * gated on a ladder. Before this, `{ladder !== null && <Flat …>}` dropped
 * the quarter-disc in Images and the region's triangle on the one no-cover
 * record, which §5.3 forbids.
 */
describe('§54: the flats draw on a null ladder, at ink', () => {
  it('draws the quarter-disc beside Images with no ladder', () => {
    const html = render(<Section name="images" title="Images" base={null} shape="one" span={12} start={1} ladder={null}><div /></Section>);
    expect(html).toContain('data-flat="quarterDisc"');
    expect(html).toContain('background:oklch(0.19 0.008 60)');
  });
  it('draws the triangle in the air column with no ladder, and still no figure', () => {
    const html = render(<ExtendedGrid.Air index={0} ladder={null} figure={{ kind: 'pair', forms: ['slab', 'beam'] }} flat={FLATS.left} />);
    expect(html).toContain('data-flat="triangle"');
    expect(html).toContain('background:oklch(0.19 0.008 60)');
    expect(html, 'figures are not among the eight and keep their gate').not.toContain('data-figure');
  });
});
