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
 * **So a photograph beyond the bound is first painted cropped, and fitted
 * once it has loaded.** Until then nothing says it is not square, and the
 * built treatment stands. Deciding before the first paint needs the
 * dimensions stored at upload, which is a schema change SPEC.md §4 does not
 * give; recorded in NOTES with this step. No cover in the collection is
 * beyond the bound, so none takes that path today.
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
      className={treatment === 'fit' ? 'block bg-background object-contain' : 'block object-cover'}
    />
  );
}
