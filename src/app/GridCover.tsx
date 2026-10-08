'use client';

import { useCallback, useState } from 'react';
import { coverTreatment, type CoverTreatment } from './records/[id]/cover-fit';

/**
 * **A record's cover in the grid (§T.5): the record page's rule, in a
 * square.**
 *
 * "Cropped to fill within the 95% bound, fitted beyond it, and held back
 * until its shape is known." The rule is `coverTreatment`, the record
 * page's own (§33), asked of the photograph once it has loaded; until then
 * the square is empty, because a cover drawn cropped that then turned out
 * to be fitted would change in front of the reader. A record with no cover,
 * or a photograph that fails (§33, step 87), is the frame §6 and §5.3 rule:
 * the hairline at the square's edge, on paper.
 *
 * Not a link and not a control: the cell around it is the link (§T.5).
 */
const RULE = 'oklch(0.72 0.004 80)';

export function GridCover({ url }: { url: string | null }) {
  const [treatment, setTreatment] = useState<CoverTreatment | null>(null);
  const [failed, setFailed] = useState(false);
  /* On the element's arrival as well as on its load: a cached photograph has loaded before any handler is attached. */
  const read = useCallback((img: HTMLImageElement | null) => {
    if (img === null || !img.complete) return;
    if (img.naturalWidth > 0) setTreatment(coverTreatment(img.naturalWidth, img.naturalHeight));
    else if (img.currentSrc !== '') setFailed(true);
  }, []);

  if (url === null || failed) {
    return <div data-grid-cover="none" className="box-border aspect-square w-full bg-background" style={{ border: `1px solid ${RULE}` }} />;
  }
  return (
    <div data-grid-cover="photo" className="aspect-square w-full">
      {/* eslint-disable-next-line @next/next/no-img-element -- blob and data URLs the optimizer is not configured for, as on the record page */}
      <img
        ref={read}
        data-cover-treatment={treatment ?? undefined}
        src={url}
        alt=""
        onLoad={(event) => read(event.currentTarget)}
        onError={() => setFailed(true)}
        className={`block h-full w-full ${treatment === null ? 'invisible object-cover' : treatment === 'fit' ? 'bg-background object-contain' : 'object-cover'}`}
      />
    </div>
  );
}
