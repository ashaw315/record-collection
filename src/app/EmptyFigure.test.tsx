import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EmptyFigure } from './EmptyFigure';

/** Every fill the markup draws with. */
const fills = (html: string) => new Set([...html.matchAll(/fill="([^"]+)"/g)].map((m) => m[1]));
const SOURCE = { id: 'bac64213-9673-4ae7-862f-fc5b17dc16d3', clearing: 193.2, aspect: 0.966, firstDraws: 1006 };

/**
 * Step 122, §T.6: "The empty state's figure is this construction in tint
 * at the clearing height", on every screen with an empty state; the
 * figures "in ink alone" were withdrawn (`T.6/ink-construction`). Look up
 * and the want list drew theirs with no colour passed at all.
 */
describe('an empty state’s figure', () => {
  it('is drawn in the source record’s tint, and says which', () => {
    const tinted = renderToStaticMarkup(<EmptyFigure source={SOURCE} tint="#6e636a" />);
    const ink = renderToStaticMarkup(<EmptyFigure source={SOURCE} tint={null} />);
    expect(tinted).toContain('data-tint="#6e636a"');
    const colours = [...fills(tinted)].filter((fill) => !fills(ink).has(fill));
    expect(colours.length, 'fills the ink drawing does not have').toBeGreaterThan(0);
  });

  it('is in ink where the source has no cover, and so no colour (§5.3)', () => {
    const html = renderToStaticMarkup(<EmptyFigure source={SOURCE} tint={null} />);
    expect(html).toContain('data-tint=""');
  });

  it('stands at the clearing height and its own proportion, and no larger', () => {
    const html = renderToStaticMarkup(<EmptyFigure source={SOURCE} tint={null} />);
    expect(html).toMatch(/height:193\.2px/);
    expect(html).toMatch(new RegExp(`width:${(193.2 * 0.966).toString().replace('.', '\\.')}px`));
  });

  it('is nothing where the collection is empty and there is no source', () => {
    expect(renderToStaticMarkup(<EmptyFigure source={null} tint={null} />)).toBe('');
  });
});
