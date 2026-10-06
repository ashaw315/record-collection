'use client';

import { useCallback, useState } from 'react';
import { coverTreatment, type CoverTreatment } from './cover-fit';

/**
 * The record page's cover, drawn in its square (§33).
 *
 * A client component for one reason: a photograph's shape is not stored, so
 * it is known only once the image has loaded in the browser, and §33's
 * treatment turns on it (step 83). `data-cover-treatment` appears when the
 * shape has been read, and names what was decided.
 *
 * **The cover is not shown until its shape is read (step 85, §33).** It is
 * in the markup from the server, hidden, so its square keeps its size and
 * the cell's ground shows through; it becomes visible in the same render
 * that gives it its treatment. Before this a photograph beyond the bound
 * was painted cropped for as long as the page's scripts took, and then
 * jumped to fitted. Hidden and not unrendered, so the browser fetches the
 * photograph as early as it did.
 *
 * Fitted, the photograph sits centred in the same square on paper: the
 * square keeps its place and its size, and the paper is stated, because the
 * sleeve cell behind it is the record's tint above the fork.
 */
export function SleeveCover({ url }: { url: string }) {
  const [treatment, setTreatment] = useState<CoverTreatment | null>(null);
  const read = useCallback((img: HTMLImageElement | null) => {
    /* A cached image is complete before React attaches its handler, so the ref reads it too. */
    if (img !== null && img.complete && img.naturalWidth > 0) setTreatment(coverTreatment(img.naturalWidth, img.naturalHeight));
  }, []);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- blob and data URLs the optimizer is not configured for, as in ImageGallery
    <img
      ref={read}
      data-cover=""
      data-cover-treatment={treatment ?? undefined}
      src={url}
      alt=""
      onLoad={(event) => read(event.currentTarget)}
      className={treatment === null ? 'invisible block object-cover' : treatment === 'fit' ? 'block bg-background object-contain' : 'block object-cover'}
    />
  );
}
