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
    const reasonTag = /<p data-grid-reason=""[^>]*class="([^"]*)"[^>]*>([^<]*)<\/p>/.exec(html);
    expect(reasonTag?.[2], 'the model’s sentence, whole').toBe(reason);
    expect(reasonTag?.[1] ?? '', 'the prose register, as the slot’s message is').toContain('text-prose');
  });

  it('draws no reason where the cell carries none, so the grid’s own cells are unchanged', () => {
    const html = renderToStaticMarkup(<GridCell {...props} />);
    expect(html).not.toContain('data-grid-reason');
    expect(renderToStaticMarkup(<GridCell {...props} reason={null} />)).not.toContain('data-grid-reason');
  });
});
