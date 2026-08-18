'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { ShelfRecord } from '@/lib/db/queries/shelf';
import { backFaceGroups } from './back-face';
import { availableFaces, nextFace, type Face } from './faces';
import { riseTransform, riseTransformCss, type Rect } from './rise';
import { chromeStage } from './chrome';
import { NO_TILT, tiltFor } from './tilt';
import { BOX_PANELS, boxRotation, edgeThickness, panelTransform } from './box';

/**
 * §10b: "reduced motion disables all of it. The turn, the rise and the hinge
 * are decorative; the record and its faces are not."
 *
 * Read at call time rather than cached: a reader may change the setting while
 * the page is open, and the OS reports it live.
 */
const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  spineRect,
  measureSpine,
  onClose,
}: {
  record: ShelfRecord;
  /** Where the spine was when it was clicked — FLIP's "First". */
  spineRect: Rect | null;
  /** Re-measures the slot at dismiss time; see `Shelf`'s note on staleness. */
  measureSpine: () => Rect | null;
  onClose: () => void;
}) {
  const [face, setFace] = useState<Face>('front');
  const faces = availableFaces(record);
  const canOpen = faces.includes('gatefold');

  /**
   * §10b: "the record rises out of its slot. It was on the shelf a moment ago
   * and now it is in your hands — that continuity is the feature."
   *
   * **The browser owns the timing and React owns only "is it out".** The
   * duration lives in `globals.css`; nothing here holds it, no `setTimeout`
   * waits on it, and the end of the return is learned from `transitionend` —
   * the browser saying so rather than this guessing.
   *
   * That is the correction from two failed flip attempts, both of which put a
   * copy of the duration in TypeScript and then disagreed with the compositor
   * about the midpoint. A rise has no midpoint to disagree about: nothing is
   * swapped halfway, so the only states are "inverted onto the spine" and "at
   * rest", and one `requestAnimationFrame` moves between them.
   */
  const sleeve = useRef<HTMLDivElement>(null);
  const tiltSurface = useRef<HTMLDivElement>(null);
  const [returning, setReturning] = useState(false);

  /**
   * §10b's "an object you turn": the record follows the pointer, continuously.
   *
   * **No React state per pointer move, and that is a rule rather than an
   * optimisation.** A `useState` here would re-render the component on every
   * `pointermove` — 1000Hz input driving a 60Hz display through React's
   * scheduler, which is the two-systems-share-a-number smell in a new place.
   * The angles are written straight to custom properties and the compositor
   * owns them from there; React never learns the record is turned.
   *
   * No throttle either. The recorded reasoning for the dirty-flag approach
   * applies exactly: a throttled handler still fires and still does work while
   * the pointer rests. Writing two custom properties IS the cheap path — there
   * is nothing left to throttle.
   *
   * The angle is not cleared on leave. §10b's record "holds its last angle",
   * which is what makes it an object someone turned rather than a control that
   * resets itself, and it is also why a still record costs nothing.
   */
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const surface = tiltSurface.current;
    if (surface === null || prefersReducedMotion()) return;

    /**
     * **The reference is the record's LAID-OUT geometry, not any visual box.**
     *
     * `getBoundingClientRect` reports what is on screen, and on this element
     * that is a moving target twice over: during the rise the box measures
     * 188px growing to 512, its x sliding 195 → 384; and once tilted it
     * measures 516.8 x 524.5 against a laid-out 512, because `preserve-3d`
     * depth expands the visual bounds. Feeding either back into the mapping
     * makes the angle depend on the angle, and the round trip stops closing.
     *
     * `offsetWidth`/`offsetHeight` are layout size and ignore transforms
     * entirely; the centre comes from the untransformed OFFSET position walked
     * up the offset parents. So the reference is the same rectangle whatever
     * the record is currently doing — mid-rise, tilted, flipped or still.
     *
     * Third instance of this family in this feature, after unit 10's Invert
     * measuring an already-inverted element and the edges measuring 15.8px
     * mid-rise. Each time: the DOM answers "how does this look" when the
     * question was "how was this laid out".
     */
    const box = surface.querySelector<HTMLElement>('[data-testid="pulled-box"]') ?? surface;

    let left = 0;
    let top = 0;
    for (let node: HTMLElement | null = box; node !== null; node = node.offsetParent as HTMLElement | null) {
      left += node.offsetLeft;
      top += node.offsetTop;
    }

    const { rotateX, rotateY } = tiltFor(
      { x: event.clientX, y: event.clientY },
      { left, top, width: box.offsetWidth, height: box.offsetHeight },
    );

    surface.style.setProperty('--tilt-x', `${rotateX}deg`);
    surface.style.setProperty('--tilt-y', `${rotateY}deg`);
  };

  /**
   * Where the record sits at rest, measured ONCE with no transform applied.
   *
   * **Measuring it live is the bug this replaced**, and it was silent.
   * `useLayoutEffect` runs twice in development, and the second run measured
   * the sleeve while it still carried the first run's inverted transform —
   * `getBoundingClientRect` reports the VISUAL box, so the sleeve measured as
   * the spine, the delta came out zero, and the record rose from exactly where
   * it landed. A fade wearing a rise's clothes, which is §10b's modal complaint
   * arriving by a different route. Pinned by a test in `rise.test.ts`.
   */
  const settledRect = useRef<Rect | null>(null);

  useLayoutEffect(() => {
    const element = sleeve.current;
    if (element === null || spineRect === null) return;

    // First call wins: the rect is the untransformed one, and every later run
    // reuses it rather than re-measuring an element that is mid-flight.
    settledRect.current ??= element.getBoundingClientRect();

    // Invert: start looking exactly like the spine, before the browser paints.
    element.style.transition = 'none';
    element.style.transform = riseTransformCss(riseTransform(spineRect, settledRect.current));

    // Play: next frame, drop both the override and the transform. The CSS class
    // carries it from there — this never learns how long that takes.
    const frame = requestAnimationFrame(() => {
      element.style.transition = '';
      element.style.transform = '';
    });
    return () => cancelAnimationFrame(frame);
    // Measured once per pulled record: re-running on a face change would send
    // the record back to its slot mid-read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.id]);

  /**
   * The return, which is the rise in reverse and the half most likely to snap.
   *
   * The slot is re-measured HERE rather than reused from the rise, because the
   * wall may have scrolled or re-wrapped while the record was out.
   */
  const putBack = () => {
    const element = sleeve.current;
    const slot = measureSpine();

    // No sleeve, no slot, or a reader who asked for less motion: just close.
    // `transitionend` would never fire, and waiting for it would strand the
    // record on screen — the failure mode that is worse than no animation.
    if (element === null || slot === null || prefersReducedMotion()) {
      onClose();
      return;
    }

    setReturning(true);

    /**
     * **Every ending, because a transition has three — and one of them is
     * "never started".**
     *
     * `transitionend` alone stranded the record on screen, and the full E2E run
     * caught it as a failure in the EXISTING Escape test rather than in
     * anything this unit added. Two distinct cases were behind it:
     *
     * 1. Dismissed mid-rise, the interrupted transition fires
     *    `transitioncancel` instead of `transitionend`.
     * 2. Dismissed within a frame of the click — before the rise's
     *    `requestAnimationFrame` has restored the transition — the element is
     *    still carrying `transition: none` from the Invert, so the return
     *    transform applies INSTANTLY and no transition event fires at all.
     *
     * Case 2 is the one that actually bit: Escape landed 6ms after mount, and
     * the record sat at its returned transform for ever with no event coming.
     * A user who changes their mind does it in well under 420ms, so neither
     * case is an edge.
     *
     * `getAnimations()` is the check that covers all three: it asks the browser
     * whether anything is actually running on this element. If nothing is,
     * there is no motion to wait for and the record closes now. Still no
     * duration in TypeScript — this asks whether a transition exists, never how
     * long it lasts.
     */
    const done = () => {
      element.removeEventListener('transitionend', done);
      element.removeEventListener('transitioncancel', done);
      onClose();
    };
    element.addEventListener('transitionend', done);
    element.addEventListener('transitioncancel', done);

    // The SETTLED rect again, for the same reason: the element may already be
    // carrying a transform, and its visual box is not where it belongs at rest.
    element.style.transform = riseTransformCss(
      riseTransform(slot, settledRect.current ?? element.getBoundingClientRect()),
    );

    // Applied above; if that started nothing, close rather than wait for an
    // event that is not coming.
    if (element.getAnimations().length === 0) done();
  };

  /**
   * Escape must run the CURRENT `putBack`, but the listener is registered once.
   * A ref bridges the two: re-registering on every render would tear down and
   * rebuild the listener mid-motion, and closing over the first `putBack` would
   * measure a slot from a render ago.
   */
  const putBackRef = useRef(putBack);
  useEffect(() => {
    putBackRef.current = putBack;
  });

  // Escape closes, as it would on any overlay. Registered once and cleaned up,
  // so a second pulled record does not stack listeners.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') putBackRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
      /*
        **One value, read by three things** (§10b, and `chrome.ts`). The
        backdrop's dim, the control row's arrival and the record's own rise all
        key off this single attribute; the stylesheet gives each its own
        transition and the browser owns every duration. Nothing here sequences
        them.

        Unit 10's defect was that the chrome did not participate at all: at 15%
        through the rise the backdrop was already fully dark and the controls at
        final size, so the record rose into a modal that had already announced
        itself — the exact thing §10b's continuity sentence rejects.
      */
      data-stage={chromeStage({ returning })}
      className="record-chrome fixed inset-0 z-50 flex items-center justify-center p-6"
      onClick={putBack}
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
        <div
          ref={sleeve}
          data-testid="pulled-sleeve"
          data-returning={returning ? 'true' : 'false'}
          className="record-rise"
          style={{ perspective: '1400px' }}
        >
          {/*
            **The tilt gets its OWN element, and that is the whole reason it
            works.**

            Two rotations, two elements, no shared property and no arbitration:
            this one carries the pointer-driven tilt, the box inside it carries
            the flip. Unit 12 found the alternative the hard way — a running
            keyframe's `transform` beats an inline one, so a tilt written to the
            same element the flip animates would be silently dead.
          */}
          <div
            ref={tiltSurface}
            data-testid="pulled-tilt"
            className="record-tilt"
            onPointerMove={onPointerMove}
            style={{ '--tilt-x': `${NO_TILT.rotateX}deg`, '--tilt-y': `${NO_TILT.rotateY}deg` } as CSSProperties}
          >
            {face === 'gatefold' ? (
              /*
                The hinge is a different physical act and keeps its own element
                and its own transform (§10b). It is out of this unit's scope and
                deliberately not a rotation of the box.
              */
              <div
                data-testid="pulled-face"
                data-panel="gatefold"
                className="record-face-open relative aspect-square w-full overflow-hidden rounded-xs bg-card shadow-2xl"
              >
                {record.gatefoldLeftUrl === null ? (
                  <ComposedBack record={record} />
                ) : (
                  /*
                    The LEFT leaf, and only because the hinge is not built yet:
                    §10b's open sleeve shows both leaves rotating about their
                    shared edge, which is the renderer's unit rather than this
                    one. Reaching the gatefold face at all requires BOTH leaves
                    (`availableFaces`), so a record here always has a right leaf
                    too — it is simply not drawn until the hinge exists.
                  */
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={record.gatefoldLeftUrl}
                    alt={`Inside of ${record.title}`}
                    data-testid="pulled-image"
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
            ) : (
              <RecordBox record={record} face={face} />
            )}
          </div>
        </div>

        {/*
          The control row arrives WITH the record rather than ahead of it. It is
          the same class toggle above: no timer, no flag, no waiting on the
          sleeve — it simply answers the same question the backdrop and the
          record answer.
        */}
        <div className="record-controls mt-3 flex flex-wrap items-center gap-2">
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
            onClick={putBack}
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
 * §10b's record as an OBJECT: six panels in one `preserve-3d` box.
 *
 * **The flip falls out of the geometry rather than being animated onto it.**
 * The back is not swapped in when the record turns over — it is already there,
 * behind the front, mirrored and facing outward. Turning the box 180° brings it
 * round. Nothing is exchanged, so there is no midpoint for React and the
 * compositor to disagree about, which is what defeated both earlier attempts.
 *
 * That also retires the half turn NOTES recorded as an honest cost: the
 * outgoing face stays alive all the way to 90° and beyond, because it is a
 * surface of an object rather than the contents of a panel.
 *
 * `boxRotation` supplies the angle and the stylesheet transitions it. The angle
 * is a fact about which way the record faces (§10b as amended) — no duration
 * attached, not read during the motion, gating nothing.
 */
function RecordBox({ record, face }: { record: ShelfRecord; face: Face }) {
  const [faceSize, setFaceSize] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  /**
   * The panels are sized in pixels off the face, so the edges scale with it — a
   * constant would be proportionally vast mid-rise and hairline once settled.
   *
   * **`offsetWidth`, not `getBoundingClientRect`.** The first version used the
   * rect and measured 15.83px instead of 512: the observer fires during the
   * RISE, when the box is still scaled down to spine size, and the rect reports
   * the visual box. The edges were then built from that frame's number and
   * stayed 0.39px wide for ever — geometrically present, invisible, exactly the
   * silent no-op this feature keeps producing.
   *
   * `offsetWidth` is layout size and ignores transforms entirely, so it answers
   * "how big is this element" rather than "how big does it currently look".
   * Third instance of the same family in this feature, after unit 10's Invert
   * and the tilt's reference rect above.
   *
   * Re-measured on resize because the sleeve is `max-w-lg` against a viewport.
   */
  useLayoutEffect(() => {
    const element = box.current;
    if (element === null) return;

    const measure = () => setFaceSize(element.offsetWidth);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={box}
      data-testid="pulled-box"
      data-face={face}
      className="record-box relative aspect-square w-full"
      style={
        {
          '--box-turn': `${boxRotation(face)}deg`,
          '--edge': `${edgeThickness(faceSize)}px`,
        } as CSSProperties
      }
    >
      {BOX_PANELS.map((panel) => {
        const transform = panelTransform(panel.name, faceSize);

        if (panel.kind === 'edge') {
          /*
            The edges are what make it an object. Lit differently from the faces
            deliberately — a side the same colour as the front changes the
            silhouette and nothing else. The same thing the spines already know:
            thickness reads through lightness, not hue.
          */
          return (
            <div
              key={panel.name}
              data-testid={`box-edge-${panel.name}`}
              className={`record-edge record-edge-${panel.name}`}
              style={{ transform }}
            />
          );
        }

        const isFront = panel.name === 'front';
        const image = isFront ? record.coverUrl : record.backUrl;

        return (
          <div
            key={panel.name}
            data-testid={isFront ? 'pulled-face' : 'pulled-back-face'}
            data-panel={panel.name}
            className="record-panel absolute inset-0 overflow-hidden rounded-xs bg-card shadow-2xl"
            style={{ transform }}
          >
            {image === null ? (
              <ComposedBack record={record} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image}
                alt={`${isFront ? FACE_LABEL.front : FACE_LABEL.back} of ${record.title}`}
                data-testid={isFront ? 'pulled-image' : 'pulled-back-image'}
                className="h-full w-full object-cover"
              />
            )}
          </div>
        );
      })}
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
function ComposedBack({ record }: { record: ShelfRecord }) {
  const groups = backFaceGroups(record);

  return (
    <div
      data-testid="composed-face"
      className="h-full w-full overflow-y-auto bg-[#141210] px-7 py-6 text-[#e8e2d8]"
    >
      {/*
        **Flowing from the top, not pinned to the corners.** An earlier version
        used `justify-between`, which put the title at the top and the rows at
        the bottom and left a hole in the middle that GREW as data shrank —
        measured across the real collection at 5 to 8 lines, every record showed
        it, including the densest. That was the layout, not the density.
      */}
      <p className="font-heading text-xl leading-tight font-semibold">{record.title}</p>
      <p className="mt-0.5 text-sm text-[#a09689]">
        {[record.artistName, record.releaseYear].filter(Boolean).join(' · ')}
      </p>

      {groups.length === 0 ? (
        /*
          The honest empty state, and it is the FIRST state of most records:
          §10's quick in-store entry records a title and an artist and nothing
          else. Saying so beats inventing rows, and beats a blank panel that
          reads as a rendering failure.
        */
        <p data-testid="composed-empty" className="mt-6 text-xs text-[#8a8078]">
          Nothing recorded about this pressing yet.
        </p>
      ) : (
        <div className="mt-6 space-y-5">
          {groups.map((group) => (
            <div key={group.kind} data-testid={`face-group-${group.kind}`}>
              {/*
                **Typographic weight is what makes this a sleeve rather than a
                data panel.** The imprint is what a real back cover prints
                largest — label and catalogue number — so it is set larger and
                lighter. Pressing facts are the body text. Provenance is the
                owner's information, which a real sleeve does not carry at all,
                so it is quieter and last.
              */}
              {group.kind === 'imprint' ? (
                <p className="font-mono text-base tracking-wide text-[#d8cfc2]">
                  {group.rows.map((row) => row.value).join('   ')}
                </p>
              ) : (
                <dl
                  className={`grid grid-cols-[5.5rem_1fr] gap-x-4 gap-y-1 ${
                    group.kind === 'provenance' ? 'text-[11px] text-[#8a8078]' : 'text-xs'
                  }`}
                >
                  {group.rows.map((row) => (
                    <div key={row.label} className="contents">
                      <dt className="tracking-wide text-[#7d746b] uppercase">{row.label}</dt>
                      <dd
                        className={`font-mono ${
                          group.kind === 'provenance' ? 'text-[#a09689]' : 'text-[#e8e2d8]'
                        }`}
                      >
                        {row.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
