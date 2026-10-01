'use client';

import { useRouter } from 'next/navigation';
import { LABEL } from './grid-type';
import type { RecordLadder } from '@/lib/colour/record-ladder';
import { Section } from './Section';
import { CONTROL_HEIGHT, FIELD_HEIGHT } from './extended-grid';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { IMAGE_TYPE_ORDER, imageTypeLabel, orderImages, type GalleryImage } from './gallery-order';
import { MAX_IMAGE_BYTES } from '@/lib/storage/image-type';

/**
 * SPEC.md §10's "images gallery" on the record detail screen, with §5.9's
 * upload and delete.
 *
 * The reading situation is a phone held next to the record, so the grid is two
 * columns at 390px rather than one — a single column turns four photos into a
 * scroll, and comparing the sleeve in your hand to the sleeve on screen is the
 * whole point of having them.
 *
 * `referrerPolicy="no-referrer"` and `loading="lazy"` on every image, matching
 * the rule established for Discogs thumbnails: the blob host does not need to
 * be told which record page was open.
 */

const ACCEPT = 'image/jpeg,image/png,image/webp';

export function ImageGallery({
  recordId,
  images,
  base,
  ladder = null,
}: {
  recordId: string;
  images: GalleryImage[];
  /** §5.5's base step, for §9.3's rail bar. */
  base: string | null;
  /** §53 (step 61): the record's ladder, for the base quarter-disc this section now hosts (§26, bounded by §29). Null when there is no cover. */
  ladder?: RecordLadder | null;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [imageType, setImageType] = useState<string>('cover');

  const tiles = orderImages(images);

  async function upload(file: File) {
    setError(undefined);

    /**
     * Checked here as well as on the server, and the server's check is the one
     * that counts — this only saves a 10MB round trip before being told no.
     * §5.9's limit lives in one constant so the two cannot drift.
     */
    if (file.size > MAX_IMAGE_BYTES) {
      setError(`That image is larger than the ${MAX_IMAGE_BYTES / (1024 * 1024)}MB limit.`);
      return;
    }

    setBusy(true);
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('imageType', imageType);

      const response = await fetch(`/api/records/${recordId}/images`, {
        method: 'POST',
        body: form,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? 'That image could not be uploaded.');
        return;
      }

      // The gallery is server-rendered, so the new row arrives on a refresh
      // rather than being pushed into local state — one source of truth.
      router.refresh();
    } catch {
      setError('Could not reach the server. Nothing was uploaded.');
    } finally {
      setBusy(false);
      if (fileInput.current !== null) fileInput.current.value = '';
    }
  }

  async function remove(id: string, label: string) {
    // Named in the prompt: §7.5's rule that a destructive action says what is
    // lost. "Delete this image?" does not distinguish the cover from the wax.
    if (!window.confirm(`Delete this ${label.toLowerCase()} image? This cannot be undone.`)) {
      return;
    }

    setError(undefined);
    setBusy(true);
    try {
      const response = await fetch(`/api/images/${id}`, { method: 'DELETE' });

      if (!response.ok) {
        setError('That image could not be deleted.');
        return;
      }

      router.refresh();
    } catch {
      setError('Could not reach the server. Nothing was deleted.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section name="images" title="Images" base={base} shape="one" ladder={ladder}>
      <div data-testid="image-gallery">
      <div className="mb-3 flex flex-wrap items-center gap-[10px]">
        <label htmlFor="image-type" className="sr-only">
          Image type
        </label>
        <select
          id="image-type"
          value={imageType}
          onChange={(event) => setImageType(event.target.value)}
          /*
            §9.2: a control is 44px, 1px ink box, no fill, no radius, 11px mono
            uppercase. The select is a control rather than a field — it chooses
            rather than takes typing — so it takes the control vocabulary.
          */
          className={`${LABEL} bg-transparent px-[10px]`}
          style={{
            height: CONTROL_HEIGHT,
            border: '1px solid oklch(0.18 0.005 60)',
            borderRadius: 0,
            boxSizing: 'border-box',
          }}
        >
          {IMAGE_TYPE_ORDER.map((type) => (
            <option key={type} value={type}>
              {imageTypeLabel(type)}
            </option>
          ))}
        </select>

        <label htmlFor="image-file" className="sr-only">
          Add an image
        </label>
        <input
          ref={fileInput}
          id="image-file"
          type="file"
          accept={ACCEPT}
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file !== undefined) void upload(file);
          }}
          /*
            §9.2's uploader is a dashed 1px grey square. The file input's own
            button takes the control vocabulary; the dashed treatment is on the
            button rather than the input, because the input's box is the
            browser's and cannot be sized reliably.
          */
          className={`${LABEL} file:mr-[10px] file:border file:border-dashed file:bg-transparent file:px-[10px] file:py-[8px] file:text-[11px] file:uppercase`}
          style={{ height: FIELD_HEIGHT }}
        />

        {busy && <span className="text-meta text-muted-foreground">Working…</span>}
      </div>

      {/*
        Stated rather than left to the server's refusal: §5.9's limits are not
        discoverable from an empty file picker, and finding them out by having a
        10MB upload rejected is a bad way to learn them.
      */}
      <p className="mb-3 text-meta text-muted-foreground">
        JPEG, PNG or WebP, up to {MAX_IMAGE_BYTES / (1024 * 1024)}MB.
      </p>

      {error !== undefined && (
        <p role="alert" className="mb-3 text-meta text-destructive">
          {error}
        </p>
      )}

      {tiles.length === 0 ? (
        /*
          **Two empty states, because there are two kinds of empty.** The frame
          owns the cover, so `orderImages` returns nothing both for a record
          with no images and for one whose only image is its cover — and those
          want opposite sentences. "No images yet" is FALSE for the second, and
          the reader can see it is false: the cover is on the same screen.

          Every record in the collection is in the second state TODAY (each has
          one image and it is a cover), so the wrong sentence here would be the
          one the whole collection renders.

          **Correct today and expiring, not a rule.** Both sentences describe an
          unphotographed collection against a schema with four image types.
          When a gatefold is photographed the cover-only state stops being the
          common case and this branch stops rendering for that record — by
          construction, since `tiles` is non-empty — so nothing here hardens
          one image per record into an assumption.
        */
        images.some((image) => image.imageType === 'cover') ? (
          <p data-testid="gallery-cover-note" className="text-prose text-muted-foreground">
            The cover is shown above. Photograph the back, the label, or the dead wax.
          </p>
        ) : (
          <p className="text-prose text-muted-foreground">
            No images yet. Photograph the sleeve, the label, or the dead wax.
          </p>
        )
      ) : (
        /*
          §56 (step 66): the quarter-disc is sized "against the section as it
          stands with one image, whatever the count", and that section
          carries the cover note's row. With tiles the note's sentence is
          stale, so its ROW is kept and its text is not: the same line of
          height, invisible and hidden from readers, so the host above the
          grid is identical at every image count and the disc is too. The
          grid below is what the disc's host measure leaves out.
        */
        <>
        {images.some((image) => image.imageType === 'cover') && (
          <p data-testid="gallery-note-row" aria-hidden="true" className="text-prose" style={{ visibility: 'hidden' }}>
            The cover is shown above.
          </p>
        )}
        {/*
          §56 (step 66): one flowing grid in the fixed type order, each tile
          carrying its type badge; the group headings are gone. Grouped, each
          type took its own tile row, so a group of one cost a full row
          beside empty cells and six images ran to 1829px at 1440. The badge
          names the type, so a heading repeated it; the accepted loss is
          that a type may split across a row wrap.

          `data-not-host-height`: with one image there is no grid, so the
          grid is what the disc's host measure leaves out (`QuarterDisc` in
          OrnamentMarks.tsx).

          Two columns on a phone, four on desktop. Capped at three, a
          1280px page rendered three 226px tiles beside an empty half —
          caught in the screenshot, not by any assertion.
        */}
        <ul data-image-grid data-not-host-height data-testid="image-grid" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {tiles.map(({ type, image }) => (
            <li key={image.id} data-testid="gallery-image" data-image-type={type} className="group relative">
              {/*
                A plain <img>, not next/image: these are blob URLs on a host
                the optimizer is not configured for, and §13 does not ask
                for image optimization. Sized by the grid cell.
              */}
              {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
              <img
                src={image.url}
                alt={image.caption ?? `${imageTypeLabel(type)} of this record`}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="aspect-square w-full border border-border object-cover"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void remove(image.id, imageTypeLabel(type))}
                className="absolute top-1 right-1 h-6 bg-background/90 px-1.5 text-label"
                aria-label={`Delete this ${imageTypeLabel(type).toLowerCase()} image`}
              >
                Delete
              </Button>
              {/* The badge: §4's one label treatment, under the tile rather than over the photograph (§34). */}
              <span data-testid="image-badge" className={`mt-1 block ${LABEL}`}>{imageTypeLabel(type)}</span>
              {image.caption !== null && (
                <p className="mt-1 text-caption text-muted-foreground">{image.caption}</p>
              )}
            </li>
          ))}
        </ul>
        </>
      )}
      </div>
    </Section>
  );
}
