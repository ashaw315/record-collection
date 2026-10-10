import { describe, expect, it } from 'vitest';
import { MANAGE_FRAME, REVIEW_FRAME, SCREEN, SCREEN_FRAME } from './screen-frame';

/** The box a frame's classes give: its widest content and its side padding, read from the classes themselves. */
function box(frame: string) {
  const cap = /(?:^| )max-w-\[(\d+)px\](?: |$)/.exec(frame);
  const pad = /(?:^| )px-(\d+)(?: |$)/.exec(frame);
  if (cap === null || pad === null) throw new Error(`no cap or padding in "${frame}"`);
  const inset = Number(pad[1]) * 4;
  return { inset, measure: Number(cap[1]) - 2 * inset, centred: /(?:^| )mx-auto(?: |$)/.test(frame) };
}

describe('the five screens’ frame', () => {
  it.each([
    ['stats, the want list, look up and the record form', SCREEN_FRAME, SCREEN.measure],
    ['manage', MANAGE_FRAME, SCREEN.manage],
    ['manage’s match review', REVIEW_FRAME, SCREEN.review],
  ])('%s: the 20 inset, its own measure, and not centred', (_name, frame, measure) => {
    expect(box(frame)).toEqual({ inset: SCREEN.inset, measure, centred: false });
  });
});
