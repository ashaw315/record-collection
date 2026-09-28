'use client';

import { useEffect, useRef } from 'react';
import { GRID_FORK } from './band-geometry';
import { RECORD_BAND_QUARTERS, fillRows, packRecordBand, packedRules } from './record-band-41';

/**
 * §41 (step 47): from 960 to 1439 each frame cell takes the quarters its
 * content needs. The content's width is a browser fact -- the widest line
 * of the cell's text and visuals, and its longest label -- so it is
 * measured here, after paint, and written on the cell as `--packed`, which
 * the page's stylesheet reads as the cell's span. Outside that range the
 * property is cleared and the stylesheet's own rules stand.
 *
 * **Measured unpacked, every time.** A packed cell wraps its text sooner,
 * so a measurement taken on the packed layout would read a narrower widest
 * line and shrink the cell again on the next pass. Each pass first returns
 * every cell to the whole row, measures, then applies. It runs on mount and
 * on the window's resize, not on the band's own resize, which the packing
 * itself causes.
 */
const FLOOR = 960;

const widestLine = (root: Element): number => {
  const byTop = new Map<number, number>();
  const walk = (n: Node) => {
    /*
      The cell itself may be a mark -- the year field IS its cell's
      background and the journal edge its cell's border -- so the ornament
      test below applies to descendants only. Measured before this: both
      cells read 0 ink and were packed to one quarter.
    */
    if (n.nodeType === Node.TEXT_NODE) {
      if ((n.textContent ?? '').trim() === '') return;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const rect of Array.from(range.getClientRects())) {
        if (rect.width === 0) continue;
        const key = Math.round(rect.top);
        byTop.set(key, (byTop.get(key) ?? 0) + rect.width);
      }
      return;
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const el = n as HTMLElement;
    /* Ornament is sized to the cell, so it cannot size the cell. */
    if (el !== root && el.matches('[data-mark], [data-ornament], [data-plane]')) return;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return;
    if (el.matches('img, svg')) {
      const rect = el.getBoundingClientRect();
      const key = Math.round(rect.top);
      byTop.set(key, (byTop.get(key) ?? 0) + rect.width);
      return;
    }
    for (const child of Array.from(n.childNodes)) walk(child);
  };
  walk(root);
  return Math.max(0, ...byTop.values());
};

/** The label register: monospace, uppercase (§4). */
const longestLabel = (root: Element): number =>
  Math.max(
    0,
    ...Array.from(root.querySelectorAll<HTMLElement>('*'))
      .filter((el) => {
        const s = getComputedStyle(el);
        return s.textTransform === 'uppercase' && /mono/i.test(s.fontFamily) && el.children.length === 0 && (el.textContent ?? '').trim() !== '';
      })
      .map((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return range.getBoundingClientRect().width;
      }),
  );

export function RecordBandPacker() {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const band = marker.current?.closest<HTMLElement>('[data-band="record"]') ?? null;
    if (band === null) return;
    const pack = () => {
      const cells = Array.from(band.querySelectorAll<HTMLElement>(':scope > [data-cell]'));
      const width = window.innerWidth;
      if (width < FLOOR || width >= GRID_FORK) {
        for (const cell of cells) for (const prop of ['--packed', '--rule-right', '--rule-top']) cell.style.removeProperty(prop);
        return;
      }
      for (const cell of cells) cell.style.setProperty('--packed', String(RECORD_BAND_QUARTERS));
      const quarter = band.getBoundingClientRect().width / RECORD_BAND_QUARTERS;
      const padding = cells.length === 0 ? 0 : parseFloat(getComputedStyle(cells[0]).paddingLeft);
      /* §42 (step 49): the last cell in a row takes the row's remaining width, and rules stand only between rendered cells. */
      const spans = fillRows(packRecordBand({ quarter, padding, cells: cells.map((cell) => ({ ink: widestLine(cell), label: longestLabel(cell) })) }));
      const rules = packedRules(spans);
      cells.forEach((cell, index) => {
        cell.style.setProperty('--packed', String(spans[index]));
        cell.style.setProperty('--rule-right', `${rules[index].right}px`);
        cell.style.setProperty('--rule-top', `${rules[index].top}px`);
      });
    };
    pack();
    window.addEventListener('resize', pack);
    if (document.fonts !== undefined) document.fonts.ready.then(pack).catch(() => undefined);
    return () => window.removeEventListener('resize', pack);
  }, []);
  return <span ref={marker} data-record-band-packer="" hidden />;
}
