'use client';

import { useEffect, useRef, useState } from 'react';
import { VISIBLE_OF_HOST_HEIGHT, VISIBLE_OF_SECTION_WIDTH } from './OrnamentMarks';

/**
 * §5.1's quarter-circles -- the plane in provenance and the plane in About.
 *
 * **Sized against the host (§29, §34), then tested against type.** "A plane
 * is sized first, to at most two-thirds of its host's height and a quarter
 * of its section's width, and only then tested against type: if the sized
 * plane still covers type, it is not drawn. It is never clipped, which
 * reads as a cut rather than a plane." The drawing's 112 was a drawn
 * instance (§29), and below the fork it overhung 72-92px cells and sat in
 * front of the PROVENANCE label on every record.
 *
 * The size is CSS, so the first paint is right; the type test is a
 * measurement, so it runs after layout and again when the host resizes.
 * Type is what a reader reads: every element in the host with text of its
 * own that is not hidden from readers. The plane's box is computed from the
 * host's, not read off itself, so a hidden plane can still be re-tested.
 */
export function Plane({ name, corner, fill }: { name: string; corner: 'bottom-left' | 'bottom-right'; fill: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [covers, setCovers] = useState(false);

  useEffect(() => {
    const el = ref.current;
    const host = el?.parentElement ?? null;
    if (el === null || host === null) return;
    const test = () => {
      const h = host.getBoundingClientRect();
      const size = Math.min(h.height * VISIBLE_OF_HOST_HEIGHT, h.width * VISIBLE_OF_SECTION_WIDTH);
      const box = { left: corner === 'bottom-left' ? h.left : h.right - size, right: corner === 'bottom-left' ? h.left + size : h.right, top: h.bottom - size, bottom: h.bottom };
      const type = Array.from(host.querySelectorAll<HTMLElement>('*')).filter((t) => t !== el && t.closest('[aria-hidden="true"]') === null && Array.from(t.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== ''));
      setCovers(type.some((t) => { const b = t.getBoundingClientRect(); return b.width > 0 && b.left < box.right && box.left < b.right && b.top < box.bottom && box.top < b.bottom; }));
    };
    test();
    const observer = new ResizeObserver(test);
    observer.observe(host);
    return () => observer.disconnect();
  }, [corner]);

  return (
    <div
      ref={ref}
      data-mark={name}
      data-plane={covers ? 'covers-type' : 'drawn'}
      aria-hidden="true"
      hidden={covers}
      className={`pointer-events-none absolute bottom-0 ${corner === 'bottom-left' ? 'left-0' : 'right-0'}`}
      style={{
        /* Two-thirds of the host's height, capped at a quarter of its width; a square, so the smaller wins. */
        height: `${VISIBLE_OF_HOST_HEIGHT * 100}%`,
        maxWidth: `${VISIBLE_OF_SECTION_WIDTH * 100}%`,
        aspectRatio: '1 / 1',
        background: fill,
        ...(corner === 'bottom-left' ? { borderTopRightRadius: '100%' } : { borderTopLeftRadius: '100%' }),
      }}
    />
  );
}
