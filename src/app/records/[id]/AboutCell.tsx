'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * §42 (step 50): "An About longer than its cell scrolls inside the cell;
 * there is no clamp and no more link... The cell's height is fixed where the
 * record band is, at §18's fork and above; below it the cell is sized by its
 * content, per §41, and the whole text sets. The scroll is not a silent cut:
 * the cell's last visible line may be cut at its foot, which says there is
 * more, and the scrollbar is always visible while the text overflows, never
 * an overlay that hides at rest. The text region is focusable and labelled
 * 'About this record', so a keyboard can scroll it."
 *
 * §33's nine lines and more ↓ are withdrawn (33/more-link), and with them
 * the probe that measured the clamp. The region takes the cell's remaining
 * height above the Images foot (flex-1 in the cell's column) and publishes
 * whether it scrolls and how many lines it holds, which the editor reads
 * (34/editor-reports-clamp).
 */
export function AboutCell({ text }: { text: string }) {
  const region = useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = useState(false);
  const [linesHeld, setLinesHeld] = useState<number | null>(null);
  useEffect(() => {
    const el = region.current;
    if (el === null) return;
    const measure = () => {
      setScrolls(el.scrollHeight > el.clientHeight + 1);
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
      setLinesHeld(lineHeight > 0 ? Math.floor(el.clientHeight / lineHeight + 1e-6) : null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);
  return (
    <div
      ref={region}
      data-field="about"
      data-scrolls={scrolls ? '' : undefined}
      data-line-budget={linesHeld ?? undefined}
      role="region"
      aria-label="About this record"
      tabIndex={0}
      className="text-prose mt-[6px] min-h-0 flex-1 overflow-y-auto whitespace-pre-line"
    >
      {text}
    </div>
  );
}
