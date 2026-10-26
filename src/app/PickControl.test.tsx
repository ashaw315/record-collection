import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PickControl } from './PickControl';
import { CONTROL_LABEL } from './records/[id]/grid-type';

/**
 * Target §P.5, Phase 0 (step 156): "The control is the eight moods, then ASK
 * and SURPRISE ME, then the reserved slot." The moods and ASK are not built
 * yet, so the control is SURPRISE ME and the slot. This is the permanent
 * control, not §P.6's nothing-tagged form, so nothing here reads the tags.
 */
/* Step 156 unit 3b gave the control its pool (§P.2); these assertions are of the first render and read none of it. */
const POOL = [{ id: '00000000-0000-4000-8000-000000000001', title: 'Gaucho', artist: 'Steely Dan', cover: null }];
const html = renderToStaticMarkup(<PickControl pool={POOL} />);

describe('the pick control (§P.5)', () => {
  it('is SURPRISE ME as a §9.3 label, a button that submits nothing', () => {
    const button = /<button[^>]*>Surprise me<\/button>/.exec(html)?.[0] ?? '';
    expect(button).toContain('type="button"');
    for (const cls of CONTROL_LABEL.split(' ')) expect(button, cls).toContain(cls);
  });

  /* §T.6's reserved slot: there before anything is asked, so an answer's message moves nothing beneath it. */
  it('follows SURPRISE ME with an empty status slot that reserves one line', () => {
    const slot = /<p[^>]*data-pick-slot=""[^>]*><\/p>/.exec(html)?.[0] ?? '';
    expect(slot).toContain('role="status"');
    expect(slot).toContain('min-h-[1lh]');
    expect(html.indexOf('Surprise me')).toBeLessThan(html.indexOf('data-pick-slot'));
  });

  /* §P.6: "The slot's messages are written to fit it", rewritten rather than cut, so nothing clamps them. */
  it('does not clip the slot, since a message that does not fit is rewritten rather than cut', () => {
    const slot = /<p[^>]*data-pick-slot=""[^>]*>/.exec(html)?.[0] ?? '';
    expect(slot).not.toMatch(/line-clamp|truncate|overflow-hidden/);
  });

  /* §P.4: the answer is drawn when the reader asks, never before. Fails against a control that draws its pool's first record on arrival. */
  it('draws no answer before anything is asked, in either host', () => {
    expect(html).not.toContain('data-pick-answer');
    expect(renderToStaticMarkup(<PickControl pool={POOL} answers="far-view" />)).not.toContain('data-pick-answer');
  });
});
