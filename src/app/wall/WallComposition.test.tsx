import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import '../../../test/component/next-navigation';
import { WallComposition } from './WallComposition';
import type { WallSeat } from './shelf-runs';
import { LABEL } from '../records/[id]/grid-type';

/**
 * The composition (D2, from the reference): four shelves stacked on the right
 * two-thirds, COLLECTION and the count at 72 on the left third, in the record
 * screen's vocabulary. No carcass — the reference's case around the whole
 * thing reads as furniture in a room rather than as a wall.
 */
const seats = (count: number): WallSeat[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `r${index}`,
    section: 'S',
    label: `Artist ${index} · Title`,
    title: 'Title',
    artist: `Artist ${index}`,
    spineColour: null,
    coverUrl: null,
    backUrl: null,
    labelName: null,
    catalogNumber: null,
  }));

const render = (count: number) => renderToStaticMarkup(<WallComposition seats={seats(count)} />);

describe('the wall composition', () => {
  it('sets COLLECTION as a field label and the count at the display size, at the facts column’s head', () => {
    const html = render(17);
    const left = html.slice(html.indexOf('data-region="count"'), html.indexOf('data-region="wall"'));
    expect(left).toContain('COLLECTION');
    /* The record screen's own label vocabulary, by import — not a second 11px. */
    for (const cls of LABEL.split(' ')) expect(left, cls).toContain(cls);
    expect(left).toMatch(/text-display[^>]*>17</);
  });

  it('gives the facts a 420px column and the drawing the rest (§11.13), and paints the drawn paper as the ground', () => {
    const html = render(17);
    expect(html).toContain('data-region="wall"');
    expect(html).toMatch(/grid-cols-\[420px_1fr\]/);
    expect(html).not.toContain('col-span-2');
    /* D1: 1:1 and pans — the region scrolls the drawing rather than scaling it. */
    expect(html).toMatch(/data-region="wall"[^>]*overflow-auto/);
    /* §11.9: facts left, drawing right — the panel's region below the count. */
    expect(html.indexOf('data-region="facts"')).toBeLessThan(html.indexOf('data-region="wall"'));
    expect(html).toContain('data-testid="panel-region"');
    expect(html).toMatch(/data-composition[^>]*oklch\(0\.925 0\.004 80\)/);
    /* The svg owns no ground of its own: one paper, the page's. */
    const svg = /<svg[^>]*data-wall="labelled"[^>]*>/.exec(html)?.[0] ?? '';
    expect(svg).not.toContain('background');
  });

  it('puts seventeen records on the top shelf of one unit (§11.10), and draws the unit — nothing else', () => {
    const html = render(17);
    const furniture = html.split('data-furniture=').length - 1;
    const polygons = html.split('<polygon').length - 1;
    /* Two uprights and four shelves, three faces each: the fixture, empty shelves drawn. */
    expect(furniture).toBe(18);
    expect(polygons, 'the unit plus three faces per record, no back, no front, no top').toBe(18 + 17 * 3);
  });
});

describe('the rail slot (§11.13)', () => {
  it('puts the rail in a 148px column left of the facts when given one, and takes the full height under the nav', () => {
    const html = renderToStaticMarkup(<WallComposition seats={seats(3)} rail={<nav data-testid="wall-rail">rail</nav>} />);
    expect(html).toMatch(/grid-cols-\[148px_1fr\]/);
    expect(html.indexOf('data-testid="wall-rail"')).toBeLessThan(html.indexOf('data-region="facts"'));
    expect(html).toContain('calc(100vh - var(--app-nav-height, 0px))');
    const bare = render(3);
    expect(bare).not.toContain('grid-cols-[148px_1fr]');
    expect(bare).not.toContain('wall-rail');
  });
});
