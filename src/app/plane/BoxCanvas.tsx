'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  TextureLoader,
  WebGLRenderer,
  type Material,
  type Texture,
} from 'three';
import { tiltFor } from '../shelf/tilt';
import { edgeColourFor } from './edge-colour';
import { createRenderLoop } from './render-loop';
import { riseProgress, shouldStartClock } from './rise-clock';
import { risePose } from './rise-pose';
import { screenRectToWorld, type ScreenRect } from './world-map';
import { centredSquareUv, type Skin, type Skins } from './skins';

/**
 * §10b's record as an OBJECT: a box with all four texture slots mapped onto it.
 *
 * **Still no motion.** No rise, tilt, flip or hinge animation. The box sits at a
 * fixed angle showing a face and an edge at once, because a box viewed face-on
 * is indistinguishable from a plane and this unit's whole claim is that it is
 * not one. Everything that moves is a later unit.
 *
 * **Lighting is why this renderer was adopted** (A19c): a face that shades as it
 * turns, an edge that catches. So `MeshStandardMaterial` rather than unit 15's
 * `MeshBasicMaterial` — but one directional light and enough ambient to keep the
 * artwork legible, not a rig. The trade is that a lit material puts the light
 * between the source image and the pixels, which is exactly why unit 15 used an
 * unlit one to settle the colour question first: that answer is banked, and this
 * unit can afford light because the colour space is already known good.
 */

/**
 * How thick the sleeve is, as a fraction of its face — the WebGL box's own
 * value, deliberately not the CSS box's `SLEEVE_THICKNESS_RATIO`.
 *
 * The CSS constant was derived from arithmetic against unit 12's measured
 * failure and never validated by eye under light. Sharing it would mean this
 * unit's looking-at-it could only be recorded by changing the CSS box, which
 * this unit must leave untouched. Two renderers, two values, until one replaces
 * the other.
 *
 * **1:25, corrected from 1:40 by looking.** Unit 16 rendered all three
 * candidates and then rejected 1:25 on PRINCIPLE — "DVD-case proportion, the
 * reference's own and the wrong thing to borrow" — inside a comparison that
 * existed to be looked at. QA looked and chose 1:25: at 1:40 and 1:70 the edge
 * reads as a dark line on a sheet, and only at 1:25 does it read as a surface
 * of its own.
 *
 * Same shape as the spines, where 1:40 was arithmetic about sleeve thickness
 * and 1:12 was what could actually be read. The eye is the instrument for this
 * question and a principle overrode it.
 */
export const BOX_THICKNESS_RATIO = 1 / 25;

/**
 * How long the rise takes, in milliseconds.
 *
 * **One owner, and this is it.** The CSS version put the duration in a
 * stylesheet and React held nothing; in WebGL there is no stylesheet to own it,
 * so something in this code must. That is not the two-systems smell provided
 * exactly ONE thing holds it — the smell is a number that has to agree between
 * two places. Nothing else reads this: the loop asks for elapsed time and this
 * constant converts it to progress.
 */
export const RISE_MS = 620;

/**
 * How far forward of the wall plane the settled record sits, in world units.
 *
 * The record comes TOWARD the viewer as it leaves the shelf — that is what a
 * record coming off a shelf does, and it is the half of the motion a rect
 * interpolation cannot express. Small relative to the camera's distance (3.4)
 * so the perspective change reads as approach rather than as a zoom.
 */
export const SLOT_DEPTH = 0.55;

/**
 * Ease-out: fast away from the slot, settling gently.
 *
 * A record leaving a shelf accelerates out of the gap and slows as it arrives;
 * linear motion reads as a slide rather than a lift.
 */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * §10b: "reduced motion disables all of it." The record sits face-on and does
 * not respond to the pointer — the object is not decorative, the turning is.
 *
 * Read at call time rather than cached: a reader may change the setting while
 * the page is open, and the OS reports it live. Same helper and same reasoning
 * as `PulledRecord`'s, which the CSS tilt uses.
 */
const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A plain sleeve, drawn as a 1×1 canvas texture rather than a bare colour.
 *
 * Using a texture for both cases keeps ONE material path: a photographed face
 * and a plain one differ in what they sample, not in how they are lit, so the
 * fallback cannot drift into looking like a different kind of surface. §10b is
 * explicit that a plain back is "a real thing rather than a placeholder".
 */
