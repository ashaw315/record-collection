import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SheetView, type SheetViewProps } from './SheetView';

/**
 * **§67's sheet, its structure (step 3; the coordinator's go, 23 Nov).** The reason as its head, the text a sentence at a
 * time with one open for editing, no support marking on any sentence, Clear only where an edit exists, the mechanical
 * checks beside the sentences at one line, and the page's asking line before a clear or a close with a change unsaved.
 * Fails against a sheet that draws a basis mark, one that draws Clear with no edit to clear, one that opens no sentence
 * where one is named, and one that closes a dirty sheet without asking.
 */
const sentences = ['Taped for Vol. 2 in 2019 and shelved.', 'Issued on XL.', 'Side two is quieter, with a duet near its end.'];
const base: SheetViewProps = {
  reason: 'Quiet enough for a rainy afternoon, with a duet near the end of side two.',
  sentences,
  openIndex: 2,
  draft: 'Side two is quieter, with a duet near its end.',
  hasEdit: false,
  dirty: false,
  checks: null,
  asking: null,
  error: null,
  onOpen: () => undefined,
  onDraft: () => undefined,
  onCommit: () => undefined,
  onSave: () => undefined,
  onClear: () => undefined,
  onClose: () => undefined,
  onAnswer: () => undefined,
};
const render = (props: Partial<SheetViewProps> = {}) => renderToStaticMarkup(<SheetView {...base} {...props} />);

describe('SheetView', () => {
  it('heads with the reason, sets the sentences out in order, the named one open as a field holding its text and the others pressable', () => {
    const html = render();
    expect(html).toMatch(/role="dialog"/);
    expect(html.indexOf('data-sheet-head'), 'the head first').toBeLessThan(html.indexOf('data-sheet-sentences'));
    expect(html).toContain(base.reason);
    const items = [...html.matchAll(/<li data-sheet-sentence="" data-index="(\d)"/g)].map((m) => m[1]);
    expect(items).toEqual(['0', '1', '2']);
    expect(html).toMatch(/<textarea[^>]*data-sheet-open=""[^>]*>Side two is quieter, with a duet near its end\.<\/textarea>/);
    expect((html.match(/<button[^>]*data-sheet-sentence-button=""/g) ?? []).length, 'the two others are buttons').toBe(2);
  });

  it('shows no support marking on any sentence', () => {
    const html = render({ checks: { dropped: [], disagreements: [], numbered: [1] } });
    expect(html).not.toMatch(/\[supported\]|\[inferred\]|data-basis|supported|inferred/);
  });

  it('draws Clear only where an edit exists, Save only when something changed, and Close always', () => {
    expect(render()).not.toContain('data-sheet-clear');
    expect(render({ hasEdit: true })).toContain('data-sheet-clear');
    /* The attribute, not the class: CONTROL carries `disabled:` utilities, which the first form of this matched. */
    expect(render({ dirty: false })).toMatch(/<button[^>]*data-sheet-save=""[^>]*\sdisabled=""/);
    expect(render({ dirty: true })).not.toMatch(/<button[^>]*data-sheet-save=""[^>]*\sdisabled=""/);
    expect(render()).toContain('data-sheet-close');
  });

  it('puts the mechanical checks beside the sentences at one line: the figure to check against its sentence, the dropped and the disagreements named', () => {
    const html = render({ checks: { dropped: ['A sentence about the material.'], disagreements: [{ a: 1, b: 2, why: 'exclusivity beside a name' }], numbered: [2] } });
    expect(html).toMatch(/<li data-sheet-sentence="" data-index="1"[^>]*data-sheet-check="figure"/);
    expect(html).not.toMatch(/<li data-sheet-sentence="" data-index="0"[^>]*data-sheet-check/);
    expect(html).toContain('data-sheet-checks');
    expect(html).toContain('1 sentence dropped for describing the material');
    expect(html).toContain('sentences 1 and 2: exclusivity beside a name');
    expect(render({ checks: null })).not.toContain('data-sheet-checks');
  });

  it('asks before a clear and before a close with a change unsaved, on the page’s asking line, and opens nothing where no sentence is named', () => {
    expect(render({ asking: 'close', dirty: true })).toMatch(/<p[^>]*data-sheet-asking=""[^>]*>Close without saving\?/);
    expect(render({ asking: 'clear', hasEdit: true })).toMatch(/<p[^>]*data-sheet-asking=""[^>]*>Clear the edit and return to the generated text\?/);
    expect(render({ asking: null })).not.toContain('data-sheet-asking');
    expect(render({ openIndex: null })).not.toContain('data-sheet-open');
  });
});
