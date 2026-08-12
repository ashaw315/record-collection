'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { IMAGE_TYPE_ORDER, groupImages, imageTypeLabel, type GalleryImage } from './gallery-order';
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
}: {
  recordId: string;
  images: GalleryImage[];
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [imageType, setImageType] = useState<string>('cover');

  const groups = groupImages(images);

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
    <section className="mt-6" data-testid="image-gallery">
      <h2 className="mb-1 font-heading text-sm font-semibold tracking-tight">Images</h2>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label htmlFor="image-type" className="sr-only">
          Image type
        </label>
        <select
          id="image-type"
          value={imageType}
          onChange={(event) => setImageType(event.target.value)}
          className="h-8 rounded-xs border border-input bg-transparent px-2 text-sm"
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
          className="text-xs file:mr-2 file:rounded-xs file:border file:border-border file:bg-transparent file:px-2 file:py-1 file:text-xs"
        />

        {busy && <span className="text-xs text-muted-foreground">Working…</span>}
      </div>

      {/*
        Stated rather than left to the server's refusal: §5.9's limits are not
        discoverable from an empty file picker, and finding them out by having a
        10MB upload rejected is a bad way to learn them.
      */}
      <p className="mb-3 text-xs text-muted-foreground">
        JPEG, PNG or WebP, up to {MAX_IMAGE_BYTES / (1024 * 1024)}MB.
      </p>

      {error !== undefined && (
        <p role="alert" className="mb-3 text-xs text-destructive">
          {error}
        </p>
      )}

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No images yet. Photograph the sleeve, the label, or the dead wax.
        </p>
      ) : (
        groups.map((group) => (
          <div key={group.type} className="mb-4">
            <h3 className="mb-1.5 text-xs tracking-wide text-muted-foreground uppercase">
              {imageTypeLabel(group.type)}
            </h3>

            {/*
              Two columns on a phone, four on desktop. Capped at three, a
              1280px page rendered three 226px tiles beside an empty half —
              caught in the screenshot, not by any assertion.
            */}
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {group.images.map((image) => (
                <li key={image.id} data-testid="gallery-image" className="group relative">
                  {/*
                    A plain <img>, not next/image: these are blob URLs on a host
                    the optimizer is not configured for, and §13 does not ask
                    for image optimization. Sized by the grid cell.
                  */}
                  {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
                  <img
                    src={image.url}
                    alt={image.caption ?? `${imageTypeLabel(group.type)} of this record`}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="aspect-square w-full border border-border object-cover"
                  />

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void remove(image.id, imageTypeLabel(group.type))}
                    className="absolute top-1 right-1 h-6 bg-background/90 px-1.5 text-xs"
                    aria-label={`Delete this ${imageTypeLabel(group.type).toLowerCase()} image`}
                  >
                    Delete
                  </Button>

                  {image.caption !== null && (
                    <p className="mt-1 text-xs text-muted-foreground">{image.caption}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
