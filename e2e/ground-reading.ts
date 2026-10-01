/**
 * **The ground under type, by size (§5.2, §59).** Paint behind type is that
 * type's ground, and §59 rules what any type may sit on: "Type on any
 * ground that is not paper clears 4.5 : 1 below 40px and 3 : 1 at 40px and
 * above." `GROUND` reads every glyph run that sits over paint, with the
 * type's size and colour, the paint, and the ground at the glyph's centre
 * (a face's step, a fill, an image); `contrast` gives the WCAG 2 ratio;
 * `thresholdFor` is §59's bound by size. Shared by the layout sweep (the
 * seeded rich record at every view) and the real-collection report.
 *
 * Measured on GLYPH RECTS: a label's block spans its strip while its
 * letters stop early (`OrnamentMarks.tsx`, §57), so an element-box count
 * is larger than the number of letters over paint.
 */
export const GROUND = () => {
  const R = (el: Element) => el.getBoundingClientRect();
  const name = (el: Element) => {
    const a = ['data-cell', 'data-section', 'data-field', 'data-mark', 'data-band', 'data-region', 'data-air', 'data-ornament', 'data-flat', 'data-figure'].map((k) => (el.getAttribute(k) === null ? null : `${k.slice(5)}=${el.getAttribute(k)}`)).filter((s) => s !== null);
    return a.join(',') || el.tagName.toLowerCase();
  };
  type B = { left: number; top: number; right: number; bottom: number };
  const intersects = (a: B, b: B) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  const texts = Array.from(document.querySelectorAll<HTMLElement>('main *')).filter((el) => {
    if (el.closest('[aria-hidden="true"]') !== null) return false;
    if (['SCRIPT', 'STYLE', 'SVG', 'POLYGON', 'CIRCLE', 'BUTTON', 'TEXTAREA', 'SELECT', 'INPUT', 'OPTION'].includes(el.tagName)) return false;
    const own = Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '');
    if (!own || R(el).width <= 0 || R(el).height <= 0) return false;
    if (el.offsetWidth <= 1 && el.offsetHeight <= 1 && getComputedStyle(el).overflow === 'hidden') return false;
    return true;
  });
  const paints = Array.from(document.querySelectorAll<HTMLElement>('main *')).filter((el) => {
    if (R(el).width <= 0 || R(el).height <= 0 || (el.textContent ?? '').trim() !== '') return false;
    if (el.closest('svg') !== null && el.tagName !== 'svg') return false;
    const cs = getComputedStyle(el);
    return el.tagName === 'IMG' || el.tagName === 'svg' || (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') || cs.backgroundImage !== 'none';
  });
  const savedPE = paints.map((o) => o.style.pointerEvents);
  for (const o of paints) o.style.pointerEvents = 'auto';
  const rows: Array<{ size: number; text: string; paint: string; ground: string; where: string; ink: string; geo: string }> = [];
  let boxOverlaps = 0;
  let glyphOverlaps = 0;
  /* Glyph rects that meet a paint's box without the paint being under the glyph: the paint is clipped away there (a figure's bleed below its foot), or it is in front, which the §34 sweep counts. */
  const why = { clipped: 0, inFront: 0, textNotHit: 0 };
  const notHit: string[] = [];
  for (const tx of texts) {
    const size = Math.round(parseFloat(getComputedStyle(tx).fontSize) * 10) / 10;
    const glyphRects: Array<{ left: number; top: number; right: number; bottom: number }> = [];
    for (const n of Array.from(tx.childNodes)) {
      if (n.nodeType !== Node.TEXT_NODE || (n.textContent ?? '').trim() === '') continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const g of Array.from(range.getClientRects())) if (g.width > 0 && g.height > 0) glyphRects.push({ left: g.left + window.scrollX, top: g.top + window.scrollY, right: g.right + window.scrollX, bottom: g.bottom + window.scrollY });
    }
    for (const o of paints) {
      if (o.contains(tx) || tx.contains(o)) continue;
      const ob0 = R(o);
      const ob = { left: ob0.left + window.scrollX, top: ob0.top + window.scrollY, right: ob0.right + window.scrollX, bottom: ob0.bottom + window.scrollY };
      const tb0 = R(tx);
      if (intersects(ob, { left: tb0.left + window.scrollX, top: tb0.top + window.scrollY, right: tb0.right + window.scrollX, bottom: tb0.bottom + window.scrollY })) boxOverlaps += 1;
      for (const g of glyphRects) {
        if (!intersects(ob, g)) continue;
        glyphOverlaps += 1;
        const cx = Math.max(ob.left, g.left) + (Math.min(ob.right, g.right) - Math.max(ob.left, g.left)) / 2;
        const cy = Math.max(ob.top, g.top) + (Math.min(ob.bottom, g.bottom) - Math.max(ob.top, g.top)) / 2;
        window.scrollTo(0, Math.max(0, cy - window.innerHeight / 2));
        const stack = document.elementsFromPoint(cx - window.scrollX, cy - window.scrollY);
        const ti = stack.findIndex((e) => e === tx || tx.contains(e));
        const pi = stack.findIndex((e) => e === o || o.contains(e));
        if (ti === -1) { why.textNotHit += 1; if (notHit.length < 8) notHit.push(`"${(tx.textContent ?? '').trim().slice(0, 24)}" (${getComputedStyle(tx).pointerEvents}, ${getComputedStyle(tx).visibility}) vs ${name(o)}; top of stack ${stack[0] === undefined ? 'nothing' : name(stack[0])}`); continue; }
        if (pi === -1) { why.clipped += 1; continue; }
        if (pi < ti) { why.inFront += 1; continue; }
        const under = stack[pi];
        const cs = getComputedStyle(under);
        const ground =
          under.tagName === 'IMG' ? 'image'
          : under !== o && under.closest('svg') !== null ? `${cs.fill}${under.getAttribute('data-step') !== null ? ` (${under.getAttribute('data-step')})` : under.getAttribute('data-face') !== null ? ` (${under.getAttribute('data-face')} face)` : ''}`
          : under.tagName === 'svg' ? 'none: the figure’s box, no face under the glyph'
          : cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent' ? cs.backgroundColor
          : cs.backgroundImage !== 'none' ? 'background-image' : 'unknown';
        rows.push({ size, text: (tx.textContent ?? '').trim().slice(0, 28), paint: name(o), ground, where: name(tx.closest('[data-cell],[data-section]') ?? tx), ink: getComputedStyle(tx).color, geo: `glyph x ${Math.round(g.left)}..${Math.round(g.right)} y ${Math.round(g.top)}..${Math.round(g.bottom)}, paint x ${Math.round(ob.left)}..${Math.round(ob.right)} y ${Math.round(ob.top)}..${Math.round(ob.bottom)}, hit at ${Math.round(cx)},${Math.round(cy)}` });
        break;
      }
    }
  }
  paints.forEach((o, i) => { o.style.pointerEvents = savedPE[i]; });
  window.scrollTo(0, 0);
  return { boxOverlaps, glyphOverlaps, why, notHit, rows };
};

/** WCAG 2 contrast of two `rgb(r, g, b)` strings; null where either is not an rgb triple. */
export const contrast = (a: string, b: string): number | null => {
  const lum = (c: string) => {
    /* `lab(L a b)`: relative luminance from L* alone, which is what contrast needs. */
    const lab = /lab\(([\d.]+)/.exec(c);
    if (lab !== null) { const L = Number(lab[1]); return L > 8 ? ((L + 16) / 116) ** 3 : L / 903.3; }
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c);
    if (m === null) return null;
    const ch = [m[1], m[2], m[3]].map((v) => { const x = Number(v) / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const la = lum(a); const lb = lum(b);
  if (la === null || lb === null) return null;
  return Math.round(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)) * 100) / 100;
};


/** §59's bound by type size: 4.5 : 1 below 40px, 3 : 1 at 40px and above. The scale holds nothing between 15 and 40, so 40 is the headline boundary. */
export const thresholdFor = (fontSizePx: number): number => (fontSizePx >= 40 ? 3 : 4.5);
