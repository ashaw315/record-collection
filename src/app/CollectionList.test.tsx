import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import '../../test/component/next-navigation';
import { CollectionList } from './CollectionList';
import { parseCollectionParams } from './collection-params';

/**
 * The table's and the grid's empty state says what is true.
 *
 * It said "No records yet." whatever emptied it, so a reader with seventeen
 * records whose filter or search matched nothing was told they had none
 * (found measuring for step 103e, 9 Oct). With records in the collection it
 * says what the shelf's ruled empty state says (§W.29, step 104), so the
 * two screens agree. Design rules the final wording with step 103e; this
 * removes a false statement.
 */
const render = (search: string, collectionTotal: number, view: 'table' | 'grid' = 'table') =>
  renderToStaticMarkup(<CollectionList rows={[]} params={parseCollectionParams(new URLSearchParams(search))} view={view} collectionTotal={collectionTotal} />);

describe('the empty state’s sentence', () => {
  for (const view of ['table', 'grid'] as const) {
    /* Fails against the sentence as built: "No records yet." with seventeen in the collection. */
    it(`${view}: with records in the collection and none shown, it says nothing matches, and does not say there are none`, () => {
      for (const search of ['q=zzzz', 'genreId=00000000-0000-4000-8000-00000000000a', 'page=9', '']) {
        const html = render(search, 17, view);
        expect(html, search).toContain('Nothing in the collection matches.');
        expect(html, search).not.toContain('No records yet');
      }
    });

    it(`${view}: with an empty collection it says there are no records yet`, () => {
      const html = render('', 0, view);
      expect(html).toContain('No records yet.');
      expect(html).not.toContain('Nothing in the collection matches');
    });
  }
});

/**
 * Step 103e, §T.6: "The empty state's figure is drawn at the clearing
 * height and no larger, and stands where a screen's whole list or view is
 * empty... above one sentence saying what is empty and a §9.3 control that
 * changes it, such as CLEAR FILTERS." "'No records yet.' only where the
 * collection is empty, which has no figure."
 */
describe('the empty state’s figure, sentence and control', () => {
  const figure = <svg data-probe-figure="" />;
  const draw = (search: string, collectionTotal: number, view: 'table' | 'grid') =>
    renderToStaticMarkup(<CollectionList rows={[]} params={parseCollectionParams(new URLSearchParams(search))} view={view} collectionTotal={collectionTotal} emptyFigure={figure} />);

  for (const view of ['table', 'grid'] as const) {
    /* Fails against the empty state as built: a sentence in a box, no figure and no control. */
    it(`${view}: the figure, then the sentence, then CLEAR FILTERS, which keeps the view and the order and drops the search and every filter`, () => {
      const html = draw(`view=${view}&q=zzzz&genreId=00000000-0000-4000-8000-00000000000a&sort=title:desc&page=3`, 17, view);
      const order = ['data-probe-figure', 'Nothing in the collection matches.', 'data-collection-empty-clear'].map((m) => html.indexOf(m));
      expect(order.every((i) => i > -1), html).toBe(true);
      expect(order, 'figure, sentence, control').toEqual([...order].sort((a, b) => a - b));
      const href = /<a[^>]*data-collection-empty-clear[^>]*>/.exec(html)?.[0] ?? '';
      expect(href).toContain(`view=${view}`);
      expect(href).toContain('sort=title%3Adesc');
      expect(href).not.toMatch(/q=|genreId=|page=/);
      expect(html).toMatch(/data-collection-empty-clear[^>]*>Clear filters</);
    });

    /* "Which has no figure": fails against a figure drawn whenever one is handed over. */
    it(`${view}: an empty collection has the sentence alone, no figure and no control`, () => {
      const html = draw(`view=${view}`, 0, view);
      expect(html).toContain('No records yet.');
      expect(html).not.toContain('data-probe-figure');
      expect(html).not.toContain('data-collection-empty-clear');
    });
  }
});


