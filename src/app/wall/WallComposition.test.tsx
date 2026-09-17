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
  it('sets COLLECTION as a field label and the count at the display size, on the left third', () => {
    const html = render(17);
    const left = html.slice(html.indexOf('data-region="count"'), html.indexOf('data-region="wall"'));
    expect(left).toContain('COLLECTION');
    /* The record screen's own label vocabulary, by import — not a second 11px. */
    for (const cls of LABEL.split(' ')) expect(left, cls).toContain(cls);
    expect(left).toMatch(/text-display[^>]*>17</);
  });

  it('gives the wall the right two-thirds and paints the drawn paper as the ground', () => {
    const html = render(17);
    expect(html).toContain('data-region="wall"');
    expect(html).toMatch(/data-region="wall"[^>]*col-span-2/);
    /* D1: 1:1 and pans — the region scrolls the drawing rather than scaling it. */
    expect(html).toMatch(/data-region="wall"[^>]*overflow-auto/);
    expect(html).toMatch(/data-composition[^>]*oklch\(0\.925 0\.004 80\)/);
    /* The svg owns no ground of its own: one paper, the page's. */
    const svg = /<svg[^>]*data-wall="labelled"[^>]*>/.exec(html)?.[0] ?? '';
    expect(svg).not.toContain('background');
  });

  it('stacks four shelves for seventeen records, and draws nothing else — no carcass', () => {
    const html = render(17);
    const planes = html.split('data-plane=""').length - 1;
    const polygons = html.split('<polygon').length - 1;
    expect(planes).toBe(4);
    expect(polygons, 'planes plus three faces per record, nothing around them').toBe(4 + 17 * 3);
  });
});
