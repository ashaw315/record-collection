import { describe, expect, it } from 'vitest';
import { ITEM_FRAME, MANAGE_FRAME, REVIEW_FRAME, SCREEN, SCREEN_FRAME } from './screen-frame';

/** The box a frame's classes give: its widest content and its side padding, read from the classes themselves. */
function box(frame: string) {
  const cap = /(?:^| )max-w-\[(\d+)px\](?: |$)/.exec(frame);
  const pad = /(?:^| )px-\[(\d+)px\](?: |$)/.exec(frame);
  if (cap === null || pad === null) throw new Error(`no cap or padding in "${frame}"`);
  const inset = Number(pad[1]);
  return { inset, measure: Number(cap[1]) - 2 * inset, centred: /(?:^| )mx-auto(?: |$)/.test(frame) };
}

describe('the screens’ frames', () => {
  it('the inset is the header’s 18, where the wordmark stands', () => {
    expect(SCREEN.inset).toBe(18);
  });

  it.each([
    ['stats, the want list, look up and the record form', SCREEN_FRAME, SCREEN.measure],
    ['manage and not found', MANAGE_FRAME, SCREEN.manage],
    ['the want list’s new form and an item’s pages', ITEM_FRAME, SCREEN.item],
    ['manage’s match review', REVIEW_FRAME, SCREEN.review],
  ])('%s: the wordmark’s 18, its own measure, and not centred', (_name, frame, measure) => {
    expect(box(frame)).toEqual({ inset: SCREEN.inset, measure, centred: false });
  });
});