/**
 * The Genre column (§T.4): after Record, its header the
 * Genre order's control, each top-level genre its own element so the
 * separator is drawn between them and never enters the text, nothing for a
 * record with none, and below 768 the genres first on the row's second line
 * where Label goes. Each fails against the table as built, which has no
 * Genre column.
 */
describe('the Genre column', () => {
  const row = (title: string, topGenres: string[], label: string | null) => ({
    id: `00000000-0000-4000-8000-00000000000${title.length % 10}`,
    title,
    releaseYear: 1975,
    conditionMedia: 'VG+' as string | null,
    purchasePrice: null,
    artist: { id: 'a', name: 'Artist' },
    label: label === null ? null : { id: 'l', name: label },
    format: null,
    store: null,
    matchedVia: null,
    topGenres,
  });
  const table = (rows: ReturnType<typeof row>[], search = '') =>
    renderToStaticMarkup(<CollectionList rows={rows} params={parseCollectionParams(new URLSearchParams(search))} collectionTotal={rows.length} />);
  const cells = (html: string) => Array.from(html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)).map((m) => Array.from(m[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)).map((c) => c[1]));

  it('stands immediately after Record, its header the Genre order’s control', () => {
    const html = table([row('Wired', ['Jazz', 'Rock'], 'Epic')]);
    const heads = cells(html)[0].map((h) => h.replace(/<[^>]+>/g, '').replace(/ [↑↓]$/, ''));
    expect(heads).toEqual(['Record', 'Genre', 'Label', 'Format', 'Year', 'Cond.', 'Paid']);
    expect(cells(html)[0][1], 'a link sorting by genre').toMatch(/data-sort-header[^>]*href="\/\?sort=genre%3Aasc"|href="\/\?sort=genre%3Aasc"[^>]*data-sort-header/);
  });

  it('marks its header sorted when the Genre order is', () => {
    const html = table([row('Wired', ['Jazz', 'Rock'], 'Epic')], 'sort=genre:asc');
    expect(html).toMatch(/aria-sort="ascending"[^>]*>(?:(?!<\/th>)[\s\S])*Genre/);
  });

  it('sets each genre as its own element, in the order given, with no separator in the text', () => {
    const html = table([row('The Hurdy Gurdy Man', ['Folk, World, & Country', 'Rock'], 'Epic')]);
    const cell = cells(html)[1][1];
    expect(Array.from(cell.matchAll(/<span[^>]*data-genre=""[^>]*>([^<]*)<\/span>/g)).map((m) => m[1])).toEqual(['Folk, World, &amp; Country', 'Rock']);
    expect(cell.replace(/<[^>]+>/g, ''), 'the dot is drawn, not written').not.toContain('·');
  });

  it('leaves a genreless record’s cell empty: no dash, nothing drawn', () => {
    const cell = cells(table([row('Never Too Much', [], 'Epic')]))[1][1];
    expect(cell).toBe('');
  });

  it('puts the genres first on the second line below 768, where Label goes, each its own element', () => {
    const html = table([row('Wired', ['Jazz', 'Rock'], 'Epic')]);
    const line = /<div[^>]*md:hidden[^>]*>([\s\S]*?)<\/div>/.exec(cells(html)[1][0])?.[1] ?? '';
    expect(Array.from(line.matchAll(/data-genre=""[^>]*>([^<]*)</g)).map((m) => m[1])).toEqual(['Jazz', 'Rock']);
    expect(line.indexOf('data-genre'), 'genres before the label').toBeLessThan(line.indexOf('Epic'));
  });

  it('still draws the second line for a record with genres and no label or condition', () => {
    const html = table([{ ...row('Wired', ['Jazz'], null), conditionMedia: null }]);
    expect(cells(html)[1][0]).toMatch(/md:hidden[\s\S]*data-genre=""[^>]*>Jazz</);
  });
});
