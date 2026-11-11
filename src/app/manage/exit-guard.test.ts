import { describe, expect, it } from 'vitest';
import { inAppExit, type ClickLike } from './exit-guard';

/**
 * **Step 174: which clicks are exits the page owns (§T.6).** Each case fails against `inAppExit` returning the path for
 * every anchor, or null for every anchor: a plain left click on a same-origin link to another path is an exit, and a
 * click the reader meant otherwise (a new tab, a download, another origin, a hash within the page) is not.
 */
const here = { origin: 'https://x.test', pathname: '/manage', search: '' };
const plain: ClickLike = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
const anchor = (href: string, extra: Partial<{ target: string; download: boolean }> = {}) => ({ href, target: '', download: false, ...extra });

describe('inAppExit', () => {
  it('names the path of a plain left click on a link within the app', () => {
    expect(inAppExit(anchor('https://x.test/want-list'), plain, here)).toBe('/want-list');
    expect(inAppExit(anchor('/stats?tab=labels'), plain, here)).toBe('/stats?tab=labels');
    expect(inAppExit(anchor('https://x.test/manage?artists=all'), plain, here)).toBe('/manage?artists=all');
  });

  it('is not an exit for another origin, a new tab or window, a download, or a hash within the page', () => {
    expect(inAppExit(anchor('https://www.discogs.com/release/1'), plain, here)).toBeNull();
    expect(inAppExit(anchor('/want-list', { target: '_blank' }), plain, here)).toBeNull();
    expect(inAppExit(anchor('/export.csv', { download: true }), plain, here)).toBeNull();
    expect(inAppExit(anchor('https://x.test/manage#tags'), plain, here)).toBeNull();
    expect(inAppExit(anchor('https://x.test/manage'), plain, here)).toBeNull();
  });

  it('leaves a modified click, a middle click and a click already handled to the browser', () => {
    expect(inAppExit(anchor('/want-list'), { ...plain, metaKey: true }, here)).toBeNull();
    expect(inAppExit(anchor('/want-list'), { ...plain, ctrlKey: true }, here)).toBeNull();
    expect(inAppExit(anchor('/want-list'), { ...plain, shiftKey: true }, here)).toBeNull();
    expect(inAppExit(anchor('/want-list'), { ...plain, button: 1 }, here)).toBeNull();
    expect(inAppExit(anchor('/want-list'), { ...plain, defaultPrevented: true }, here)).toBeNull();
  });
});
