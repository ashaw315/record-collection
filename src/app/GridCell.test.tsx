import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GridCell } from './GridCell';

/**
 * **Step 3, unit 3a: the answer's reason (the Mood Pick target §P.2; the coordinator, 17 Nov).** "Every answer of the
 * ask carries its reason: one sentence, in the reader's terms of sound and occasion ... in the table and the grid
 * beneath each cover's caption." The grid's cell and the answer's cell are one component (§P.4), so the reason is the
 * cell's, drawn only where an answer carries one: the grid's own cells carry none. Fails against a cell with no reason
 * prop (GridCell.tsx:12).
 */
const props = { id: 'r1', title: 'Wired', artist: 'Jeff Beck', cover: null };
const reason = 'Slow and spacious with abrasive peaks, for a late room that wants attention rather than company.';

describe('GridCell with a reason (§P.2)', () => {
  it('draws the reason beneath the caption, after the artist, in the prose register', () => {
    const html = renderToStaticMarkup(<GridCell {...props} reason={reason} />);
    const at = (marker: string) => html.indexOf(marker);
    expect(at('data-grid-reason'), 'the reason is drawn').toBeGreaterThan(-1);
    expect(at('data-grid-reason'), 'beneath the artist, which ends the caption').toBeGreaterThan(at('data-grid-artist'));
    /* Moved with §67's sheet (24 Nov): the reason is the button that opens the correcting sheet, so the sentence sits inside it; it is still whole and in the prose register. */
    const reasonTag = /<p data-grid-reason=""[^>]*class="([^"]*)"[^>]*><button[^>]*data-open-sheet=""[^>]*>([^<]*)<\/button><\/p>/.exec(html);
    expect(reasonTag?.[2], 'the model’s sentence, whole, as the sheet’s button').toBe(reason);
    expect(reasonTag?.[1] ?? '', 'the prose register, as the slot’s message is').toContain('text-prose');
  });

  /* §P.2: "a record beside [the nothing-fits message] is a consolation ... labelled as the closest available", so it never reads as an answer. "Closest available" is Proposed. */
  it('labels a consolation "Closest available" before its cover, in the label register, and labels an answer not at all', () => {
    const html = renderToStaticMarkup(<GridCell {...props} reason={reason} consolation />);
    const label = /<p data-grid-consolation=""[^>]*class="([^"]*)"[^>]*>([^<]*)<\/p>/.exec(html);
    expect(label?.[2]).toBe('Closest available');
    expect(label?.[1] ?? '', 'the label register').toContain('uppercase');
    expect(html.indexOf('data-grid-consolation'), 'before the cover').toBeLessThan(html.indexOf('data-grid-cover'));
    expect(renderToStaticMarkup(<GridCell {...props} reason={reason} />)).not.toContain('data-grid-consolation');
  });

  it('draws no reason where the cell carries none, so the grid’s own cells are unchanged', () => {
    const html = renderToStaticMarkup(<GridCell {...props} />);
    expect(html).not.toContain('data-grid-reason');
    expect(renderToStaticMarkup(<GridCell {...props} reason={null} />)).not.toContain('data-grid-reason');
  });
});
