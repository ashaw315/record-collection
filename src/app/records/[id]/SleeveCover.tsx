'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { coverTreatment, type CoverTreatment } from './cover-fit';
import { SleeveModal } from './SleeveModal';

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
  /*
    §M.1: "The trigger is the displayed cover itself. It becomes a button
    whose accessible name is 'Open the sleeve'." The button takes the
    cover's own box from the page's stylesheet, so nothing on the closed
    screen moves.

    "Opening it adds one history entry at the same URL", and that entry is
    the modal's state: Back removes it, and CLOSE and Escape step back
    through it, "so it never lingers". A reload keeps the entry and not this
    component's state, so it comes back closed.
  */
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const openSleeve = useCallback(() => {
    window.history.pushState({ ...(window.history.state as object | null), sleeve: true }, '');
    setOpen(true);
  }, []);
  const closeSleeve = useCallback(() => {
    if ((window.history.state as { sleeve?: boolean } | null)?.sleeve === true) window.history.back();
    else setOpen(false);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onPop = () => {
      if ((window.history.state as { sleeve?: boolean } | null)?.sleeve !== true) setOpen(false);
    };
    window.addEventListener('popstate', onPop);
    const cover = trigger.current;
    return () => {
      window.removeEventListener('popstate', onPop);
      /* "Focus returns to the cover." */
      cover?.focus();
    };
  }, [open]);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        data-cover-trigger=""
        aria-label="Open the sleeve"
        onClick={openSleeve}
        className="block cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- blob and data URLs the optimizer is not configured for, as in ImageGallery */}
        <img
          ref={read}
          data-cover=""
          data-cover-treatment={treatment ?? undefined}
          src={url}
          alt=""
          onLoad={(event) => read(event.currentTarget)}
          className={treatment === null ? 'invisible block object-cover' : treatment === 'fit' ? 'block bg-background object-contain' : 'block object-cover'}
        />
      </button>
      {open && <SleeveModal onClose={closeSleeve} />}
    </>
  );
}