function plainTexture(colour: string, imprint: string | null): Texture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (ctx !== null) {
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, size, size);

    if (imprint !== null) {
      /*
        §10b's fallback back: "label and catalogue number as a small imprint and
        nothing further". Small and low-contrast on purpose — a real back sleeve
        prints its imprint quietly, and this is a sleeve rather than a form.
      */
      ctx.fillStyle = 'rgba(255,255,255,0.34)';
      ctx.font = '500 15px ui-monospace, monospace';
      ctx.textBaseline = 'bottom';
      ctx.fillText(imprint, 34, size - 34);
    }
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function BoxCanvas({
  skins,
  imprint,
  spineColour,
  riseFrom = null,
  returnTo = null,
  onReturned,
  thicknessRatio = BOX_THICKNESS_RATIO,
  label,
  testId = 'box-canvas',
  fill = false,
}: {
  skins: Skins;
  imprint: string | null;
  /** The record's stored colour, from which the edge tone is derived. */
  spineColour: string | null;
  /**
   * The slot to rise out of, viewport-relative, or null to appear in place.
   *
   * Re-measured by the caller at click time rather than cached: a resize
   * re-wraps the row and moves every spine, so a remembered rect sends the
   * record back to where its slot used to be.
   */
  riseFrom?: ScreenRect | null;
  /**
   * Re-measures the slot AT DISMISS TIME and returns the record to it.
   *
   * **A callback rather than a rect, and that is the whole point.** Unit 19's
   * rule, carried across from the CSS implementation: the wall may have
   * scrolled or re-wrapped while the record was out, so a rect remembered from
   * the rise sends it back to where its slot used to be. The DOM is the source
   * of truth for where a spine is; a copy of it is a bug waiting for the first
   * scroll — and the page scrolls freely here, so that is reachable by anyone
   * with a wheel.
   *
   * Returning `null` means the slot has gone (filtered away, or the record
   * deleted), and the record fades rather than flying to a stale position.
   */
  returnTo?: (() => ScreenRect | null) | null;
  /** Set while the record is going back, so the caller can unmount when done. */
  onReturned?: () => void;
  thicknessRatio?: number;
  label?: string;
  /** So a caller can address ONE canvas among several on a page. */
  testId?: string;
  /**
   * Sizes to the container and drops the opaque backdrop and the status line.
   *
   * `/plane` is a workbench: a fixed 420px square on a dark ground, with the
   * loading state printed beneath it, because the point there is to compare
   * renders side by side. Over the real wall none of that is wanted — the
   * canvas is a transparent sheet the record is held up on, and a `#111`
   * rectangle would be a box beside the wall rather than a record out of it.
   *
   * A flag rather than two components: everything else about the render is
   * identical, and forking it would give the workbench and the real screen two
   * renderers that must agree.
   */
  fill?: boolean;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');

  /**
   * The live scene, so the RETURN can drive the same mesh through the same loop
   * without rebuilding either.
   *
   * A ref rather than state: nothing renders from it, and putting a three.js
   * mesh in React state would re-render the tree on every frame of an animation
   * whose entire point is that React is not involved.
   */
  const live = useRef<{
    animate: (step: (now: number) => boolean) => void;
    setPose: (p: { x: number; y: number; z: number; rotationY: number; scale: number }) => void;
    canvasRect: () => ScreenRect;
  } | null>(null);

  useEffect(() => {
    const host = mount.current;
    if (host === null) return;

    const width = host.clientWidth;
    const height = host.clientHeight;

    const renderer = new WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    renderer.outputColorSpace = SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const scene = new Scene();

    // Perspective rather than unit 15's orthographic: an edge seen in
    // perspective converges, which is part of what makes it read as depth.
    const camera = new PerspectiveCamera(30, width / height, 0.1, 100);
    camera.position.set(0, 0, 3.4);

    /*
      One directional light and ambient enough to keep artwork legible. The
      directional is offset so it rakes ACROSS the face rather than facing it
      squarely — a light head-on lights a box exactly like a plane, which would
      defeat the point.
    */
    scene.add(new AmbientLight(0xffffff, 1.45));
    const key = new DirectionalLight(0xffffff, 2.1);
    key.position.set(-1.4, 1.1, 2.2);
    scene.add(key);

    const depth = thicknessRatio;
    const geometry = new BoxGeometry(1, 1, depth);

    /*
      BoxGeometry's material order is [+x, -x, +y, -y, +z, -z]: right, left,
      top, bottom, FRONT, BACK. Getting this order wrong puts the cover on an
      edge, which is obvious — but putting the back on the front is not, on a
      record whose faces are both plain.
    */
    /**
     * **The edge is derived from the face, not fixed** — unit 16's defect.
     *
     * A constant dark edge works against a photographed cover and disappears
     * against a plain sleeve of similar tone, which is the face every record
     * shows today. `edgeColourFor` moves away from the face's own luminance, so
     * the two separate at every lightness rather than only in the middle.
     */
    const edgeMaterial = () =>
      new MeshStandardMaterial({
        color: edgeColourFor(spineColour),
        roughness: 0.85,
        metalness: 0.02,
      });

    const faceMaterial = () => new MeshStandardMaterial({ roughness: 0.62, metalness: 0.0 });

    const front = faceMaterial();
    const back = faceMaterial();
    const materials: Material[] = [
      edgeMaterial(),
      edgeMaterial(),
      edgeMaterial(),
      edgeMaterial(),
      front,
      back,
    ];

    /**
     * **At rest the record faces you square on, at zero rotation.**
     *
     * Every previous `/plane` frame showed a fixed three-quarter angle, which
     * flatters the geometry: a box at an angle is obviously a box, and face-on
     * it is indistinguishable from a plane. So the object-ness now has to
     * arrive from the MOTION rather than from the pose, which is the actual
     * claim the renderer was adopted for.
     */
    const mesh = new Mesh(geometry, materials);
    scene.add(mesh);

    let disposed = false;
    const owned: Texture[] = [];
    let pending = 0;

    /**
     * **Render on a dirty flag, never per event** (NOTES, recorded before any
     * three.js work began). A still record costs nothing: the pointer handler
     * sets a flag and returns, and the loop draws at most once per frame.
     */
    const loop = createRenderLoop(() => {
      if (!disposed) renderer.render(scene, camera);
    });
    loop.start();

    const draw = () => loop.markDirty();

    const applySkin = (skin: Skin, material: MeshStandardMaterial, withImprint: boolean) => {
      if (skin.kind === 'plain') {
        const texture = plainTexture(skin.colour, withImprint ? imprint : null);
        owned.push(texture);
        material.map = texture;
        material.needsUpdate = true;
        return;
      }

      pending += 1;
      new TextureLoader().load(
        skin.url,
        (texture) => {
          if (disposed) {
            texture.dispose();
            return;
          }
          texture.colorSpace = SRGBColorSpace;

          /*
            A22: a non-square image is CROPPED to square from its centre at
            mapping time, never by touching the stored file. `repeat`/`offset`
            move the sampling window; the bytes and the gallery are untouched.
          */
          const uv = centredSquareUv(texture.image.width, texture.image.height);
          texture.repeat.set(uv.repeatX, uv.repeatY);
          texture.offset.set(uv.offsetX, uv.offsetY);

          owned.push(texture);
          material.map = texture;
          material.needsUpdate = true;
          pending -= 1;
          draw();
          if (pending === 0) setStatus('ready');
        },
        undefined,
        () => {
          pending -= 1;
          if (!disposed) setStatus('failed');
        },
      );
    };

    /**
     * §10b's tilt, driven by the SAME pure mapping the CSS version uses.
     *
     * `tilt.ts` takes a pointer position and a rect and returns two angles:
     * absolute mapping, clamped, with a round-trip test proving it maps
     * position rather than accumulating deltas. None of that is
     * renderer-specific, so this converts degrees to radians and does nothing
     * else. A second implementation would be the shape NOTES records under
     * `genreSubtree` and `hasGatefold` — the fourth chance this session to
     * reuse rather than reimplement.
     *
     * **The rect must be in the SAME coordinate system as the pointer**, and
     * that is the whole of this. `clientX`/`clientY` are viewport-relative, so
     * the rect has to be too.
     *
     * An earlier version walked `offsetLeft`/`offsetTop` up the offset parents,
     * copied from the CSS implementation. Those are DOCUMENT-relative, so on a
     * scrolling page the vertical axis drifted by exactly `scrollY` while the
     * horizontal one — which never scrolls here — stayed correct. Measured at
     * `scrollY = 184`: the walked rect gave `top = 764` where the record was
     * visually at `y = 580`, so the pointer at the record's own centre
     * normalised to `-0.876` and produced `rotateX = +14°` instead of zero. The
     * whole usable range was compressed into the bottom tenth of the record.
     *
     * `getBoundingClientRect` is viewport-relative and is therefore right here.
     * Unit 13 moved AWAY from it for the CSS tilt because there the measured
     * element carried the tilt transform itself, so its visual box fed the angle
     * back into itself. That does not apply to this canvas: the mesh rotates
     * inside it and the element never moves, so its visual box is stable.
     *
     * The CSS implementation still walks offsets and is still correct there —
     * it lives inside a `position: fixed` overlay with the body scroll-locked,
     * so `scrollY` is always zero and the two systems coincide. Latent there,
     * live here.
     */
    const onPointerMove = (event: PointerEvent) => {
      if (prefersReducedMotion()) return;

      const rect = host.getBoundingClientRect();

      const { rotateX, rotateY } = tiltFor(
        { x: event.clientX, y: event.clientY },
        { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      );

      mesh.rotation.x = (rotateX * Math.PI) / 180;
      mesh.rotation.y = (rotateY * Math.PI) / 180;

      // A flag, not a render: the loop decides when to draw.
      draw();
    };

    host.addEventListener('pointermove', onPointerMove);

    /**
     * §10b's rise: "the record rises out of its slot … a record that fades in
     * centred is a modal wearing a sleeve."
     *
     * **Measured BEFORE the first paint and never re-measured mid-flight.**
     * Unit 10's first defect was a `useLayoutEffect` running twice in dev, so
     * the second run measured an element already carrying the first transform
     * and produced an identity — a record that rose from exactly where it
     * landed, with a settled frame indistinguishable from a working one. Here
     * the source rect comes from the caller and the canvas rect is read once,
     * so nothing measures a thing it has already moved.
     *
     * Driven from the SAME rAF loop as the dirty flag rather than a second
     * mechanism, and the loop is asked to stop when the rise completes — a rise
     * that leaves it running for ever is the cost the flag exists to avoid.
     */
    let riseStart: number | null = null;

    if (riseFrom !== null && !prefersReducedMotion()) {
      const canvasRect = host.getBoundingClientRect();
      const from = screenRectToWorld(riseFrom, canvasRect);

      /**
       * **The computed start, published so a test can read what this component
       * actually did** rather than re-deriving the projection from the same
       * inputs and agreeing with itself.
       *
       * That distinction is not academic: the first version of the integration
       * test recomputed `screenRectToWorld` in the page and passed against a
       * mapping that ignored the slot entirely, and against one carrying unit
       * 18's `+ scrollY` defect. A test that does its own arithmetic asserts
       * the arithmetic, not the code.
       *
       * Written as data attributes because the alternative — a callback prop —
       * would be a second channel for the same fact, and this one cannot drift
       * from the mesh: both are set from `from` on the line below.
       */
      host.dataset.riseX = String(from.x);
      host.dataset.riseY = String(from.y);
      host.dataset.riseScaleX = String(from.scaleX);
      host.dataset.riseScaleY = String(from.scaleY);
      host.dataset.canvasLeft = String(canvasRect.left);
      host.dataset.canvasTop = String(canvasRect.top);
      host.dataset.canvasWidth = String(canvasRect.width);
      host.dataset.canvasHeight = String(canvasRect.height);

      /*
        **Edge-on in the slot**, which is what a spine IS. The box starts at its
        true proportions and looks like a spine because it is turned side-on,
        rather than being a squashed rectangle that has to un-squash.
      */
      const startPose = risePose({ progress: 0, slotDepth: SLOT_DEPTH });
      mesh.position.set(from.x, from.y, startPose.z);
      mesh.rotation.y = startPose.rotationY;
      mesh.scale.setScalar(startPose.scale);

      /**
       * **One warm-up frame at the slot, then the clock.**
       *
       * The first `render()` costs 45.4ms against 0.4-0.9ms for every one
       * after it — shader compilation and pipeline setup, which WebGL defers
       * to the first draw — and React commits the overlay, scrim and panels in
       * the same frame. Together they stalled the second animation frame to
       * 117ms, which at `easeOut` is 51% risen: the whole spine-shaped half of
       * the rise was never drawn.
       *
       * Diagnosed before fixing, because *delay the start* and *warm the
       * pipeline* are different answers and only one is right here. Neither
       * cost is the animation being slow, so delaying would move the stall
       * rather than remove it. Drawing one frame first spends the expensive
       * frame while the record is still at the slot, at spine size — exactly
       * where it should be at progress 0.
       */
      let framesDrawn = 0;
      const frameLog: Array<{ progress: number; at: number }> = [];

      loop.animate((now) => {
        if (!shouldStartClock({ framesDrawn })) {
          framesDrawn += 1;
          // Drawn at the slot, so the warm-up frame shows the record where the
          // spine is rather than anywhere else.
          return true;
        }

        // The clock starts on the first WARM frame, not on the effect: the two
        // do not share a clock and the gap between them is real.
        if (riseStart === null) riseStart = now;
        const progress = riseProgress({ now, startedAt: riseStart, durationMs: RISE_MS });
        const eased = easeOut(progress);

        /**
         * **The frame log, published rather than probed.**
         *
         * This is the only instrument that has answered a question about this
         * animation correctly. Screenshot sampling reported the box SHRINKING —
         * the opposite of the defect — because a round trip costs ~100ms and
         * never saw the first half of a 620ms rise. Rect assertions cannot see
         * a mesh at all.
         *
         * Bounded, so a long-lived page cannot grow it without limit; the rise
         * is 38 frames at 60fps and the first few are what any assertion about
         * a stall needs.
         */
        if (frameLog.length < 64) frameLog.push({ progress, at: now });
        host.dataset.riseProgress = String(progress);
        host.dataset.riseFrames = String(frameLog.length);
        host.dataset.riseFirstProgress = String(frameLog[0]?.progress ?? -1);
        host.dataset.riseSecondProgress = String(frameLog[1]?.progress ?? -1);

        /**
         * **A motion the box performs, not a rect it is drawn inside.**
         *
         * The old version interpolated position and scale from the spine's rect
         * to the settled rect — unit 19's FLIP, which was right for a CSS plane
         * and reads on a real box as a square shrinking and expanding. A spine
         * is the EDGE of a record, so leaving the shelf is a quarter turn about
         * Y and a translation in Z, both of which are free under a real camera
         * and neither of which CSS could have done.
         *
         * The lateral travel from the slot to the centre stays an
         * interpolation, because that part genuinely is one: the record moves
         * across the wall to where it is read.
         */
        const pose = risePose({ progress, slotDepth: SLOT_DEPTH });

        mesh.position.set(from.x * (1 - eased), from.y * (1 - eased), pose.z);
        mesh.rotation.y = pose.rotationY;
        mesh.scale.setScalar(pose.scale);

        // `false` ends the animation, and with it the loop's reason to run.
        return progress < 1;
      });
    }

    applySkin(skins.front, front, false);
    applySkin(skins.back, back, true);

    draw();
    if (pending === 0) setStatus('ready');

    /*
      Counted so a test can assert the scene is built ONCE per record rather
      than once per render. Measured before this was fixed: six pulls created
      EIGHTEEN WebGL contexts — three per pull — because `skins` was a fresh
      object on every render and is an effect dependency, so any re-render tore
      down the renderer, geometry, materials and lights and built them again.
      Each rebuild cost a ~31ms first draw.
    */
    const counter = window as unknown as { __sceneBuilds?: number };
    counter.__sceneBuilds = (counter.__sceneBuilds ?? 0) + 1;

    live.current = {
      animate: (step) => loop.animate(step),
      /*
        Takes a POSE now, not a placement: the return is the rise reversed, and
        the rise turns. A position-and-scale channel could not express the
        record turning back edge-on as it goes into the slot.
      */
      setPose: (p: { x: number; y: number; z: number; rotationY: number; scale: number }) => {
        mesh.position.set(p.x, p.y, p.z);
        mesh.rotation.y = p.rotationY;
        mesh.scale.setScalar(p.scale);
      },
      canvasRect: () => {
        /*
          Read from the ref rather than a captured local: the narrowing at the
          top of the effect does not survive into a closure called later, and a
          non-null assertion to silence that is forbidden (CLAUDE.md §6).
        */
        const node = mount.current;
        if (node === null) return { left: 0, top: 0, width: 0, height: 0 };
        const r = node.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height };
      },
    };

    return () => {
      disposed = true;
      loop.stop();
      host.removeEventListener('pointermove', onPointerMove);
      live.current = null;
      renderer.domElement.remove();
      geometry.dispose();
      for (const texture of owned) texture.dispose();
      for (const material of materials) material.dispose();
      renderer.dispose();
    };

    /*
      `riseFrom` is a dependency because the effect reads it. The caller also
      keys the component on the spine, so a second click remounts rather than
      re-running — but the array must be honest regardless, or the next person
      to remove that key gets a rise that never restarts.
    */
  }, [skins, imprint, spineColour, thicknessRatio, riseFrom]);

  /**
   * **The return**, in its own effect so it drives the existing mesh through the
   * existing loop rather than rebuilding the scene.
   *
   * §10b: the record goes back where it came from. The canvas integration
   * carried the rise across and not this, so dismissal was instant.
   *
   * **The slot is re-measured HERE, at dismiss time**, which is unit 19's rule
   * carried across from the CSS implementation. The wall may have scrolled or
   * re-wrapped while the record was out — the page scrolls freely, so that is
   * reachable by anyone with a wheel — and a rect remembered from the rise
   * would send the record back to where its slot used to be.
   */
  useEffect(() => {
    if (returnTo === null || returnTo === undefined) return;

    const scene = live.current;
    const host = mount.current;
    if (scene === null || host === null) {
      onReturned?.();
      return;
    }

    const slot = returnTo();
    if (slot === null || prefersReducedMotion()) {
      // No slot to go back to, or motion is off: the record simply goes.
      onReturned?.();
      return;
    }

    const canvas = scene.canvasRect();
    const to = screenRectToWorld(slot, canvas);

    /*
      Published for the same reason the rise's start is: so a test can read what
      this component targeted rather than deriving it and agreeing with itself.
    */
    host.dataset.returnLeft = String(slot.left);
    host.dataset.returnTop = String(slot.top);

    let started: number | null = null;
    let finished = false;

    scene.animate((now) => {
      if (started === null) started = now;
      const progress = riseProgress({ now, startedAt: started, durationMs: RISE_MS });

      /*
        Ease-IN, the mirror of the rise's ease-out: a record going back
        accelerates toward the gap rather than drifting into it. Using the same
        ease both ways reads as the animation being played backwards.
      */
      const eased = progress * progress * progress;

      /**
       * **The rise's motion, reversed**: the record turns back edge-on as it
       * goes into the slot, rather than shrinking into it face-on. Same
       * `risePose`, read from 1 down to 0, so the two directions cannot
       * describe different objects.
       */
      const pose = risePose({ progress: 1 - eased, slotDepth: SLOT_DEPTH });

      scene.setPose({
        x: to.x * eased,
        y: to.y * eased,
        z: pose.z,
        rotationY: pose.rotationY,
        scale: pose.scale,
      });

      if (progress >= 1 && !finished) {
        finished = true;
        onReturned?.();
      }

      return progress < 1;
    });
  }, [returnTo, onReturned]);

  if (fill) {
    return (
      <div
        ref={mount}
        data-testid={testId}
        data-status={status}
        /*
          Square, and sized from the viewport's SHORTER axis so the record is
          fully visible in both orientations. `min()` rather than a media query:
          the constraint is "fits the screen", which is one rule, and expressing
          it as two breakpoints would be two places to keep in agreement.
        */
        className="pointer-events-auto aspect-square w-[min(70vw,70vh,560px)] shrink-0"
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={mount}
        data-testid={testId}
        data-status={status}
        className="h-[420px] w-[420px] bg-[#111]"
      />
      <p className="font-mono text-xs text-muted-foreground">
        {label ?? 'box'} · {status}
      </p>
    </div>
  );
}
