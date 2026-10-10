import type { Page } from '@playwright/test';

/**
 * `margin` is §T.6's, as revised 9 Oct: "The air is measured after a 24 margin on every side where it meets a
 * control, type or the header". Type and controls are grown by it before the search and the header's foot is
 * lowered by it; rules, images and the measure's own edges are not, since the sentence does not name them.
 */
export const measure = (page: Page, margin: number) =>
  page.evaluate((margin) => {
    const main = (document.querySelector('main') ?? document.querySelector('h1')?.closest('div[class*="max-w"]') ?? document.body) as HTMLElement;
    const m = main.getBoundingClientRect();
    const cs = getComputedStyle(main);
    const zone = { left: m.left + parseFloat(cs.paddingLeft), right: m.right - parseFloat(cs.paddingRight), top: m.top + parseFloat(cs.paddingTop), bottom: Math.min(m.bottom - parseFloat(cs.paddingBottom), window.innerHeight) };
    const h1 = (main.querySelector('h1') ?? document.querySelector('h1')) as HTMLElement;
    /* The heading's type, not its element's box, which runs the measure's whole width. */
    const heading = (() => { const range = document.createRange(); range.selectNodeContents(h1); return range.getBoundingClientRect(); })();
    const shown = (el: Element) => el.closest('[data-app-nav], nextjs-portal, script, style') === null && el.getClientRects().length > 0 && el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true });
    type Kind = 'type' | 'control' | 'image' | 'fill' | 'rule';
    type Box = { left: number; right: number; top: number; bottom: number; what: string; kind: Kind };
    const boxes: Box[] = [];
    const grow = (kind: Kind) => (kind === 'type' || kind === 'control' ? margin : 0);
    const add = (r: DOMRect, what: string, kind: Kind) => { if (r.width < 1 || r.height < 1) return; const g = grow(kind); const b = { left: Math.max(r.left - g, zone.left), right: Math.min(r.right + g, zone.right), top: Math.max(r.top - g, zone.top), bottom: Math.min(r.bottom + g, zone.bottom), what, kind }; if (b.right > b.left && b.bottom > b.top) boxes.push(b); };
    for (const el of Array.from(main.querySelectorAll('*')).filter(shown)) {
      const tag = el.tagName.toLowerCase();
      if (['input', 'select', 'textarea', 'button', 'img', 'svg', 'canvas', 'summary'].includes(tag)) { add(el.getBoundingClientRect(), tag, ['img', 'svg', 'canvas'].includes(tag) ? 'image' : 'control'); continue; }
      /* Type: the text's own boxes, not its element's, which for a block is the whole line whatever the words reach. */
      for (const node of Array.from(el.childNodes)) {
        if (node.nodeType !== Node.TEXT_NODE || (node.textContent ?? '').trim() === '') continue;
        const range = document.createRange(); range.selectNodeContents(node);
        for (const r of Array.from(range.getClientRects())) add(r, `${tag} "${(node.textContent ?? '').trim().slice(0, 18)}"`, 'type');
      }
      const s = getComputedStyle(el);
      if (s.backgroundColor !== 'rgba(0, 0, 0, 0)' && el !== main && s.backgroundColor !== getComputedStyle(document.body).backgroundColor) add(el.getBoundingClientRect(), `${tag} fill`, 'fill');
      /* A drawn rule is a box one rule thick: content begins at it, and a figure does not cross it. */
      const r = el.getBoundingClientRect();
      const rule = (side: 'Top' | 'Bottom' | 'Left' | 'Right') => parseFloat(s[`border${side}Width`]) > 0 && s[`border${side}Style`] !== 'none' && s[`border${side}Color`] !== 'rgba(0, 0, 0, 0)';
      if (rule('Top')) add(new DOMRect(r.left, r.top, r.width, Math.max(1, parseFloat(s.borderTopWidth))), `${tag} rule`, 'rule');
      if (rule('Bottom')) add(new DOMRect(r.left, r.bottom - Math.max(1, parseFloat(s.borderBottomWidth)), r.width, Math.max(1, parseFloat(s.borderBottomWidth))), `${tag} rule`, 'rule');
      if (rule('Left')) add(new DOMRect(r.left, r.top, Math.max(1, parseFloat(s.borderLeftWidth)), r.height), `${tag} rule`, 'rule');
      if (rule('Right')) add(new DOMRect(r.right - Math.max(1, parseFloat(s.borderRightWidth)), r.top, Math.max(1, parseFloat(s.borderRightWidth)), r.height), `${tag} rule`, 'rule');
    }
    /* The largest empty rectangle that begins no lower than the heading's foot. */
    const uniq = (v: number[]) => [...new Set(v.map((x) => Math.round(x)))].sort((a, b) => a - b);
    const xs = uniq([zone.left, zone.right, ...boxes.flatMap((b) => [b.left, b.right])]);
    /* The header's foot, where the air would meet it: the region's top when the screen pads none of its own. */
    const nav = document.querySelector('[data-app-nav]');
    const headerFoot = nav === null ? -Infinity : (nav.closest('header') ?? nav).getBoundingClientRect().bottom;
    const ceiling = Math.max(zone.top, headerFoot + margin);
    const tops = uniq([ceiling, ...boxes.map((b) => b.bottom)]).filter((y) => y >= Math.round(ceiling) && y <= Math.round(heading.top) + margin);
    type Rect = { left: number; top: number; width: number; height: number; square: number; under: string; underKind: string };
    let best: Rect | null = null; let tallest: Rect | null = null; let widest: Rect | null = null;
    for (const top of tops) for (let i = 0; i < xs.length; i += 1) for (let j = i + 1; j < xs.length; j += 1) {
      const left = xs[i]; const right = xs[j];
      if (right - left < 24 || left < Math.round(heading.right)) continue;
      let bottom = zone.bottom; let under = 'the end of the first view'; let underKind = 'edge'; let blocked = false;
      for (const b of boxes) {
        if (b.right <= left + 0.5 || b.left >= right - 0.5) continue;
        if (b.bottom <= top + 0.5) continue;
        if (b.top <= top + 0.5) { blocked = true; break; }
        if (b.top < bottom) { bottom = b.top; under = b.what; underKind = b.kind; }
      }
      if (blocked) continue;
      const r: Rect = { left, top, width: right - left, height: Math.round(bottom - top), square: Math.min(right - left, Math.round(bottom - top)), under, underKind };
      if (r.height < 24) continue;
      if (best === null || r.square > best.square || (r.square === best.square && r.width * r.height > best.width * best.height)) best = r;
      if (tallest === null || r.height > tallest.height || (r.height === tallest.height && r.width > tallest.width)) tallest = r;
      if (widest === null || r.width > widest.width || (r.width === widest.width && r.height > widest.height)) widest = r;
    }
    const lines = Array.from(main.querySelectorAll('*')).filter(shown).filter((el) => { const s = getComputedStyle(el); return el.tagName === 'HR' || parseFloat(s.borderTopWidth) > 0 || parseFloat(s.borderBottomWidth) > 0; }).map((el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return [parseFloat(s.borderTopWidth) > 0 || el.tagName === 'HR' ? r.top : null, parseFloat(s.borderBottomWidth) > 0 ? r.bottom : null].filter((y): y is number => y !== null).map((y) => ({ y, left: r.left, right: r.right })); }).flat();
    const crossed = (r: Rect | null) => (r === null ? 0 : lines.filter((l) => l.y > r.top + 1 && l.y < r.top + r.height - 1 && l.right > r.left + 1 && l.left < r.left + r.width - 1).length);
    /* What each side of the air found meets: the nearest thing within a pixel of that edge, or the edge of the measure. */
    const sides = (r: Rect | null) => {
      if (r === null) return null;
      const R = { left: r.left, right: r.left + r.width, top: r.top, bottom: r.top + r.height };
      const spanY = (b: Box) => b.bottom > R.top + 1 && b.top < R.bottom - 1;
      const spanX = (b: Box) => b.right > R.left + 1 && b.left < R.right - 1;
      const say = (b: Box | undefined, otherwise: string) => (b === undefined ? otherwise : `${b.what} (${b.kind})`);
      return {
        left: say(boxes.find((b) => spanY(b) && Math.abs(b.right - R.left) <= 1), 'the measure’s edge'),
        right: say(boxes.find((b) => spanY(b) && Math.abs(b.left - R.right) <= 1), 'the measure’s edge'),
        top: say(boxes.find((b) => spanX(b) && Math.abs(b.bottom - R.top) <= 1), Math.abs(R.top - (headerFoot + margin)) <= 1 ? 'the header' : 'the region’s own top'),
        bottom: say(boxes.find((b) => spanX(b) && Math.abs(b.top - R.bottom) <= 1), 'the end of the first view'),
      };
    };
    return { sides: sides(best), headerFoot: Math.round(headerFoot), zone: { left: Math.round(zone.left), right: Math.round(zone.right), top: Math.round(zone.top), width: Math.round(zone.right - zone.left) }, heading: { text: (h1.textContent ?? '').trim(), left: Math.round(heading.left), top: Math.round(heading.top), bottom: Math.round(heading.bottom), textRight: Math.round(heading.right) }, boxes: boxes.length, best, tallest, widest, hairlinesCrossed: { best: crossed(best), tallest: crossed(tallest), widest: crossed(widest) } };
  }, margin);
