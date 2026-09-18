import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import '../../test/component/next-navigation';
import { WallRail } from './WallRail';
import { parseCollectionParams } from './collection-params';
import { LABEL } from './records/[id]/grid-type';

/**
 * §11.13: the header band is withdrawn and the page's controls go down a
 * 148px rail on the left — SEARCH at the head (a ruled field, §9.3's 34px
 * control), the three views stacked as a list with the current one marked
 * the way this page marks a current thing (ink against muted, the 44 × 4
 * bar, no box), and Add record at the foot below a rule that bleeds to both
 * edges of the rail. The rail carries no identity: COLLECTION and the count
 * stay at the facts column's head (§11.9).
 */
const render = (search = '') => renderToStaticMarkup(<WallRail params={parseCollectionParams(new URLSearchParams(search))} />);
const at = (html: string, marker: string) => {
  const index = html.indexOf(marker);
  expect(index, marker).toBeGreaterThan(-1);
  return index;
};

describe('the rail (§11.13)', () => {
  it('is 148px wide, LABEL throughout, and runs SEARCH, then SHELF · TABLE · GRID, then a full-bleed rule, then ADD RECORD', () => {
    const html = render();
    expect(html).toMatch(/data-testid="wall-rail"[^>]*width:\s*148px/);
    const order = ['role="search"', '>Shelf<', '>Table<', '>Grid<', 'data-rail-rule=""', 'href="/records/new"'].map((m) => at(html, m));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const cls of LABEL.split(' ')) expect(html, cls).toContain(cls);
    expect(html).not.toContain('COLLECTION');
  });

  it('marks the current view with aria-current and the 44 × 4 bar, and no box, pill or field around any view', () => {
    const shelf = render();
    expect(shelf).toMatch(/aria-current="page"[^>]*>Shelf</);
    expect(shelf).toMatch(/>Shelf<\/a>\s*<span[^>]*data-current-bar=""[^>]*width:\s*44px;\s*height:\s*4px/);
    expect(shelf).not.toMatch(/aria-current="page"[^>]*>Table</);
    const table = render('view=table');
    expect(table).toMatch(/aria-current="page"[^>]*>Table</);
    for (const view of ['Shelf', 'Table', 'Grid']) {
      const link = new RegExp(`<a [^>]*>${view}</a>`).exec(shelf)?.[0] ?? '';
      expect(link, `${view} carries no box`).not.toMatch(/border|rounded|bg-/);
    }
  });

  it('links the views with the current filters kept, and the search submits the same URL without JavaScript', () => {
    const html = render('artistId=00000000-0000-4000-8000-000000000001&q=wired');
    expect(html).toMatch(/href="\/\?[^"]*artistId=00000000-0000-4000-8000-000000000001[^"]*view=table"/);
    expect(html).toMatch(/href="\/\?[^"]*q=wired[^"]*view=grid"/);
    /* SHELF is the default view: its link keeps the filters and carries no view key. */
    const shelfHref = /<a [^>]*href="([^"]+)"[^>]*>Shelf</.exec(html)?.[1] ?? '';
    expect(shelfHref).toContain('artistId=00000000-0000-4000-8000-000000000001');
    expect(shelfHref).toContain('q=wired');
    expect(shelfHref).not.toContain('view=');
    /* A GET form to / with the filters as hidden inputs, the term in `q`: the browser submits it with JavaScript off. */
    expect(html).toMatch(/<form[^>]*role="search"[^>]*action="\/"[^>]*method="get"/);
    expect(html).toMatch(/<input[^>]*type="hidden"[^>]*name="artistId"/);
    expect(html).toMatch(/<input[^>]*name="q"[^>]*value="wired"/);
  });

  it('draws the search as §9.3’s ruled field: 34px, a 1px ink underline, the 16px sans line, no box', () => {
    const html = render();
    const input = /<input[^>]*name="q"[^>]*>/.exec(html)?.[0] ?? '';
    expect(input).toContain('h-[34px]');
    expect(input).toContain('border-b');
    expect(input).toContain('text-[16px]');
    expect(input).toContain('font-sans');
    /* An underline, not a box: no rounding, no all-sides border — the only border class is the bottom one and its colour. */
    expect(input).not.toMatch(/rounded/);
    expect(input).not.toMatch(/\bborder\b(?!-)/);
    expect(input).not.toMatch(/border-[tlrx]\b|border-y\b/);
    expect(html).toMatch(/<label[^>]*for="rail-search"[^>]*>Search<\/label>/);
  });
});
