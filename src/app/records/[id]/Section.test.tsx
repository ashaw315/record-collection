import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { recordLadder } from '@/lib/colour/record-ladder';
import { ExtendedGrid, Section } from './Section';
import { CELL_PADDING } from './extended-grid';

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
  it('spans the columns the row gives it, and starts where the row puts it', () => {
    const html = render(
      <Section name="market" title="Market" base={null} shape="pair" span={4} start={5}>
        <div>a</div>
        <div>b</div>
      </Section>,
    );
    expect(html, 'placed explicitly, so a row cannot reflow into a different shape').toContain('grid-column:5 / span 4');
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

  it('holds its content at 34px and rules its right edge unless it ends the row', () => {
    const middle = render(
      <Section name="tags" title="Tags" base={null} shape="one" span={4} start={1} endsRow={false}>
        <div />
      </Section>,
    );
    const last = render(
      <Section name="tags" title="Tags" base={null} shape="one" span={4} start={9} endsRow>
        <div />
      </Section>,
    );
    expect(middle, 'a section mid-row is ruled on its right').toContain('border-right:1px solid');
    expect(last, 'the row’s last section is not — the page edge is there').not.toContain('border-right:1px solid');
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

  it('carries the stacking layer itself, so a figure sizes against the SECTION', () => {
    /*
      §25 sizes a figure at 0.855 of the SECTION's height. A percentage
      resolves against the positioned ancestor, so that ancestor must be the
      section: when the cell inside it was the positioned box, the figure was
      measured against something shorter and the gate stopped binding.
    */
    const html = render(
      <Section name="price-history" title="Price history" base={null} shape="pair" span={12} start={1} ladder={ladder}>
        <div />
      </Section>,
    );
    const section = html.slice(html.indexOf('<section'), html.indexOf('>', html.indexOf('<section')));
    expect(section, 'the section is the positioned box').toContain('position:relative');
    expect(section, 'and clips its own ornament — §26: a figure’s clip is its own cell').toContain('overflow:hidden');
    expect(html, 'the solo renders inside it').toContain('data-ornament="figure"');
  });
});

describe('an air column is a cell with nothing in it but ornament (§26)', () => {
  it('renders as a placed item carrying no type', () => {
    const html = render(<ExtendedGrid.Air span={5} start={8} ladder={ladder} figure={{ kind: 'pair', forms: ['slab', 'beam'] }} />);
    expect(html).toContain('data-cell="air"');
    expect(html).toContain('grid-column:8 / span 5');
    expect(html, 'the pair sits in it').toContain('data-figure="pair"');
    /* Air carries no label and no rule: it is where the rhythm makes room, not a cell with empty content. */
    expect(html).not.toContain('data-cell="label"');
  });

  it('renders empty when the record gives it no ornament, rather than vanishing', () => {
    const html = render(<ExtendedGrid.Air span={5} start={8} ladder={null} figure={null} />);
    expect(html, 'the air still holds the row’s shape').toContain('data-cell="air"');
    expect(html).not.toContain('data-ornament');
  });
});
