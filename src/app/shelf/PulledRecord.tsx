'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ShelfRecord } from '@/lib/db/queries/shelf';
import { backFaceDetails } from './back-face';
import { availableFaces, nextFace, type Face } from './faces';

/**
 * §10b: "Clicking a spine animates the record off the shelf and into view:
 * front cover forward, the shelf dimmed behind it."
 *
 * **A client component, and the only one on this screen.** The shelf itself is
 * a server component — spines are links and hover is CSS — because a wall of
 * three hundred spines should not ship three hundred handlers. Only the pulled
 * record holds state, so only this is `'use client'`.
 *
 * **Turning and opening are DIFFERENT CONTROLS**, per §10b: "front → turn →
 * back is rotation; front → open → inner spread is a hinge." One button
 * stepping through all three faces would make a single gesture do two jobs and
 * lose the distinction the spec is explicit about. The transitions live in
 * `faces.ts`, tested separately.
 */

const FACE_LABEL: Record<Face, string> = {
  front: 'Front cover',
  back: 'Back',
  gatefold: 'Inside',
};

export function PulledRecord({
  record,
  onClose,
}: {
  record: ShelfRecord;
  onClose: () => void;
}) {
  const [face, setFace] = useState<Face>('front');
  const faces = availableFaces(record);
  const canOpen = faces.includes('gatefold');

  // Escape closes, as it would on any overlay. Registered once and cleaned up,
  // so a second pulled record does not stack listeners.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const details = backFaceDetails(record);

  /** The image for the current face, or `null` when it is composed instead. */
  const imageFor = (current: Face): string | null =>
    current === 'front' ? record.coverUrl : current === 'back' ? record.backUrl : record.gatefoldUrl;

  const image = imageFor(face);

  return (
    /*
      The shelf dimmed behind it (§10b). Clicking the backdrop closes — the
      record is put back where it came from, which is what setting it down does.
    */
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${record.title} — ${record.artistName}`}
      data-testid="pulled-record"
      data-face={face}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-full w-full max-w-lg overflow-y-auto"
        // The record itself is not the backdrop; clicking it must not put it
        // away mid-read.
        onClick={(event) => event.stopPropagation()}
      >
        {/*
          `perspective` on the wrapper and `rotateY` on the face is what makes
          turning read as an object rotating rather than a panel swapping —
          §10b's "most of the feel from transforms and shadows", the same
          technique as the spines.

          The gatefold gets a different transform deliberately: a hinge opens
          about its left edge (`transform-origin: left`) where a turn spins
          about the centre. Two motions, visibly different, because they are
          two different physical acts.
        */}
        <div style={{ perspective: '1400px' }}>
          <div
            data-testid="pulled-face"
            className="relative aspect-square w-full overflow-hidden rounded-xs bg-card shadow-2xl transition-transform duration-300"
            style={
              face === 'gatefold'
                ? { transformOrigin: 'left center', transform: 'rotateY(-14deg) scale(1.02)' }
                : { transform: face === 'back' ? 'rotateY(-6deg)' : 'none' }
            }
          >
            {image === null ? (
              <ComposedBack record={record} details={details} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image}
                alt={`${FACE_LABEL[face]} of ${record.title}`}
                data-testid="pulled-image"
                className="h-full w-full object-cover"
              />
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="turn-record"
            onClick={() => setFace((current) => nextFace(current, 'turn', record))}
            className="rounded-xs border border-border px-3 py-1.5 text-sm text-foreground hover:bg-accent"
          >
            {face === 'front' ? 'Turn over' : 'Turn back'}
          </button>

          {/*
            §10b: the hinge appears ONLY where an inner image exists. "There is
            no generated stand-in: the point of a gatefold is the artwork inside
            it, and a panel of pressing details folded open where a photograph
            should be would be inventing the thing the user came to see."

            So a record with no inner photograph simply has two faces, and
            nothing here suggests otherwise.
          */}
          {canOpen && (
            <button
              type="button"
              data-testid="open-gatefold"
              onClick={() => setFace((current) => nextFace(current, 'open', record))}
              className="rounded-xs border border-border px-3 py-1.5 text-sm text-foreground hover:bg-accent"
            >
              {face === 'gatefold' ? 'Close' : 'Open it out'}
            </button>
          )}

          <Link
            href={`/records/${record.id}`}
            className="rounded-xs px-3 py-1.5 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Full details
          </Link>

          <button
            type="button"
            data-testid="put-back"
            onClick={onClose}
            className="ml-auto rounded-xs px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            Put back
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * §10b's composed back: "rather than a blank or a placeholder image, the back
 * renders what is known … that is close to what a real back sleeve carries, and
 * it means every record is a two-sided object from the day it is entered."
 *
 * Also the FRONT of a record with no cover photograph — a sleeve with no
 * picture is not a blank square, and the fields are what is actually known
 * about it.
 */
function ComposedBack({
  record,
  details,
}: {
  record: ShelfRecord;
  details: ReturnType<typeof backFaceDetails>;
}) {
  return (
    <div
      data-testid="composed-face"
      className="flex h-full w-full flex-col justify-between bg-[#141210] p-6 text-[#e8e2d8]"
    >
      <div>
        <p className="font-heading text-lg leading-tight font-semibold">{record.title}</p>
        <p className="mt-0.5 text-sm text-[#a09689]">{record.artistName}</p>
      </div>

      {details.length === 0 ? (
        /*
          The honest empty state, and it is the FIRST state of most records:
          §10's quick in-store entry records a title and an artist and nothing
          else. Saying so beats inventing rows, and beats a blank panel that
          reads as a rendering failure.
        */
        <p data-testid="composed-empty" className="text-xs text-[#8a8078]">
          Nothing recorded about this pressing yet.
        </p>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          {details.map((row) => (
            <div key={row.label} className="contents">
              <dt className="tracking-wide text-[#8a8078] uppercase">{row.label}</dt>
              <dd className="font-mono text-[#e8e2d8]">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
