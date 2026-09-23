import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import '../../test/component/next-navigation';
import { WallRail } from './WallRail';
import { parseCollectionParams } from './collection-params';
import { LABEL } from './records/[id]/grid-type';

/**
 * §W.13: the header band is withdrawn and the page's controls go down a
 * 148px rail on the left — SEARCH at the head (a ruled field, §9.3's 34px
 * control), the three views stacked as a list with the current one marked
 * the way this page marks a current thing (ink against muted, the 44 × 4
 * bar, no box), and Add record at the foot below a rule that bleeds to both
 * edges of the rail. The rail carries no identity: COLLECTION and the count
 * stay at the facts column's head (§W.9).
 */
const GENRES = [
  { id: '00000000-0000-4000-8000-00000000000a', name: 'Punk', count: 12 },
  { id: '00000000-0000-4000-8000-00000000000b', name: 'Jazz', count: 3 },
];
const render = (search = '') => renderToStaticMarkup(<WallRail params={parseCollectionParams(new URLSearchParams(search))} genres={GENRES} />);
const at = (html: string, marker: string) => {
  const index = html.indexOf(marker);
  expect(index, marker).toBeGreaterThan(-1);
  return index;
};

describe('the rail (§W.13)', () => {
  it('is 148px wide, LABEL throughout, and runs SEARCH, GENRE, SORT, then SHELF · TABLE · GRID, then a full-bleed rule, then ADD RECORD', () => {
    const html = render();
    expect(html).toMatch(/data-testid="wall-rail"[^>]*width:\s*148px/);
    const order = ['role="search"', 'for="rail-search"', 'for="rail-genre"', 'for="rail-sort"', '>Shelf<', '>Table<', '>Grid<', 'data-rail-rule=""', 'href="/records/new"'].map((m) => at(html, m));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const cls of LABEL.split(' ')) expect(html, cls).toContain(cls);
    expect(html).not.toContain('COLLECTION');
  });

  it('marks the current view with aria-current and the 44 × 2 bar (§W.31), and no box, pill or field around any view', () => {
    const shelf = render();
    expect(shelf).toMatch(/aria-current="page"[^>]*>Shelf</);
    expect(shelf).toMatch(/>Shelf<\/a>\s*<span[^>]*data-current-bar=""[^>]*width:\s*44px;\s*height:\s*2px/);
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

  /*
    §W.24: the filter belongs in the rail. §W.12 forces it — a filter that
    empties seats produces a shape on the fixture, and an empty seat you did
    not watch empty is indistinguishable from a gap in the collection — so
    GENRE and SORT sit under SEARCH in the same vocabulary, and the round
    trip through the table's chips stops being the only route.
  */
  describe('GENRE and SORT under SEARCH (§W.24)', () => {
    it('offers every genre facet with its rolled-up count, Any first, the current one selected — as a ruled field, not a box', () => {
      const html = render(`genreId=${GENRES[1].id}`);
      const select = /<select[^>]*id="rail-genre"[^>]*>[\s\S]*?<\/select>/.exec(html)?.[0] ?? '';
      expect(select).toMatch(/name="genreId"/);
      expect(select).toMatch(/<option[^>]*value=""[^>]*>Any<\/option>/);
      expect(select).toMatch(/<option[^>]*value="00000000-0000-4000-8000-00000000000a"[^>]*>Punk 12<\/option>/);
      expect(select).toMatch(/<option[^>]*value="00000000-0000-4000-8000-00000000000b"[^>]*selected[^>]*>Jazz 3<\/option>/);
      expect(select).toContain('h-[34px]');
      expect(select).toContain('border-b');
      expect(select).toContain('font-mono');
      expect(select).not.toMatch(/rounded/);
      expect(select).not.toMatch(/\bborder\b(?!-)/);
      expect(html).toMatch(/<label[^>]*for="rail-genre"[^>]*>Genre<\/label>/);
    });

    it('offers the sort fields in both directions with Default first, the current one selected', () => {
      const html = render('sort=releaseYear:desc');
      const select = /<select[^>]*id="rail-sort"[^>]*>[\s\S]*?<\/select>/.exec(html)?.[0] ?? '';
      expect(select).toMatch(/name="sort"/);
      expect(select).toMatch(/<option[^>]*value=""[^>]*>Default<\/option>/);
      expect(select).toMatch(/<option[^>]*value="title:asc"[^>]*>Title ↑<\/option>/);
      expect(select).toMatch(/<option[^>]*value="releaseYear:desc"[^>]*selected[^>]*>Year ↓<\/option>/);
      expect(html).toMatch(/<label[^>]*for="rail-sort"[^>]*>Sort<\/label>/);
    });

    it('is one GET form: search, genre and sort are its fields, the other filters ride as hidden inputs, and a submit exists for JavaScript off', () => {
      const html = render(`artistId=00000000-0000-4000-8000-000000000001&genreId=${GENRES[0].id}&sort=title:asc&q=wired`);
      const form = /<form[^>]*role="search"[\s\S]*?<\/form>/.exec(html)?.[0] ?? '';
      for (const own of ['q', 'genreId', 'sort']) expect(form, `${own} is a field, not a hidden input`).not.toMatch(new RegExp(`type="hidden"[^>]*name="${own}"`));
      expect(form).toMatch(/<input[^>]*type="hidden"[^>]*name="artistId"/);
      expect(form).toMatch(/<select[^>]*name="genreId"/);
      expect(form).toMatch(/<select[^>]*name="sort"/);
      expect(form).toMatch(/<button[^>]*type="submit"[^>]*>Apply<\/button>/);
    });

    it('draws no genre line when the collection has no genre facets, and keeps the sort', () => {
      const html = renderToStaticMarkup(<WallRail params={parseCollectionParams(new URLSearchParams())} genres={[]} />);
      expect(html).not.toContain('rail-genre');
      expect(html).toContain('rail-sort');
    });
  });
});

describe('§W.36: the set bar leaves the flow', () => {
  /*
    A mark is not content, so it cannot push. In flow the 44-wide bar
    displaced its neighbours — GRID sat 8px lower when SHELF was active than
    when it was not, so the rail's spacing encoded state — and under §W.32
    the same bar marks a set filter, which sits ABOVE the switcher: a set
    genre would have moved the control you choose the view with. Position in
    the rail is the reader's map of the page's controls, and a map that
    shifts when you use it is not one.
  */
  const barOf = (html: string, marker: string) => new RegExp(`<span[^>]*${marker}[^>]*>`).exec(html)?.[0] ?? '';

  it('draws the set bar out of flow, against the label’s baseline, occupying no height', () => {
    const bar = barOf(render(), 'data-current-bar');
    expect(bar, 'the bar is drawn').not.toBe('');
    expect(bar, 'positioned rather than stacked').toMatch(/absolute/);
    expect(bar, 'still 44 wide at §W.31’s 2px').toMatch(/width:\s*44px/);
    expect(bar).toMatch(/height:\s*2px/);
  });

  it('gives a set filter’s bar the same treatment, so choosing a genre moves nothing', () => {
    const bar = barOf(render(`genreId=${GENRES[0].id}`), 'data-set-bar');
    expect(bar).not.toBe('');
    expect(bar).toMatch(/absolute/);
  });

  it('leaves each view name’s own box unchanged whether it is set or not — the pitch is the type’s', () => {
    /*
      The bar contributes no height, so the element that carries it is the
      same element it would be without one: nothing in the switcher's flow
      differs between the set and unset states but the bar's presence.
    */
    /*
      The bar contributes no height, so the list item carrying it is laid out
      exactly as one without: same classes, and the mark positioned against
      the label's baseline rather than stacked beneath it.
    */
    const liOf = (html: string, view: string) => new RegExp(`<li[^>]*>(?:(?!</li>)[\\s\\S])*?>${view}<[\\s\\S]*?</li>`).exec(html)?.[0] ?? '';
    const setShelf = liOf(render(), 'Shelf');
    const unsetShelf = liOf(render('view=table'), 'Shelf');
    expect(setShelf, 'the active view carries the mark').toContain('data-current-bar');
    expect(unsetShelf, 'and an inactive one does not').not.toContain('data-current-bar');
    /* The <li> itself is identical either way: nothing in the flow changes with the mark. */
    const openOf = (li: string) => /<li[^>]*>/.exec(li)?.[0] ?? '';
    expect(openOf(setShelf)).toBe(openOf(unsetShelf));
    expect(openOf(setShelf), 'positioned, so the bar anchors without displacing').toContain('relative');
  });
});
