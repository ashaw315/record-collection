'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  TextureLoader,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
} from 'three';
import type { ShelfRecord } from '@/lib/db/queries/shelf';
import {
  DEFAULT_SPINE_COLOUR,
  MAX_SPINE_WIDTH,
  SPINE_HEIGHT,
  spineText,
  spineWidth,
  textColourOn,
} from '../shelf/spine';
import { SHELF_LIP, SHELF_PLANE, WALL_BACK } from '../shelf/shelf-surface';
import { createRenderLoop } from './render-loop';
import { risePose } from './rise-pose';
import { RISE_MS, prefersReducedMotion } from './BoxCanvas';
import { spineLabelPlan } from './spine-texture';
import { centredSquareUv } from './skins';
import { layoutWall, type WallLayout } from './wall-layout';
import { WALL_FOV_DEGREES } from './wall-camera';
import {
  framedCameraDistance,
  shelfSurfaceDepth,
  SHELF_LIP_DEPTH,
} from './wall-framing';
import { pulledDestination } from './pulled-destination';
import { boxDepth } from './record-box';
import { wallDim } from './wall-dim';
import { PROUD_MS, proudOffset, shouldRedraw } from './hover-proud';
import { NO_TILT, tiltFor } from '../shelf/tilt';
import { beginDrag, endDrag, shouldStartTiltDrag, swipeDirection, type TiltDrag } from './touch-tilt';
import { RecordPanel } from './RecordPanel';
import { recordSummary } from './summary';
import { recordLayout } from './record-layout';
import { adjacentRecordId, hasAdjacent, type Direction } from './adjacent-record';
import { useScrollLock } from './use-scroll-lock';
import { factPanel } from './panel';
import { PANEL_GROUND, PANEL_TEXT } from '../shelf/panel-palette';
import {
  canTilt,
  dismiss,
  flip,
  outRecordId,
  pull,
  settle,
  slide,
  showsBack,
  type RecordState,
} from './record-state';
import { createWidthWatcher } from './wall-resize';
import { RESTING_ROTATION_Y } from './spine-facing';
import { type Surface, surfaceKind } from './surface-kind';

/**
 * §10b's wall and its records, in ONE scene.
 *
 * **Why the wall moved into the renderer.** QA found the thing no amount of
 * easing fixes: the spine never leaves the wall. With a CSS wall and a WebGL
 * record in a canvas over it, clicking a spine leaves that spine drawn, lit and
 * in place while a separate object appears in front of it — no empty slot, no
 * occlusion, one light on each. It reads as *a thing appeared near a shelf*.
 *
 * The alternative was collapsing the CSS spine as the WebGL record emerges,
 * which is two systems agreeing about a midpoint — the shape that has failed
 * every time it has been tried here.
 *
 * This reverses A24e, which argued the wall should be CSS because a static wall
 * has no perspective to render. True of a static wall, and wrong about the one
 * motion that matters.
 *
 * ---
 *
 * **The camera is ORTHOGRAPHIC, and that is A24b rather than a shortcut.**
 * "Every spine is at the same angle and equally legible; there is no camera, no
 * perspective on the wall itself." Being in a 3D scene does not mean adopting
 * the reference's room — Criterion's closet foreshortens the spines toward the
 * edges, and this wall exists to be scanned by eye.
 *
 * It also makes the wall-pixel-to-world mapping exact rather than projective,
 * so a spine's position on screen is arithmetic the layout already did.
 *
 * **Scroll: a tall canvas that scrolls with the page.** The alternative — a
 * fixed canvas with the camera panning — is camera work, which is what A24b
 * rules out, and it puts the wall and the page in two coordinate systems that
 * must agree about a scroll offset. That is unit 18's defect by construction.
 * A canvas sized to the whole wall scrolls because the page does, and every
 * measurement stays in one system.
 *
 * The cost is honest and stated: a 125-record wall is three rows, so the canvas
 * is roughly 750px tall rather than viewport-height. At more rows this becomes
 * a real memory question and the answer will be to render only the visible
 * rows — which the computed layout already makes possible, because it knows
 * which row every spine is in.
 */



/**
 * **Shelf treatments, for the `/scene` comparison only.**
 *
 * The wall is viewed square-on, so a horizontal surface has no visible extent —
 * the shelf's top face projects to almost nothing whatever depth it is given.
 * Every option here except `tilt` is therefore a CUE that suggests depth rather
 * than depth being visible, which is the finding that reopened the camera
 * question (NOTES, "a decision held on one axis").
 *
 * `undefined` is production's behaviour and must stay the default.
 */
export type ShelfTreatment = 'depth' | 'tilt' | 'tilt-12' | 'tilt-20' | 'shadow' | 'gradient';

export function WallScene({
  records,
  treatment,
}: {
  records: ShelfRecord[];
  treatment?: ShelfTreatment;
}) {
  const mount = useRef<HTMLDivElement>(null);
  /**
   * **What the record is doing — one value.**
   *
   * Pulled, rising, settled, flipping and returning were separate flags, and
   * this unit adds tilting on top. Held apart they are the shape that has
   * failed here every time: a record dismissed mid-flip stuck because two
   * owners disagreed about whether it was still out.
   *
   * `record-state.ts` owns the transitions; everything below derives.
   */
  const [state, setState] = useState<RecordState>({ phase: 'idle' });
  const pulledId = outRecordId(state);
  /**
   * Which record is on its way back, if any.
   *
   * A dismissal cannot be animated from `pulledId` alone: by the time the
   * record should start moving, `pulledId` is already null and the scene no
   * longer knows which mesh to fly home. This holds that for the length of the
   * return and clears itself when it lands.
   */
  const returningId = state.phase === 'returning' ? state.recordId : null;
  const sliding = state.phase === 'sliding' ? state : null;

  /**
   * Which record the card is naming, and where the pointer is.
   *
   * **The card is DOM, not canvas** — A19e's reasoning: a canvas has no text,
   * so anything other than an eye reads nothing. It is also chrome rather than
   * part of the scene, which is what the reference does.
   *
   * Held in React because it renders React; the PROUD MOTION is driven inside
   * the scene effect and never re-renders, which is what keeps a fast crossing
   * from costing forty renders.
   */
  const [hoveredRecordId, setHoveredRecordId] = useState<string | null>(null);
  const [cardAt, setCardAt] = useState<{ x: number; y: number } | null>(null);

  /**
   * The viewport width, watched only for the §10b/A32 layout fork: panels beside
   * the record above the threshold, a stacked summary below it. Separate from
   * the scene's own width watcher (which rebuilds the wall) because this drives
   * DOM chrome, not the canvas, and a re-render on resize is all it needs.
   */
  const [viewportWidth, setViewportWidth] = useState<number | null>(null);
  useEffect(() => {
    const measure = () => setViewportWidth(window.innerWidth);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  /**
   * The pulled id, readable from the click handler.
   *
   * The handler is bound inside the scene effect, which deliberately does NOT
   * re-run when a record is pulled — rebuilding 125 meshes on every click is
   * the cost this scene is careful about. So it closes over the value at build
   * time, which is always null. A ref is the read-through.
   */
  const pulledIdRef = useRef<string | null>(null);

  /*
    **The scroll position from BEFORE the rise scrolled the wall.** The rise
    centres the record by scrolling the page; the scroll lock must restore where
    the reader WAS, not where the rise left the wall, or "put back" leaves the
    wall somewhere the reader never put it. Captured at rise-start, consumed on
    release.
  */
  const preRiseScrollY = useRef<number | null>(null);

  /*
    **The latest `navigate`, held in a ref for the touch effect.** The effect is
    keyed on `[state]`, but `navigate` closes over `pulledId` and `order`, which
    change independently — a direct reference would capture a stale one. The ref
    is updated every render (below) and the effect reads `.current`, so a swipe
    always moves from the record that is actually out.
  */
  const navigateRef = useRef<(direction: Direction) => void>(() => {});

  /*
    Written in an effect rather than during render: reading or writing a ref
    while rendering is unsound and `react-hooks/refs` rejects it, correctly.
    Same reasoning `CollectionFilters` records for its pending-navigation ref.
  */
  useEffect(() => {
    pulledIdRef.current = pulledId;
  }, [pulledId]);

  /**
   * Memoised, because the scene effect depends on it.
   *
   * The last unit measured an unmemoised `resolveSkins` rebuilding the whole
   * WebGL scene on every render — three contexts per pull, ~31ms each. A wall
   * of 125 spines has far more to rebuild, so the same mistake would cost far
   * more here.
   */
  /**
   * The spines, memoised — the layout itself is computed inside the effect from
   * the width it measures there, so there is exactly one answer to "how wide is
   * the wall" rather than two that must agree.
   */
  const spines = useMemo(
    () => records.map((record) => ({ id: record.id, width: spineWidth(record.id) })),
    [records],
  );

  /** The scene, exposed so the pull can drive it without a rebuild. */
  const live = useRef<{
    setPulled: (id: string | null, progress: number) => void;
    animate: (step: (now: number) => boolean) => void;
    setFlip: (turn: number) => void;
    setTilt: (next: { rotateX: number; rotateY: number }) => void;
    /** Does a viewport point land on the pulled record's mesh? (touch boundary) */
    hitsPulledRecord: (clientX: number, clientY: number) => boolean;
    /** Recompute the pulled destination from the current scroll (call at pull start). */
    recomputeDestination: () => void;
    /**
     * **A lateral slide between records (13b).** `progress` 0..1 moves `fromId`
     * off one side and `toId` in from the other, both at the settled depth. Not
     * a rise: the depth does not change, only x. At progress 1 `toId` is centred
     * and `fromId` is off-screen.
     */
    setSlide: (
      fromId: string,
      toId: string,
      direction: 'next' | 'previous',
      progress: number,
    ) => void;
  } | null>(null);

  /**
   * **Built from a width measured INSIDE the effect, on a layout frame.**
   *
   * An earlier version held the width in state, measured it in a separate
   * effect, and rebuilt the scene when it changed. That failed reproducibly
   * above ~85 records and worked below it: the measuring effect reported the
   * correct width, and the scene effect never re-ran to see it.
   *
   * Two pieces of state that must agree about one number — the smell this
   * project keeps meeting — and the fix is the same as every other time: remove
   * one of them. There is no width state now: `createWidthWatcher` measures the
   * element the scene is about to draw into and calls back when that width
   * genuinely changes.
   *
   * **An earlier version of this comment claimed a `ResizeObserver` re-ran the
   * effect "by bumping a version counter".** No such counter existed and none
   * ever had — a confident sentence describing a mechanism that was never
   * built, sitting above code that did the opposite. It is built now.
   */
  useEffect(() => {
    const host = mount.current;
    if (host === null) return;

    let cancelled = false;
    let teardown: (() => void) | null = null;

    /**
     * **Rebuilt whenever the container's width actually changes.**
     *
     * The wall re-wraps on any width change, so every slot moves — and both the
     * rise and the return map to slots. Without this a resize left the scene
     * describing a layout that no longer existed: a record rising out of a gap
     * that is not where the gap is.
     *
     * `createWidthWatcher` owns the three decisions that make this affordable
     * rather than a loop: report a change, do NOT report an unchanged width
     * (the observer fires when the canvas is inserted, which the rebuild itself
     * does), and ignore zero.
     */
    const stopWatching = createWidthWatcher({
      element: host,
      onWidth: (width) => {
        if (cancelled || spines.length === 0) return;

        // The previous scene goes before the next one is built: two WebGL
        // contexts for one wall is the cost this scene is careful about.
        teardown?.();
        teardown = build(host, width, layoutWall({ spines, viewportWidth: width }));
      },
    });

    return () => {
      cancelled = true;
      stopWatching();
      teardown?.();
    };

    function build(host: HTMLDivElement, width: number, layout: WallLayout): () => void {

    /*
      **Two heights, since A35 removed the four-row minimum.** `layout.height` is
      the CONTENT height — the rows the records actually fill — and the shelves
      draw against it. `height` is the RENDER surface: at least the viewport, so
      a pulled record floating at the viewport centre is contained rather than
      clipped off the bottom of a one-row canvas (which read as a stamp-sized,
      cut-off record). The extra height below the content is WALL_BACK, which
      reads as wall, not as empty shelves — the very thing the minimum was
      removed to avoid. Content sits at the top (y = 0..layout.height); the
      camera frames the taller surface at 1:1, so a spine is still 240px.

      Guarded against SSR/measurement gaps with a sane floor, and it only ever
      GROWS the surface — a tall collection keeps its own height.

      **The floor is the height BELOW the page chrome, not the whole window**,
      and the difference is a bug this shipped with. The canvas starts under the
      nav and heading (~197px), so a floor of `window.innerHeight` makes the
      surface overshoot the fold by exactly that much: at 974px the canvas ran
      to page-y 1171, and a record aimed at the centre of its visible slice
      settled at 318..853 — on screen, but hanging below a 248px shelf into
      black padding that only existed because the canvas was too tall.

      Measured across four/125 records at three viewports; the fix changes the
      short case only. When the content is taller than the visible height it
      wins the `max()` and nothing moves — 125 records at 1280 stays 992, at 390
      stays 3224 — so the page keeps scrolling a tall wall exactly as before.
      No inner scroll container, no camera panning with scroll: those would be
      forced by a literal "the wall always fills the viewport" rule, and A24a
      does not say that. It says the wall is not a section of a page under four
      rows of controls, which is about what sits ABOVE the canvas.

      Deliberately NOT stretching the wall CONTENT to fill the viewport. A24c
      removed the four-row minimum because empty shelves "say in furniture what
      a count says in words"; a 248px shelf stretched to 777px is that mistake
      in a different geometry. The shelf stays its own size and the space below
      it inside the canvas is where the pulled record comes forward into.
    */
    const chromeAbove = typeof window === 'undefined' ? 0 : host.getBoundingClientRect().top + window.scrollY;
    const viewportFloor =
      typeof window === 'undefined' ? 0 : Math.max(0, window.innerHeight - chromeAbove);
    const height = Math.max(layout.height, viewportFloor);

    const renderer = new WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const scene = new Scene();
    scene.background = new Color(WALL_BACK);

    /**
     * **One perspective camera with a very long lens** — near-orthographic
     * across the wall, converging enough that a turn reads as a turn.
     *
     * A24b and §10b conflict under a single ORTHOGRAPHIC camera: a rotation
     * about Y with no convergence is a pure horizontal squash, so a turning
     * record reads as being squeezed. Measured twice on this route before the
     * camera itself was suspected.
     *
     * At 16° an edge spine on a 3440px wall is within 1% of a centre spine, so
     * A24b's reason survives — spines equally legible, no raking angle — while
     * a record pulled 40% of the way to the camera converges by 1.16, which
     * reads as a turn. The numbers and the sweep that chose them are in
     * `wall-camera.ts`.
     *
     * Framed on the WALL's centre, so the layout's coordinates still map
     * directly: Y is negated once, here, because the layout grows downward like
     * the DOM and the scene grows upward.
     */
    /**
     * **Framed on the whole wall, which is what keeps a spine its true size.**
     *
     * Computed rather than guessed, after framing on one row overshot the other
     * way and made a single record fill the screen. The canvas is `height` px
     * tall and shows `framedHeight` world units, so a spine renders at
     * `240 × height / framedHeight`. Only `framedHeight === height` gives
     * 240px — one wall pixel to one screen pixel, which is the whole reason the
     * layout is computed in pixels.
     *
     * The consequence is that the camera distance scales with the collection,
     * and that is fine for the camera and NOT fine for the pull depth.
     *
     * **The safeguard this comment used to promise was never written.** It said
     * "see PULL_DEPTH_CAP below"; no such constant has ever existed, in this file
     * or anywhere else, and the defect it described is live: the settle distance
     * is a CONSTANT (1552px, from FRAME_FILL and the FOV) while the camera's
     * distance scales with wall height, so on a short wall the camera stands
     * closer than the record needs and the record travels BACKWARDS to reach its
     * framing. Measured on a 17-record desktop wall: the camera at 882px, the
     * record settling at z = -670 — 680px behind the wall plane, at 0.57x the
     * size of its own slot.
     *
     * Recorded rather than fixed here: this unit is the shelf. See NOTES.md,
     * "A comment that promised a safeguard nobody wrote".
     */
    /*
      **Framed against the plane the SPINES occupy, not the wall behind them.**

      `wallCameraDistance` frames `z = 0`, where nothing is drawn: spines are
      boxes spanning `z = 0..width`, so every one of them stands in front of the
      framed plane. A perspective frustum is narrower nearer the camera, so the
      top row's caps fell outside it — measured at 1.69px, and the SAME 1.69px on
      a 1-record wall and a 125-record one, because wall height cancels out of
      `spineDepth · tan(halfFOV)`. That is why no amount of testing with a large
      fixture would have shown it.
    */
    const deepestSpine = MAX_SPINE_WIDTH;
    const cameraDistance = framedCameraDistance({
      wallHeight: height,
      spineDepth: deepestSpine,
    });
    /*
      **The viewport is passed so the record fits the frame's WIDTH** (the aspect
      fix). The camera keeps `width / height` (the canvas ratio) — a viewport
      aspect insets the wall and breaks A24a, measured — so the record's depth is
      what accounts for the viewport being narrow. `window.innerWidth/Height` is
      the screen; the canvas (`width` x `height`) is the whole wall and is not it.
    */
    /*
      **The destination is recomputed per pull from the CURRENT scroll**, so the
      record arrives at the VISIBLE viewport centre whatever row its slot is in —
      not at the wall's centre, which needed the wall scrolled to be seen and
      clamped at the top/bottom rows (the mis-PLACED record). x and z do not
      depend on scroll; only y does.
    */
    /* The canvas element's offset from the DOCUMENT top (fixed; nav sits above). */
    const canvasDocTop = () => host.getBoundingClientRect().top + window.scrollY;

    /**
     * **Where the record should sit, in canvas pixels: the centre of the wall
     * region the reader can actually SEE.**
     *
     * The wall begins below the nav and heading. On a phone that leaves a region
     * running from the canvas top down to the fold, whose centre is well below
     * `innerHeight / 2` — and aiming at the viewport centre put the sleeve's top
     * above the canvas, where it was clipped. `docTop` converts to the canvas's
     * own coordinates, which is what `pulledDestination` expects.
     *
     * The clamp keeps the whole sleeve inside the region. `halfSleevePx` is the
     * record's half-height on screen, taken from the geometry that sizes it
     * rather than restated: the canvas shows `2·distance·tan(halfAngle)` world
     * units over `height` pixels at the record's plane, and the record is
     * `SPINE_HEIGHT` tall.
     */
    const viewRegionCentrePx = (scrollY: number): number => {
      const docTop = canvasDocTop();
      /* The visible slice of the canvas, in page coordinates. */
      const regionTop = Math.max(docTop, scrollY);
      const regionBottom = Math.min(docTop + height, scrollY + window.innerHeight);

      const halfAngle = (WALL_FOV_DEGREES * Math.PI) / 360;
      const probe = pulledDestination({
        wallWidth: width,
        wallHeight: height,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        widthFill: 0.9,
      });
      const distance = cameraDistance - probe.z;
      const worldPerPx = (2 * distance * Math.tan(halfAngle)) / height;
      const halfSleevePx = SPINE_HEIGHT / worldPerPx / 2;

      const centre = (regionTop + regionBottom) / 2;
      const lowest = regionTop + halfSleevePx;
      const highest = regionBottom - halfSleevePx;
      /*
        `lowest > highest` means the region cannot hold the sleeve; the region's
        own centre then spreads the overflow across both edges rather than
        pinning it to one, which is what made the clipping read as "runs off the
        top" instead of "slightly too big".
      */
      const target = lowest > highest ? centre : Math.min(Math.max(centre, lowest), highest);

      return target - docTop;
    };
    const destinationFor = (scrollY: number) =>
      pulledDestination({
        wallWidth: width,
        wallHeight: height,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        /*
          Near full-bleed. On a narrow canvas the width is what binds, and 0.9
          makes the record own the frame (≈320px on screen at 390px, its readable
          floor) rather than sitting back at the wall's default 55% where it read
          as a distant speck.
        */
        widthFill: 0.9,
        /*
          In CANVAS coordinates: the viewport centre's page-y minus the canvas's
          own offset from the document top. The canvas starts below the nav (~197
          px), so the viewport centre is NOT at canvas-y `vh/2` — it is that much
          higher. Omitting this put the record ~197px too low (below the panel,
          off the bottom).
        */
        /*
          **The VISIBLE WALL REGION's centre, not the viewport's.** The wall
          starts below the nav and heading, so on a short viewport the region is
          the lower part of the screen and its centre is well below `vh/2`.
          Aiming at `vh/2` put a 322px sleeve's top ABOVE the canvas, which
          clipped it against the top edge — visible on a phone, and invisible to
          a test that compared the record's centre against `vh/2` because both
          sides came from these same two numbers.

          Clamped so the sleeve FITS: if the region is shorter than the record,
          the centre alone cannot save it, so the target is pushed down far
          enough for the top edge to clear the region and no further than the
          bottom edge allows. When the region cannot hold it at all the clamp
          collapses to the region's own centre, which distributes the overflow
          evenly rather than dumping it at one edge.
        */
        viewCentrePx: viewRegionCentrePx(scrollY),
        viewportHeight: window.innerHeight,
      });
    /* Recomputed when a record is pulled; the initial value is only a placeholder. */
    let destination = destinationFor(window.scrollY);
    const camera = new PerspectiveCamera(WALL_FOV_DEGREES, width / height, 1, cameraDistance * 2);
    /*
      **The tilt option raises the camera and looks down**, which is the only
      treatment that makes the shelf's top face genuinely visible rather than
      suggesting it. A DOWNWARD pitch is a different thing from the raking room
      §10b rejected: that rotated spines sideways and foreshortened the ones at
      the edges, costing the legibility the wall exists for. Tilting down
      foreshortens nothing horizontally — every spine keeps its width and its
      readable face.
    */
    const tiltDegrees =
      treatment === 'tilt' ? 6 : treatment === 'tilt-12' ? 12 : treatment === 'tilt-20' ? 20 : 0;
    const tiltRadians = (tiltDegrees * Math.PI) / 180;
    const lookAtY = -height / 2;
    camera.position.set(
      width / 2,
      lookAtY + cameraDistance * Math.sin(tiltRadians),
      cameraDistance * Math.cos(tiltRadians),
    );
    camera.lookAt(width / 2, lookAtY, 0);

    /*
      One light on the wall AND the records, which is the point of one scene.
      Raked rather than head-on so a spine's edge catches and the pulled record
      shades as it turns (A19c).
    */
    scene.add(new AmbientLight(0xffffff, 1.5));
    const key = new DirectionalLight(0xffffff, 1.9);
    key.position.set(-0.4, 0.8, 1);
    scene.add(key);

    const disposables: Array<{ dispose: () => void }> = [];

    /*
      A texture load can finish AFTER the scene has been torn down — a resize
      rebuilds the wall, and 125 covers do not all arrive before it does.
      Writing to a disposed material is the silent-failure shape this feature
      keeps meeting: WebGL does not complain.
    */
    let disposed = false;

    /**
     * Every material the WALL is made of, with the colour it should be at full
     * brightness. The pulled record's own materials are deliberately NOT in
     * here — that is the whole point of moving the dim into the scene.
     */
    const wallMaterials: Array<{ material: MeshStandardMaterial; base: Color }> = [];
    /*
      Each record's own spine materials, keyed by record id. They dim WITH the
      wall while the record is resting in it — a spine is wall — and are exempt
      the moment that record is the one pulled out. See `setWallDim`.
    */
    const recordMaterials = new Map<
      string,
      Array<{ material: MeshStandardMaterial; base: Color }>
    >();

    /*
      The shelves: one per row, spanning the full width. §10b's plane rule —
      "the surface runs edge to edge and ends where the wall ends", not where
      the records do.
    */
    /*
      **BoxGeometry, because a shelf is a surface and a vertical quad is not.**

      Both surfaces were `PlaneGeometry` — a 5.6px-tall vertical strip for the
      plane and a 2.4px one for the lip, standing at `z = 1` while the records
      stood at `z = 0..24` in front of them. §10b's lighting order ("the plane
      lighter than the wall because a room lit from the front puts light on a
      HORIZONTAL surface") has nothing to act on when the surface is vertical, so
      the shelf read as two thin stripes with the records floating before them.
    */
    const shelfGeometry = new BoxGeometry(1, 1, 1);
    disposables.push(shelfGeometry);
    const surfaceDepth = shelfSurfaceDepth({ deepestSpine });

    let shelfLipScreenY: Vector3 | null = null;
    for (const shelf of layout.shelves) {
      /*
        **`gradient` and `shadow` are CUES, not geometry.**

        `gradient` darkens the plane toward the back so the eye reads a surface
        receding; `shadow` darkens it overall as though the records were casting
        onto it. Both are the app drawing something that suggests depth, which is
        what a square-on camera leaves as the only option — see the tilt above
        for the one treatment that does not have to pretend.
      */
      const planeColour = new Color(SHELF_PLANE);
      if (treatment === 'shadow') planeColour.multiplyScalar(0.55);
      const surface = new Mesh(
        shelfGeometry,
        new MeshStandardMaterial({
          color: planeColour,
          roughness: treatment === 'gradient' ? 0.35 : 0.75,
          metalness: treatment === 'gradient' ? 0.15 : 0,
        }),
      );
      /*
        The horizontal top surface: thin in Y, deep in Z so it runs back under
        the whole of every spine (`z = 0..width`) rather than stopping at the
        wall plane.
      */
      surface.scale.set(shelf.width, shelf.height - SHELF_LIP_DEPTH, surfaceDepth);
      surface.position.set(
        shelf.x + shelf.width / 2,
        -(shelf.y + (shelf.height - SHELF_LIP_DEPTH) / 2),
        surfaceDepth / 2,
      );
      scene.add(surface);
      disposables.push(surface.material as Material);
      wallMaterials.push({
        material: surface.material as MeshStandardMaterial,
        base: new Color(SHELF_PLANE),
      });

      const lip = new Mesh(
        shelfGeometry,
        new MeshStandardMaterial({ color: new Color(SHELF_LIP), roughness: 0.9 }),
      );
      /*
        The lip is the front FACE the viewer sees, so it sits at the surface's
        front edge and faces the camera — which is what makes it darker than the
        plane under a light from the front, per §10b's ordering.
      */
      lip.scale.set(shelf.width, SHELF_LIP_DEPTH, SHELF_LIP_DEPTH);
      lip.position.set(
        shelf.x + shelf.width / 2,
        -(shelf.y + shelf.height - SHELF_LIP_DEPTH / 2),
        surfaceDepth,
      );
      scene.add(lip);
      disposables.push(lip.material as Material);
      wallMaterials.push({
        material: lip.material as MeshStandardMaterial,
        base: new Color(SHELF_LIP),
      });

      /*
        **The lip's projected screen y, published for one diagnosis and kept.**
        A pixel scan through the pulled record found a bright line at a
        different height from the lip in a bare-wall column, which read as the
        shelf drawing twice — an impossible finding, since the camera, the
        canvas and these meshes are all fixed after build. Publishing where the
        lip ACTUALLY projects is what distinguishes "the shelf moved" from "the
        bright line is a different object". Only the first row's is published;
        it is the one every short-viewport case shows.
      */
      if (shelfLipScreenY === null) shelfLipScreenY = lip.position.clone();
    }

    /*
      The spines. A BOX rather than a plane, because the whole point is that a
      spine is the EDGE of a record: pulling it turns it face-on, and a plane
      has no face to turn to.
    */
    const spineGeometry = new BoxGeometry(1, 1, 1);
    disposables.push(spineGeometry);

    const byId = new Map(records.map((record) => [record.id, record]));
    const meshes = new Map<string, Mesh>();

    for (const placed of layout.placed) {
      const record = byId.get(placed.id);
      if (record === undefined) continue;

      const colour = record.spineColour ?? DEFAULT_SPINE_COLOUR;
      const label = spineText(record);
      const plan = spineLabelPlan({ text: label, spineWidth: placed.width });

      /*
        The label, drawn to a canvas and used as a texture. Supersampled by
        `spineLabelPlan` because a texture gets no hinting — the legibility bar
        is the CSS wall's, and matching it costs device pixels.
      */
      /**
       * **The canvas is PORTRAIT, matching the face it goes on.**
       *
       * `spineLabelPlan` describes the label in reading order — long axis first
       * — because that is how the text is laid out. The face it lands on is the
       * spine's +z: `placed.width` across and `SPINE_HEIGHT` tall, which is
       * portrait. Creating the canvas landscape and letting the GPU stretch it
       * onto a portrait face rotates the glyphs by squashing them, and the
       * extra `rotate(PI)` that was meant to fix the reading direction turned
       * that into a mirror image.
       *
       * So the canvas is portrait and the ROTATION happens here, in 2D, where
       * it is a real rotation rather than a stretch.
       */
      const canvas = document.createElement('canvas');
      canvas.width = plan.canvasHeight;
      canvas.height = plan.canvasWidth;
      const context = canvas.getContext('2d');

      if (context !== null) {
        context.fillStyle = colour;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = textColourOn(record.spineColour) === 'light' ? '#ece6dc' : '#241f18';
        context.font = `600 ${plan.fontPx}px ui-monospace, monospace`;
        context.textBaseline = 'middle';
        context.textAlign = 'left';

        /*
          Rotated -90° and drawn up the spine, so it reads bottom-to-top as
          spines on a shelf do (§10b: "set in mono, rotated"). The translate
          puts the origin at the bottom-left of the label's run; after the
          rotation, +x runs UP the canvas.
        */
        context.save();
        context.translate(canvas.width / 2, canvas.height - 8);
        context.rotate(-Math.PI / 2);
        context.fillText(plan.text, 0, 0);
        context.restore();
      }

      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      disposables.push(texture);

      const plain = new MeshStandardMaterial({ color: new Color(colour), roughness: 0.7 });
      const faced = new MeshStandardMaterial({ map: texture, roughness: 0.7 });
      /*
        **A record's own materials are NOT in the wall's dim set**, and this
        registration is what made a correct render look like a geometry bug.
        `setWallDim` darkens everything in `wallMaterials` so the wall recedes
        behind a pulled record — but these two materials are on the RECORD's box
        (`[faced, plain, plain, plain, cover, backFace]`), so four of the six
        faces of the record being pulled dimmed along with the wall it had just
        left.

        The record is roughly 1:25 thick, so its bottom edge is a thin lit
        strip. Darkened, it reads exactly like a shelf lip drawn across the
        sleeve, with the rest of that face reading as "the cover continuing
        below, dimmed" — and three separate descriptions agreed the record was
        rendering BEHIND the shelf. Measurement disagreed: the shelf lip
        projects to canvas-y 247 and never moves, while the bright line sits at
        358, the record's own bottom edge.

        **The rule is ownership, not appearance.** The wall is what a record is
        pulled OUT of, so nothing that travels with the record may be in the set
        that dims behind it. The spines still dim — the RESTING records are wall
        — which is why this cannot be fixed by excluding these materials
        wholesale: `wallDimExempt` names the one record that is out.
      */
      recordMaterials.set(placed.id, [
        { material: plain, base: new Color(colour) },
        { material: faced, base: new Color(0xffffff) },
      ]);
      /**
       * The cover face, revealed by the turn.
       *
       * **The plain sleeve is the FALLBACK, not the only case.** This was plain
       * unconditionally, with a comment saying cover textures were "a later
       * unit" — a deferral with no trigger and no home, which is a decision
       * never to do it. Pulling a record that HAS a cover showed the same
       * `[tex, plain×5]` as one that does not, so the artwork never reached the
       * face anyone sees.
       *
       * A record with no cover still gets the plain sleeve in its own spine
       * colour: §10b's "an honest absence, not a gap in the wall".
       */
      /**
       * **What a surface IS decides whether light touches it**, and
       * `surface-kind.ts` is where that question is answered. Nothing here
       * picks a material without first saying what it is drawing.
       *
       * Photographs of artwork — cover, back, and the gatefold leaves — are
       * unlit. §10b's rule about spines applies to them directly: a spine is a
       * claim about a cover, and a cover face is a claim about the artwork.
       * Lighting a photograph adds light that was never in the sleeve, the same
       * class as the saturation boost unit 1a declined.
       *
       * Surfaces — the plain-sleeve fallback, the record's edges, the spines,
       * the shelves and the lip — are lit, and NEED to be. Unit 17 found the
       * fallback's edge only separates tonally from its face because it is lit.
       */
      const materialFor = (surface: Surface, url: string | null) => {
        if (url === null || surfaceKind(surface) === 'lit') {
          /*
            A record with no cover gets the plain sleeve in its own spine
            colour: §10b's "an honest absence, not a gap in the wall". A surface
            rather than a photograph, so it is lit.
          */
          return new MeshStandardMaterial({ color: new Color(colour), roughness: 0.62 });
        }

        const material = new MeshBasicMaterial({ color: 0xffffff });

        new TextureLoader().load(url, (texture) => {
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

          disposables.push(texture);
          material.map = texture;
          material.needsUpdate = true;
          loop.markDirty();
        });

        return material;
      };

      const cover = materialFor('cover', record.coverUrl);
      const backFace = materialFor('back', record.backUrl);

      /*
        **The gatefold leaves have no geometry yet, and the rule is wired
        anyway.** The slots are real — `gatefoldLeftUrl` and `gatefoldRightUrl`
        come off the query — and leaving them for the unit that builds the
        opening is exactly the "deferral with no home" NOTES records: the cover
        itself sat plain for six units behind a comment saying textures were
        later. Building them here costs two texture loads on records that have
        them and settles the material question before it can be re-litigated.
      */
      const gatefoldLeft = materialFor('gatefold_left', record.gatefoldLeftUrl);
      const gatefoldRight = materialFor('gatefold_right', record.gatefoldRightUrl);
      disposables.push(gatefoldLeft, gatefoldRight);

      disposables.push(plain, faced, cover, backFace);

      /**
       * BoxGeometry material order is [+x, -x, +y, -y, +z, -z].
       *
       * **The label goes on +x, the sleeve's EDGE.** The mesh is a record
       * turned side-on, so what faces the viewer in the wall is its edge — and
       * that is where a real spine's text is printed. It was on +z, the cover
       * face, which is hidden until the record turns: correct for a slab the
       * width of a spine, wrong for a record standing edge-on.
       *
       * `cover` is the front face, which the quarter turn reveals.
       */
      const mesh = new Mesh(spineGeometry, [faced, plain, plain, plain, cover, backFace]);
      /*
        **A record standing edge-on**, not a slab the width of a spine. Width
        and height are the record; depth is the sleeve's thickness. Turned
        side-on it presents exactly `placed.width` to the viewer, which is what
        a spine IS — and the quarter turn then reveals a cover rather than
        stretching one.
      */
      /*
        At rest: the shelf FOOTPRINT, which is what keeps spine text legible.
        See `record-box.ts` for why that is wider than a record really is.
      */
      mesh.scale.set(
        SPINE_HEIGHT,
        SPINE_HEIGHT,
        boxDepth({ recordId: placed.id, height: SPINE_HEIGHT, progress: 0 }),
      );
      // See `spine-facing.ts`: the sign is load-bearing and is pinned there.
      mesh.rotation.y = RESTING_ROTATION_Y;
      mesh.position.set(
        placed.x + placed.width / 2,
        -(placed.y + SPINE_HEIGHT / 2),
        placed.width / 2,
      );
      mesh.userData.recordId = placed.id;
      mesh.userData.home = mesh.position.clone();
      scene.add(mesh);
      meshes.set(placed.id, mesh);
    }

    /*
      Published so a test can see that the wall RE-WRAPPED, which is the thing a
      resize has to change. A canvas has nothing a rect can measure, and the
      canvas's own size changes for reasons that are not re-wrapping.
    */
    host.dataset.rows = String(layout.shelves.length);
    host.dataset.wallWidth = String(width);

    /**
     * **The draw count, published because it is a CONSTRAINT rather than a
     * statistic.**
     *
     * A still wall with a still pointer must cost nothing — the reasoning NOTES
     * recorded before any three.js work began, and the property hover was most
     * likely to break. There is nothing in a canvas a test can measure, so the
     * loop counts its own draws and a test reads them after a settle window.
     */
    /*
      The flip's accumulated half-turns and the tilt's current angles, held
      here so the mesh's rotation can SUM all three contributions rather than
      any one of them assigning it.
    */
    /**
     * **Everything the pulled record's pose is made of, in one place.**
     *
     * The rise's progress, the flip's accumulated turn, the tilt's angles.
     * `applyPose` below is the ONLY thing that writes the mesh, and every one
     * of these has a setter that calls it.
     *
     * That is the fix for a defect worth naming: the tilt was computed, stored
     * and marked dirty, and never applied — because the line that wrote the
     * rotation lived inside `setPulled`, which only runs while the rise or the
     * return is animating. Every instrument reported success (phase, events,
     * angles, dirty flag) because each was UPSTREAM of the break.
     *
     * It also makes explicit a coupling nothing stated: the flip worked only
     * because its animation re-entered `setPulled`. Anything added here now has
     * a named place to hook into rather than a side effect to discover.
     */
    let pulledNow: string | null = null;
    let riseProgress = 0;
    let flipTurn = 0;
    let tiltNow = NO_TILT;
    const DEG = Math.PI / 180;

    const counter = window as unknown as { __drawCount?: number };

    const loop = createRenderLoop(() => {
      renderer.render(scene, camera);
      counter.__drawCount = (counter.__drawCount ?? 0) + 1;
    });
    loop.start();
    loop.markDirty();

    /**
     * Pulling a record: the mesh leaves its slot.
     *
     * **This is the whole unit.** The spine that rises IS the spine that was in
     * the wall, so the gap it leaves is not drawn, coordinated or faked — it is
     * simply where the mesh is not any more.
     */
    /**
     * Writes the mesh from the current pose inputs. Called by `setPulled` (the
     * rise and the return), `setFlip` and `setTilt` — every path that can
     * change what the record looks like.
     */
    function setPulledInternal(id: string | null, progress: number) {
      pulledNow = id;
      riseProgress = progress;

      /*
        **The wall dims with the record's own progress**, so unit 11's ordering
        survives the move out of the DOM: the backdrop arrives AS the record
        travels rather than dropping on click. `wallDim` is linear for exactly
        that reason — a cubic ease-out is 39% dimmed at 15% progress and would
        put the record's arrival against an already-dark wall.
      */
      setWallDim(wallDim(id === null ? 0 : progress), id);
        /*
          The LAYOUT's answer for where this record's slot is — read from
          `layout`, which the packer produced, rather than from the mesh's own
          `home`. A test comparing the mesh against `home` compares a value with
          itself: corrupting `home` moves the record and the ruler together.
        */
        if (id !== null) {
          const slot = layout.placed.find((p) => p.id === id);
          if (slot !== undefined) {
            host.dataset.layoutSlotX = String(slot.x + slot.width / 2);
            host.dataset.layoutSlotY = String(-(slot.y + SPINE_HEIGHT / 2));
          }
        }

        /**
         * **The slot's emptiness, published so it can be asserted.**
         *
         * The prompt's central question — does a record come OFF the shelf —
         * needs an assertion that is not a screenshot. This is it: how far the
         * pulled spine is from where it lives in the wall. Zero means it is
         * still in its slot; anything substantial means the slot is empty
         * because the spine that filled it is elsewhere.
         *
         * Published from the same values that move the mesh, on the line below,
         * so the number cannot drift from what is drawn. That is the lesson
         * from the rise's round-trip test: a check that derives its own value
         * asserts its own arithmetic.
         */
        host.dataset.pulledId = id ?? '';
        host.dataset.pulledProgress = String(progress);

        /*
          **Reset here, not only in the pulled branch.** Written only while a
          record was out, this kept its last value after dismissal — so the
          return test read a stale gap and reported the spine still out of the
          wall when it was back in it. A published measurement that is not
          cleared is a measurement that lies about the state it names.
        */
        host.dataset.slotGap = '0';

        for (const [recordId, mesh] of meshes) {
          const home = mesh.userData.home as { x: number; y: number; z: number };

          if (recordId !== id) {
            /*
              **Back to EDGE-ON, not to zero.** A record standing in the wall is
              turned side-on; resetting the rotation to 0 turned every spine on
              the wall face-on the moment anything was pulled, which is what the
              frames showed. The resting pose is the quarter turn.
            */
            mesh.position.set(home.x, home.y, home.z);
            mesh.rotation.y = RESTING_ROTATION_Y;
            mesh.scale.set(
              SPINE_HEIGHT,
              SPINE_HEIGHT,
              boxDepth({ recordId, height: SPINE_HEIGHT, progress: 0 }),
            );
            continue;
          }

          /*
            **The pull is a fraction of the CAMERA distance, not a fixed number
            of pixels.** Convergence depends on how much closer the record is
            than the wall in proportion: at this focal length a fixed 420px pull
            is 4% of the way and converges by 1.02, which is no turn at all.
            Measured across focal lengths in `wall-camera.ts`.
          */
          /**
           * **From the slot to an explicit DESTINATION**, rather than forward
           * by a proportion and wherever that lands.
           *
           * The old version kept `home.y`, so where a record settled depended
           * on which row it came from — measured at 125 records, a row-0 record
           * ended 252 world units above the view centre, NDC y 0.838, clipped
           * against the top of the frame. Its depth was a fraction of the
           * camera distance, which scales with the collection, so it also
           * arrived a different apparent size on a nine-row wall than a one-row
           * one.
           *
           * `pulledDestination` owns both: centred in view, at a distance
           * derived from how big the record should LOOK rather than from how
           * many records are owned. `risePose` still owns what happens on the
           * way — the quarter turn and the forward travel are unchanged.
           */
          const eased = 1 - Math.pow(1 - progress, 3);
          const pose = risePose({ progress, slotDepth: destination.z - home.z });

          mesh.position.set(
            home.x + (destination.x - home.x) * eased,
            home.y + (destination.y - home.y) * eased,
            home.z + pose.z,
          );
          /**
           * **The turn, now that the camera can show one.**
           *
           * `risePose` runs the angle from edge-on (π/2) to face-on (0), and a
           * spine standing in the wall is already edge-on — so the mesh's
           * rotation IS the pose's angle, not the pose's angle minus a quarter
           * turn. Subtracting one ran the rotation past face-on and back to
           * edge-on, which is what made the record grow and then shrink.
           */
          /*
            Negated to match the resting pose: the turn runs from −π/2 (edge-on,
            label toward the viewer) to 0 (face-on, cover toward the viewer).
          */
          /**
           * **Which rotation owns which axis** — the composition question.
           *
           * The RISE owns Y while it runs: edge-on to face-on. The FLIP also
           * turns about Y, and adds a half turn on top of wherever the rise
           * has reached. The TILT owns X, and adds a small Y offset on top of
           * both rather than replacing them.
           *
           * Unit 12 found that a running keyframe's transform beats an inline
           * one and resolved it structurally rather than by arbitration. The
           * equivalent here is that all three CONTRIBUTE to one rotation — they
           * are summed, not assigned — so none can win over another.
           */
          mesh.rotation.y = -pose.rotationY + flipTurn + tiltNow.rotateY * DEG;
          mesh.rotation.x = tiltNow.rotateX * DEG;

          // How far the spine has travelled from its slot, in wall pixels.
          const dx = mesh.position.x - home.x;
          const dy = mesh.position.y - home.y;
          const dz = mesh.position.z - home.z;
          host.dataset.slotGap = String(Math.sqrt(dx * dx + dy * dy + dz * dz));

          /*
            The mesh's ABSOLUTE position, so a test can check where the record
            actually is rather than where it is relative to its own reference.
            `slotGap` is measured against `home`, so it cannot answer questions
            about `home` being wrong — the ruler moves with the thing it
            measures.
          */
          host.dataset.meshX = String(mesh.position.x);
          host.dataset.meshY = String(mesh.position.y);


          /**
           * **Where the record ended up, in normalised device coordinates.**
           *
           * Published because a canvas has nothing a rect can measure, and the
           * defect this unit fixed was invisible to every assertion the scene
           * had: the record settled at NDC y 0.838, clipped against the top of
           * the frame, while the slot emptied correctly and every test passed.
           *
           * NDC rather than pixels: (0, 0) is the centre of view by definition,
           * so "is it centred" is a comparison against zero rather than against
           * a canvas size the test would have to know.
           */
          const ndc = mesh.position.clone().project(camera);
          /* The record's rotation, so a test can assert the tilt responds. */
          host.dataset.rotX = String(Math.round(mesh.rotation.x * 1000) / 1000);
          host.dataset.rotY = String(Math.round(mesh.rotation.y * 1000) / 1000);
          host.dataset.settledNdcX = String(ndc.x);
          host.dataset.settledNdcY = String(ndc.y);
          /*
            **The record's centre in VIEWPORT-relative screen pixels.** NDC is
            over the whole canvas frame; the fix places the record at the visible
            viewport centre, whose NDC is not zero, so a test must read the
            SCREEN position. The canvas maps NDC y ∈ [-1,1] to its own height, and
            the canvas sits at `box.top` in the viewport.
          */
          const canvasEl = renderer.domElement;
          const canvasRect = canvasEl.getBoundingClientRect();
          const screenY = canvasRect.top + ((1 - ndc.y) / 2) * canvasRect.height;
          host.dataset.settledScreenY = String(Math.round(screenY));

          /*
            The first shelf lip's projected screen y, through the SAME camera and
            the same canvas rect. A pixel scan through a pulled record read a
            bright line 80px above the lip found in a bare-wall column, which
            looked like the shelf drawing in two places — impossible, since the
            camera, the canvas and the shelf meshes are all fixed after build.
            This is the value that settles it: if the lip projects to one y while
            the pixels show a line elsewhere, the line is a different object.
          */
          if (shelfLipScreenY !== null) {
            const lipNdc = shelfLipScreenY.clone().project(camera);
            host.dataset.shelfLipScreenY = String(
              Math.round(canvasRect.top + ((1 - lipNdc.y) / 2) * canvasRect.height),
            );
          }

          /*
            **The size does not interpolate; the ROTATION reveals it.** The mesh
            is a record all along — SPINE_HEIGHT square, as thick as its spine —
            standing edge-on so only its thickness faces the viewer. Widening it
            as well as turning it double-counts the turn, which is what the two
            earlier attempts did.
          */
          /*
            **The edge thins as the record comes out**, from its shelf footprint
            to the 1:25 thickness QA chose by looking. That interpolation is
            what reconciles the two: a spine is drawn thicker than a record
            really is so its text can be read, and the object in your hands is
            the real proportion.
          */
          mesh.scale.set(
            SPINE_HEIGHT,
            SPINE_HEIGHT,
            boxDepth({ recordId, height: SPINE_HEIGHT, progress: eased }),
          );
        }
        loop.markDirty();
    }

    /**
     * Dims the WALL — spines, shelves and lips — leaving the pulled record at
     * full brightness.
     *
     * This replaces a DOM scrim that sat above the canvas in z-order and so
     * dimmed the record along with everything else: measured, the cover
     * rendered at 0.30x its own brightness, exactly `1 - 0.7` for a `black/70`
     * overlay. A cover is a claim about a record's artwork (§10b) and 44% of
     * the sleeve is the app being wrong about the record.
     */
    /**
     * Dims the wall behind a pulled record.
     *
     * **`exempt` is the record that is OUT, and it is the whole correction.**
     * A resting record's spine IS wall and must dim with it; the pulled
     * record's own faces must not, because it is the thing being looked at.
     * Registering both in one set made four of the pulled record's six faces
     * darken along with the wall it had just left — which read as the shelf
     * drawing across the sleeve, since a 1:25-thick box's bottom edge is a thin
     * strip that looks like a lip once it is dark.
     */
    function setWallDim(amount: number, exempt: string | null) {
      for (const { material, base } of wallMaterials) {
        material.color.setRGB(base.r * amount, base.g * amount, base.b * amount);
      }
      for (const [recordId, materials] of recordMaterials) {
        /* The pulled record keeps its own light, at every progress. */
        const at = recordId === exempt ? 1 : amount;
        for (const { material, base } of materials) {
          material.color.setRGB(base.r * at, base.g * at, base.b * at);
        }
      }
    }

    function applyPose() {
      if (pulledNow === null) return;
      setPulledInternal(pulledNow, riseProgress);
    }

    live.current = {
      animate: (step) => loop.animate('record', step),
      setFlip: (turn: number) => {
        flipTurn = turn;
        applyPose();
      },
      setTilt: (next: { rotateX: number; rotateY: number }) => {
        tiltNow = next;
        applyPose();
      },
      /**
       * **The one thing that writes the pulled record's mesh.**
       *
       * Re-applies the pose from whatever its inputs currently are, so a change
       * to any of them — rise progress, flip turn, tilt angles — shows up
       * without needing an animation to be running. That was the tilt's defect:
       * its value was stored and never written, because writing only happened
       * inside the rise's and return's own animation callbacks.
       */
      setPulled: (id, progress) => setPulledInternal(id, progress),
      setSlide: (fromId, toId, direction, progress) => {
        /*
          **Both records at the settled DEPTH — the move is lateral, not a rise.**
          The outgoing record leaves toward one side and the incoming arrives
          from the other; direction picks the sign. `next` (swipe left / right
          arrow) slides the current record LEFT and brings the next from the
          right, the way a gallery advances.

          The wall behind is unchanged during the slide (see the effect): the
          emptied slot belongs to the settled state, and moving slots mid-slide
          would contradict "a lateral move in front of the wall".
        */
        const frameHeight = 2 * (cameraDistance - destination.z) * Math.tan((WALL_FOV_DEGREES * Math.PI) / 360);
        const frameWidth = frameHeight * (width / height);
        const travel = frameWidth * 1.1; // just past the frame edge, fully off

        const sign = direction === 'next' ? -1 : 1;

        /*
          **Per-channel easing, like a gallery (13b).** The outgoing record
          ACCELERATES away (ease-IN, cubic) — it is leaving, so it should speed
          up toward the edge. The incoming DECELERATES into place (ease-OUT) — it
          arrives and settles. A single ease-out shared by both (unit 11's
          mistake, which the developer flagged) makes the outgoing drift out
          slowly, reading as mechanical. Two curves, one per direction.
        */
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const easeIn = Math.pow(progress, 3);

        const fromMesh = meshes.get(fromId);
        const toMesh = meshes.get(toId);

        /*
          Dimmed throughout the slide, exempting the record ARRIVING — it is the
          one the reader is following. The outgoing record is leaving the frame
          and reads correctly as it goes; exempting only one keeps this the same
          single-subject rule the rise uses.
        */
        setWallDim(wallDim(1), toId);

        for (const [recordId, mesh] of meshes) {
          if (recordId === fromId || recordId === toId) continue;
          /* Everything else stays in the wall, edge-on. */
          const home = mesh.userData.home as { x: number; y: number; z: number };
          mesh.position.set(home.x, home.y, home.z);
          mesh.rotation.set(0, RESTING_ROTATION_Y, 0);
          mesh.scale.set(SPINE_HEIGHT, SPINE_HEIGHT, boxDepth({ recordId, height: SPINE_HEIGHT, progress: 0 }));
        }

        const placeAt = (mesh: typeof fromMesh, offsetX: number) => {
          if (mesh === undefined) return;
          mesh.position.set(destination.x + offsetX, destination.y, destination.z);
          mesh.rotation.set(0, 0, 0); // face-on
          mesh.scale.set(SPINE_HEIGHT, SPINE_HEIGHT, boxDepth({ recordId: toId, height: SPINE_HEIGHT, progress: 1 }));
        };

        /* Outgoing: centre → off, ACCELERATING away (ease-in). */
        placeAt(fromMesh, sign * travel * easeIn);
        /* Incoming: off → centre, DECELERATING into place (ease-out). */
        placeAt(toMesh, -sign * travel * (1 - easeOut));

        host.dataset.pulledId = toId;
        host.dataset.pulledProgress = String(progress);
        loop.markDirty();
      },
      /*
        **The touch gesture boundary's query half.** A finger on the record
        tilts it; a finger on the wall does not. This raycasts the pulled mesh
        specifically — not the wall spines — so `touch-tilt.ts`'s decision can be
        made from a real hit test rather than a rectangle guess.
      */
      recomputeDestination: () => {
        destination = destinationFor(window.scrollY);
      },
      hitsPulledRecord: (clientX, clientY) => {
        const pulled = pulledIdRef.current;
        if (pulled === null) return false;
        const mesh = meshes.get(pulled);
        if (mesh === undefined) return false;
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        return raycaster.intersectObject(mesh, false).length > 0;
      },
    };



    /*
      Hit testing is a raycast now, not a DOM event. Deliberately CLICK only —
      there is a hover defect on `/` where records pop up on hover, and this
      unit does not carry across a hover behaviour nobody asked for.
    */
    const raycaster = new Raycaster();
    const pointer = new Vector2();

    const onClick = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects([...meshes.values()], false);
      const hit = hits[0]?.object.userData.recordId;

      const next = typeof hit === 'string' ? hit : null;

      /*
        Dismissing starts a return; pulling a different record does not — it
        would leave two meshes animating and the new one is what the reader is
        looking at.
      */
      /*
        Clicking a spine pulls it; clicking empty wall dismisses whatever is out.
        Both are one transition on one value, so there is no combination of
        flags to get wrong.
      */
      setState((current) => (next === null ? dismiss(current) : pull(current, next)));
    };

    /**
     * **Hover: the spine eases proud of the wall.**
     *
     * §10b, closest to the reference — you push a record proud with a finger to
     * see it before deciding, and the thing that pops is the thing that will
     * come out, so the click is legible in advance.
     *
     * **Raycast on move, mark dirty only on CHANGE.** Before this the wall cost
     * zero draws across 60 fast pointer moves because there was no handler at
     * all; a naive version renders on every `pointermove` across 125 spines.
     * The raycast is cheap and unavoidable, the draw is not. `shouldRedraw`
     * owns that decision.
     *
     * **One owner**: `hoveredId` here, with every spine's offset derived from it
     * by `proudOffset`. Crossing the wall quickly touches forty spines, and
     * per-spine state is the shape that has failed here every time.
     */
    let hoveredId: string | null = null;
    let proudFrom = new Map<string, number>();
    let proudStart: number | null = null;

    /** Where each spine currently sits, so a new hover eases from there. */
    const currentProud = new Map<string, number>();

    /**
     * **No lock: the 'wall' lane's own replacement excludes.**
     *
     * This guarded itself with an `easing` flag that only the step's FINAL
     * frame cleared — and when the rise (then sharing one step slot) replaced
     * this step mid-ease, that frame never ran and the flag was held for ever.
     * `settleProud` returned early on every later hover and no animation of any
     * kind ran again for the life of the page: a feature that passed every test
     * and had never once worked in a real browser, because you must hover a
     * spine to click it and no dispatched click ever had a live ease behind it.
     *
     * A hand-rolled lock that only its holder can release turns a collision
     * into a permanent one. Installing into the lane already does the excluding,
     * and re-installing mid-ease is CORRECT here — `proudFrom` is re-read from
     * `currentProud` by the caller, so a new hover eases from wherever the
     * spines are now rather than restarting.
     */
    const settleProud = () => {
      proudStart = null;

      loop.animate('wall', (now) => {
        if (proudStart === null) proudStart = now;
        const t = Math.min(1, (now - proudStart) / PROUD_MS);
        const eased = 1 - Math.pow(1 - t, 3);

        for (const [recordId, mesh] of meshes) {
          /*
            A spine that is out of the wall is not hovering anything: the pulled
            record has left its slot and must not also be nudged.
          */
          if (recordId === pulledIdRef.current) continue;

          const from = proudFrom.get(recordId) ?? 0;
          const to = proudOffset({ id: recordId, hoveredId });
          const at = from + (to - from) * eased;

          currentProud.set(recordId, at);
          /*
            **The hovered spine's own offset out of the wall, published.**
            A draw count cannot stand in for this: the ease is 140ms and a
            settled wall correctly draws nothing, so the count is flat whether
            the wall is animating or permanently dead — which is exactly the
            state that shipped. This is the thing the ease produces.
          */
          if (recordId === hoveredId) host.dataset.proudZ = String(Math.round(at * 100) / 100);
          const home = mesh.userData.home as { z: number };
          mesh.position.z = home.z + at;
        }

        return t < 1;
      });
    };

    const onPointerMove = (event: PointerEvent) => {
      /*
        **Nothing hovers while a record is out.** Its slot is empty so there is
        nothing there to nudge, the pulled record itself must not respond, and
        the wall behind is not what the reader is looking at. Deliberate: the
        alternative is a wall that twitches behind the thing being read.
      */
      if (pulledIdRef.current !== null) {
        /*
          **The closure's own `hoveredId` is cleared too, not just React's.**
          It was left holding the pulled record's id — so after the record went
          home, re-hovering that same spine gave `previous === next`,
          `shouldRedraw` said no, and the ease never ran again for that spine.
          The second half of the same defect: a value that outlived the state it
          described.
        */
        if (hoveredId !== null) {
          proudFrom = new Map(currentProud);
          hoveredId = null;
          host.dataset.hovered = '';
          host.dataset.proudZ = '0';
          settleProud();
        }
        setHoveredRecordId(null);
        return;
      }

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects([...meshes.values()], false);
      const hit = hits[0]?.object.userData.recordId;
      const next = typeof hit === 'string' ? hit : null;

      if (!shouldRedraw({ previous: hoveredId, next })) return;

      // Ease from wherever each spine is NOW, so a fast crossing does not snap.
      proudFrom = new Map(currentProud);
      hoveredId = next;
      host.dataset.hovered = next ?? '';
      setHoveredRecordId(next);
      setCardAt(next === null ? null : { x: event.clientX, y: event.clientY });

      if (prefersReducedMotion()) {
        /*
          §10b: reduced motion disables the movement. The CARD still appears —
          it is information, not decoration.
        */
        for (const [recordId, mesh] of meshes) {
          const home = mesh.userData.home as { z: number };
          mesh.position.z = home.z;
          currentProud.set(recordId, 0);
        }
        loop.markDirty();
        return;
      }

      settleProud();
    };

    const onPointerLeave = () => {
      if (!shouldRedraw({ previous: hoveredId, next: null })) return;
      proudFrom = new Map(currentProud);
      hoveredId = null;
      host.dataset.hovered = '';
      host.dataset.proudZ = '0';
      setHoveredRecordId(null);
      settleProud();
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);
    renderer.domElement.addEventListener('click', onClick);

    return () => {
      disposed = true;
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('click', onClick);
      loop.stop();
      live.current = null;
      renderer.domElement.remove();
      for (const item of disposables) item.dispose();
      renderer.dispose();
    };
    }
  }, [spines, records, treatment]);

  /** Drives the rise when the pulled record changes. */
  useEffect(() => {
    const scene = live.current;
    if (scene === null) return;

    /**
     * **The return: the rise reversed, so the two cannot describe different
     * objects.**
     *
     * `setPulled` snapped everything home when nothing was pulled, and the
     * record vanished. The existing return test passed against that, because it
     * asserted where the record ENDS UP — which an instant snap satisfies
     * perfectly. Ending in the right place is not travelling there.
     *
     * `returningId` is what makes a dismissal animatable: the scene still needs
     * to know WHICH record is going back after `pulledId` has become null.
     */
    /**
     * **Keyed on the PHASE, not on `pulledId` being null.**
     *
     * With separate flags the return ran when `pulledId` became null, because
     * dismissing cleared it. Deriving `pulledId` from the phase changed that:
     * a returning record is still OUT, so `pulledId` stays set and this branch
     * never ran — Escape transitioned the state correctly (`settled ->
     * returning`, measured) and nothing moved.
     *
     * The phase is the question being asked, so the phase is what it asks.
     */
    if (returningId !== null) {

      let backFrom: number | null = null;
      const goingBack = returningId;

      scene.animate((now) => {
        if (backFrom === null) backFrom = now;
        const elapsed = Math.min(1, (now - backFrom) / RISE_MS);

        /**
         * **Ease IN, the mirror of the rise's ease-out** — a record going back
         * accelerates toward the gap rather than drifting into it, and reusing
         * the rise's easing reads as the animation played backwards.
         *
         * **Quadratic rather than cubic, and the frames are why that is the
         * right change.** QA reported the return looked fast and possibly
         * dropped frames. Measured: 36 frames across 620ms, first-frame gap
         * 17ms, median 17ms, progress 0 then 0.027. Nothing is dropped and
         * there is no stall — so "fast" is the CURVE, not the frame rate, and
         * tuning the duration would have been fixing the wrong thing.
         *
         * A cubic ease-in covers 13% of the distance by halfway, leaving 88%
         * for the second half: the record hangs, then snaps. Quadratic covers
         * 25% by halfway, which still accelerates into the slot without the
         * lurch.
         */
        const eased = elapsed * elapsed;

        /*
          The SAME `risePose`, read from 1 down to 0. One description of the
          motion, two directions through it — rather than a second function
          that has to agree with the first about what a record does.
        */
        scene.setPulled(goingBack, 1 - eased);

        /*
          **Guarded, like every other settle in this file.** An animation
          finishing is a claim about the motion it was running, not about
          whatever the state has become since. Unguarded, a return whose final
          frame lands after a fresh pull stamps `idle` over `rising` and the new
          record silently never comes out — the same shape as the hover ease
          that held its lock, one layer along.
        */
        if (elapsed >= 1) {
          setState((current) => (current.phase === 'returning' ? { phase: 'idle' } : current));
        }
        return elapsed < 1;
      });
      return;
    }

    if (state.phase === 'sliding') {
      /* The slide effect owns the meshes while sliding — do not also rise. */
      return;
    }

    if (pulledId === null) {
      scene.setPulled(null, 0);
      return;
    }

    /*
      **Only a FRESH rise animates.** This effect depends on `state.phase` so it
      can bail on 'sliding' — but that also re-runs it on settle, and without
      this guard a record that just settled (from a rise OR a slide) would rise
      AGAIN, and its `scene.animate` would replace the slide's step mid-flight
      (the render loop has one step slot), orphaning the slide at whatever
      progress it had reached. When the record is already out and still, hold the
      settled pose statically instead.
    */
    if (state.phase !== 'rising') {
      scene.setPulled(pulledId, 1);
      return;
    }

    /*
      **Recompute the destination from the CURRENT scroll**, before the rise
      animates, so the record settles at the VISIBLE viewport centre wherever its
      slot is — top row, bottom row, or middle. The scroll does not change during
      the pull (the lock freezes it and there is no rise-scroll any more), so this
      one read holds for the whole rise.
    */
    scene.recomputeDestination();

    /**
     * **Driven through the render loop's own `animate`, not a second rAF.**
     *
     * The first version ran its own `requestAnimationFrame` calling
     * `setPulled`, which only MARKS the scene dirty — the render loop then drew
     * on its own frame. Two rAF loops that had to interleave.
     *
     * `animate` exists for exactly this and is tested to draw every frame
     * (unit 19), so this is one mechanism rather than two.
     *
     * (A measurement of "9 draws across a 620ms rise" was once attributed to
     * the two-loop arrangement. That was wrong: headless Chromium throttles
     * rAF to ~10fps, and the same code headed gives 39 draws. The change is
     * still right; the reason recorded for it was not.)
     */
    let start: number | null = null;

    scene.animate((now) => {
      if (start === null) start = now;
      const progress = Math.min(1, (now - start) / RISE_MS);
      scene.setPulled(pulledId, progress);

      /*
        The rise finishing is a transition, not a flag: `settled` is what lets
        the chrome arrive and the tilt begin. Guarded on `rising` so a record
        dismissed mid-rise is not dragged back to settled by its own animation
        finishing.
      */
      if (progress >= 1) setState((current) => (current.phase === 'rising' ? settle(current) : current));

      return progress < 1;
    });
  }, [pulledId, returningId, state.phase]);

  /**
   * **The slide between records (13b).** A lateral move: `fromId` leaves one
   * side, `toId` arrives from the other, at the settled depth — not a return
   * and a fresh rise. That single movement is what the developer asked for,
   * where `pull(current, nextId)` was two full rises and read as jerky and as
   * "done with this one, get me that one" rather than "let me see the next".
   *
   * **Reduced motion:** no travel — `toId` is placed centred at once and the
   * state settles, the same instant path the rise takes.
   */
  useEffect(() => {
    if (sliding === null) return;
    const scene = live.current;
    if (scene === null) return;

    const { fromId, toId, direction } = sliding;

    /*
      Both paths settle through `animate`, not a synchronous `setState` — the
      latter cascades renders inside the effect. Reduced motion jumps straight
      to progress 1 on the first frame; otherwise it eases over `RISE_MS`.
    */
    const instant = prefersReducedMotion();
    let start: number | null = null;
    scene.animate((now) => {
      if (start === null) start = now;
      const progress = instant ? 1 : Math.min(1, (now - start) / RISE_MS);
      scene.setSlide(fromId, toId, direction, progress);
      if (progress >= 1) {
        setState((current) => (current.phase === 'sliding' ? settle(current) : current));
      }
      return progress < 1;
    });
  }, [sliding]);

  /**
   * **The flip: a half turn about Y, animated through the same loop.**
   *
   * The box has both faces, so this is a rotation of an object rather than a
   * state saying which side shows — which was the whole argument for the box in
   * unit 13, and what retired the half-turn cost NOTES had recorded.
   */
  useEffect(() => {
    if (state.phase !== 'flipping') return;
    const scene = live.current;
    if (scene === null) return;

    const target = showsBack(state) ? Math.PI : 0;
    const from = showsBack(state) ? 0 : Math.PI;

    let start: number | null = null;

    /*
      **Reduced motion turns the record instantly**, and the settle still goes
      through the loop rather than a synchronous `setState` in this effect —
      which `react-hooks/set-state-in-effect` refuses, correctly: it causes a
      cascading render to fix up state React can simply be given. Running one
      frame at progress 1 is the same code path with no animation in it.
    */
    const instant = prefersReducedMotion();

    scene.animate((now) => {
      if (instant) {
        scene.setFlip(target);
        setState((current) => (current.phase === 'flipping' ? settle(current) : current));
        return false;
      }

      if (start === null) start = now;
      const t = Math.min(1, (now - start) / RISE_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      scene.setFlip(from + (target - from) * eased);

      if (t >= 1) setState((current) => (current.phase === 'flipping' ? settle(current) : current));
      return t < 1;
    });
  }, [state]);

  /**
   * **The tilt: the pointer over the record, mapped by `tiltFor`.**
   *
   * Reused unchanged for a fifth time — pointer and rect in, two angles out. It
   * fits without modification, which is the point of it being pure.
   *
   * Bound only while `canTilt`, so it cannot fight the rise or the return: both
   * own the record's rotation while they run.
   */
  useEffect(() => {
    if (!canTilt(state)) return;
    const scene = live.current;
    const host = mount.current;
    if (scene === null || host === null) return;
    if (prefersReducedMotion()) return;

    const onMove = (event: PointerEvent) => {
      const box = host.getBoundingClientRect();
      /*
        The record occupies the middle of the view, so the tilt is mapped
        against a centred square of the canvas rather than the whole wall —
        pointing at a spine in the corner should not tilt the record hard over.
      */
      const size = Math.min(box.width, box.height) * 0.6;
      const face = {
        left: box.left + (box.width - size) / 2,
        top: box.top + (box.height - size) / 2,
        width: size,
        height: size,
      };

      scene.setTilt(tiltFor({ x: event.clientX, y: event.clientY }, face));
    };

    window.addEventListener('pointermove', onMove);
    return () => {
      window.removeEventListener('pointermove', onMove);
      scene.setTilt(NO_TILT);
    };
  }, [state]);

  /**
   * **Drag to tilt on touch (§10b: "on touch it is dragged").**
   *
   * The pointer effect above follows the cursor; this is its touch twin. The
   * boundary is the design: a finger that lands ON the record starts a tilt
   * drag (`touch-tilt.ts`'s `shouldStartTiltDrag`, from a real raycast via
   * `hitsPulledRecord`); a finger on the wall does not, and falls through to the
   * tap that pulls or dismisses — which is why the tap still works.
   *
   * **The record holds its angle when the finger lifts.** `touchmove` feeds
   * `tiltFor` exactly as the pointer does; `touchend` stops the drag WITHOUT
   * resetting the tilt (`endDrag` keeps it). The pointer version resets on
   * cleanup because it resets when the record LEAVES the tilting phase, which is
   * a different moment from a finger lifting — so the two do not share that
   * reset, and touch is deliberately hold-only.
   *
   * **What rests on the scroll lock, stated:** nothing here does. The record
   * drag is claimed by `touch-action: none` on the canvas (below) and by only
   * calling `setTilt` for touches that hit the record, so a record-drag never
   * scrolls even if the lock were removed. The lock's own job — that a
   * wall-drag while a record is out does not scroll the wall away — is separate
   * and unchanged.
   */
  useEffect(() => {
    if (!canTilt(state)) return;
    const scene = live.current;
    const host = mount.current;
    if (scene === null || host === null) return;
    if (prefersReducedMotion()) return;

    let drag: TiltDrag = { active: false, tilt: null };
    /* Where the drag began and where it is now — for the swipe/tilt decision. */
    let startAt: { x: number; y: number } | null = null;
    let lastAt: { x: number; y: number } | null = null;

    const faceFor = (): { left: number; top: number; width: number; height: number } => {
      const box = host.getBoundingClientRect();
      const size = Math.min(box.width, box.height) * 0.6;
      return {
        left: box.left + (box.width - size) / 2,
        top: box.top + (box.height - size) / 2,
        width: size,
        height: size,
      };
    };

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch === undefined) return;
      const hitRecord = scene.hitsPulledRecord(touch.clientX, touch.clientY);
      if (
        !shouldStartTiltDrag({ hitRecord, canTilt: true, reducedMotion: prefersReducedMotion() })
      ) {
        return;
      }
      drag = beginDrag();
      startAt = { x: touch.clientX, y: touch.clientY };
      lastAt = startAt;
      /*
        Claim the gesture: prevent the browser turning this into a scroll or a
        synthetic click. The empty-wall touch is NOT prevented (this handler
        returned above), so the tap that pulls/dismisses still fires there.
      */
      event.preventDefault();
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!drag.active) return;
      const touch = event.touches[0];
      if (touch === undefined) return;
      lastAt = { x: touch.clientX, y: touch.clientY };
      const tilt = tiltFor({ x: touch.clientX, y: touch.clientY }, faceFor());
      drag = { active: true, tilt };
      scene.setTilt(tilt);
      event.preventDefault();
    };

    const onTouchEnd = () => {
      if (!drag.active) return;

      /*
        **Swipe vs tilt, decided at release (13b).** A drag whose net horizontal
        travel crossed half the record's on-screen width, dominantly horizontal,
        was a navigation swipe — the finger left the record. The face square's
        width is the record's mapped width, so half of it is the same "past the
        edge" distance the tilt clamps at.
      */
      if (startAt !== null && lastAt !== null) {
        const direction = swipeDirection({
          dx: lastAt.x - startAt.x,
          dy: lastAt.y - startAt.y,
          recordWidth: faceFor().width,
        });
        if (direction !== null) {
          /* Leaving this record: snap the tilt back, then move. */
          scene.setTilt(NO_TILT);
          navigateRef.current(direction);
          drag = { active: false, tilt: null };
          startAt = null;
          lastAt = null;
          return;
        }
      }

      /* Not a swipe: hold the angle — do NOT reset. §10b: a record turned stays turned. */
      drag = endDrag(drag);
      startAt = null;
      lastAt = null;
    };

    const canvas = host.querySelector('canvas');
    if (canvas === null) return;
    /*
      **`touch-action: none` on the canvas while a record is out.** The
      declarative backstop to `preventDefault`: a record-drag never becomes a
      scroll even if a browser fires touchmove before the handler, and even if
      the scroll lock were removed. Restored on cleanup so the wall scrolls
      normally when no record is out.
    */
    const priorTouchAction = canvas.style.touchAction;
    canvas.style.touchAction = 'none';

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('touchcancel', onTouchEnd);
    return () => {
      canvas.style.touchAction = priorTouchAction;
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [state]);

  /**
   * **The record comes to the reader; the wall does NOT scroll (13b).**
   *
   * The rise once scrolled the wall to bring the record's slot to the viewport
   * centre — but that made the record's screen POSITION depend on the slot's
   * row, and it clamped at the top and bottom rows, leaving the record
   * mis-placed (overlapping the panel, or off the bottom edge). Now the record
   * settles at the VISIBLE viewport centre directly (`pulledDestination`'s
   * `viewCentrePx`), so nothing needs to scroll — and the phone slide bug goes
   * with it, since a top-row record no longer yanks the wall.
   *
   * This effect now only REMEMBERS where the reader was, so the scroll lock's
   * `restoreTo` returns there on put-back. No `window.scrollTo`.
   */
  useEffect(() => {
    if (state.phase !== 'rising') return;
    if (preRiseScrollY.current === null) preRiseScrollY.current = window.scrollY;
  }, [state.phase]);

  /**
   * **Escape puts the record back**, bound only while one is out.
   *
   * Clicking empty wall works but is discoverable by accident; Escape is what
   * anyone tries first. The CSS path had it and the swap left it behind.
   */
  useEffect(() => {
    if (pulledId === null) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setState(dismiss);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pulledId]);

  /** The record that is out, whatever it is doing. */
  const out =
    pulledId === null ? null : (records.find((record) => record.id === pulledId) ?? null);

  /*
    **The wall's order, for moving between records (13b).** `records` is already
    the deterministic genre order `shelfRecords` built the wall from — filtered
    walls repack it, so this is next IN WHAT IS SHOWN. Not a second order.
  */
  const order = useMemo(() => records.map((record) => record.id), [records]);

  /*
    Move to the adjacent record without a return to the wall (§10b). Reuses the
    same transition clicking a neighbouring spine does — `pull` to the new id —
    which honours the slots: the new record rises from its slot and the old
    slot refills. Under reduced motion the pull is instant (no rise), which the
    scene's own reduced-motion path already handles.
  */
  const navigate = (direction: Direction) => {
    if (pulledId === null) return;
    const nextId = adjacentRecordId(order, pulledId, direction);
    if (nextId === null) return;
    /*
      **A slide, not a pull.** `pull(current, nextId)` returned the held record
      to the shelf and rose the next — two full rises, reading as "done with
      this one, get me that one" and as jerky. A slide is one lateral movement
      that says "let me see the next" (developer's framing).
    */
    setState((current) => slide(current, nextId, direction));
  };
  /* The ref is updated in an effect, not during render (refs are write-in-effect). */
  useEffect(() => {
    navigateRef.current = navigate;
  });



  /*
    Freeze the page once the record has SETTLED, not while it rises. §10b unit 5:
    the wall scrolled under a camera-fixed record and they separated. Locking
    during the rise would freeze the page at its pre-rise scroll, before the
    rise-scroll effect below centres the record — so the record would settle
    off-screen against a frozen wall. Waiting for 'settled' lets the rise-scroll
    complete first, then the lock captures the centred position. 'flipping' keeps
    the lock while the record is turned.
  */
  /*
    **Locked through 'sliding' too**, not only 'settled'/'flipping'. A slide is a
    record out — the page must stay frozen behind the lateral move. Releasing
    the lock mid-slide ran its restore-scroll and scrolled the wall away, sending
    the record (placed at the wall's centre in world space) off-screen; worst for
    a top-row record, which restored to the top. The scroll-lock test asserts
    across pull and return only, so a slide slipped through (NOTES).
  */
  useScrollLock(
    state.phase === 'settled' || state.phase === 'flipping' || state.phase === 'sliding',
    { restoreTo: preRiseScrollY },
  );

  /* Clear the remembered scroll once the record is fully back. */
  useEffect(() => {
    if (state.phase === 'idle') preRiseScrollY.current = null;
  }, [state.phase]);

  /**
   * **The chrome arrives as the record travels** (unit 11): 0 while it rises,
   * 1 once it has settled or is flipping, 0 again as it returns. Derived from
   * the phase rather than held, so it cannot disagree with what the record is
   * doing.
   */
  const chromeOpacity = state.phase === 'settled' || state.phase === 'flipping' ? 1 : 0;

  const hovered =
    hoveredRecordId === null
      ? null
      : (records.find((record) => record.id === hoveredRecordId) ?? null);

  return (
    <div className="relative">
      <div ref={mount} data-testid="wall-scene" data-pulled={pulledId ?? ''} data-phase={state.phase} className="w-full" />

      {/*
        **The accessible list, and it is now the ONLY channel carrying the
        collection to anything that is not an eye.**

        A canvas is a picture: it has no text, no roles and no links, so a
        screen reader, a keyboard and a test all see nothing. Per-spine overlaid
        links were the alternative and were rejected — they would need
        positional alignment kept in sync with the layout, which is two systems
        agreeing about a number.

        What this costs, stated plainly: cmd-click on a spine is gone. What it
        keeps is the contract eight specs depend on — one link per record,
        named by its FULL untruncated title, resolving to the record.
      */}
      {/*
        **The card that names what the pointer is over** (§10b: artist, title,
        year, label).

        DOM rather than canvas, for A19e's reason: a canvas is a picture, and
        text belongs where something other than an eye can read it. It also
        reads as chrome rather than as part of the scene, which is what the
        reference does.

        `pointer-events-none` so it can never intercept the click it is
        describing — the same rule the CSS wall's label followed, and the reason
        that label never ate a pull.

        Offset from the pointer rather than centred on it, and flipped near the
        right edge so it does not run off the frame.
      */}
      {/**
        * **The scrim and the panels — the composition, in DOM.**
        *
        * A19e: the canvas is a picture, so text belongs where something other
        * than an eye can read it. The panels are fixed and static; they do not
        * track the record's geometry and never need to agree with the camera
        * about anything, which is what makes them cheap.
        *
        * **The chrome arrives AS the record travels**, not before it — unit 11
        * found that ordering is what makes the record read as arriving rather
        * than a modal opening. `chromeOpacity` is 0 while the record is rising
        * and reaches 1 as it settles.
        */}
      {out !== null && (
        <div
          data-testid="record-chrome"
          /*
            **The panels flank the record; they never cover it.** Criterion's
            overlap the case slightly at its edges and stop there.

            `justify-between` with the record's own space between them, rather
            than `justify-center` with a spacer that a flex row can compress:
            the panels are pushed to the edges and the middle belongs to the
            record. `pointer-events-none` on the row so the gap between them
            passes clicks through to the canvas — the tilt needs the pointer
            over the record, and a transparent div that ate it was how the tilt
            looked broken.
          */
          className="pointer-events-none fixed inset-0 z-40 flex items-center justify-between gap-6 px-6 transition-opacity duration-300"
          /*
            **Opacity only.** An inline `pointerEvents: 'auto'` here beat the
            `pointer-events-none` class and made the whole row swallow every
            click — including the empty wall that dismisses, and the pointer
            moves the tilt needs. The panels and the scrim carry their own
            `pointer-events-auto`, so the row itself must stay transparent to
            the pointer.
          */
          style={{ opacity: chromeOpacity }}
        >
          {/*
            The dimmed wall. A button so it is reachable and announces itself,
            and behind everything else so it never intercepts a panel click.
          */}
          <button
            type="button"
            data-testid="record-scrim"
            aria-label="Put the record back"
            onClick={() => setState(dismiss)}
            /*
              **`pointer-events-none`**, deliberately: the scrim covers the
              whole viewport including the record, so a clickable one eats every
              pointer move over it — which is what the tilt needs. Dismissing is
              handled by the canvas's own raycast missing every spine, plus
              Escape and "Put back", so nothing is lost.
            */
            /*
              **No longer dims anything** — the wall darkens in the SCENE now,
              which is the only place the record can be excluded from it. A
              `black/70` overlay above the canvas cost the cover 0.30x its
              brightness, measured, because z-order put it over the record too.

              Kept as a labelled, non-interactive element: it is what an
              assistive technology reads as "the wall, behind". Dismissing is
              the canvas's own raycast missing every spine, plus Escape and
              "Put back".
            */
            className="pointer-events-none absolute inset-0 -z-10"
          />

          {/*
            **The navigation arrows, overlaid on the artwork (13b).** Criterion
            puts them on the case, not in a side panel, because a panel arrow
            competes with the panel's own content — so these sit over the record
            at its vertical centre, one per side. Present on BOTH layouts.

            **Each is present only where there is somewhere to go** (`hasAdjacent`).
            §10b keeps rejecting an affordance that appears to work and does not,
            so at the first record the left arrow is absent and at the last the
            right one is — the wall stops visibly, by the arrow's absence, rather
            than a press that silently does nothing.

            `chromeOpacity` gates them with the rest of the chrome, so they
            arrive as the record settles rather than over a record still rising.
          */}
          {out !== null && hasAdjacent(order, out.id, 'previous') && (
            <button
              type="button"
              data-testid="nav-previous"
              aria-label="Previous record"
              onClick={() => navigate('previous')}
              className="pointer-events-auto absolute top-1/2 left-2 z-50 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-2xl"
              style={{ backgroundColor: PANEL_GROUND, color: PANEL_TEXT.title }}
            >
              ‹
            </button>
          )}
          {out !== null && hasAdjacent(order, out.id, 'next') && (
            <button
              type="button"
              data-testid="nav-next"
              aria-label="Next record"
              onClick={() => navigate('next')}
              className="pointer-events-auto absolute top-1/2 right-2 z-50 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-2xl"
              style={{ backgroundColor: PANEL_GROUND, color: PANEL_TEXT.title }}
            >
              ›
            </button>
          )}

          {/*
            **§10b/A32: the facts flank the record, or stack beneath it.** Above
            the measured threshold there is room for a panel beside a readable
            record; below it the record fills the frame and the facts become a
            summary card stacked under it, with the controls beneath that. The
            fork is one `recordLayout` decision so the two shapes cannot drift
            about which width gets which.

            Until the width is measured (first client render) the flanking
            layout is assumed — it is the desktop shape and the server markup is
            desktop-shaped, so a phone corrects on hydration rather than
            flashing a wrong layout that a wrong default would show at every
            width.
          */}
          {viewportWidth !== null && recordLayout(viewportWidth) === 'stacked' ? (
            <div
              data-testid="record-chrome-stacked"
              /*
                **An OVERLAY on the record's lower portion, not a block beneath
                it (A33a).** A scrim from transparent at the top to the panel
                ground at the bottom, so the artwork reads through the top of the
                panel as the reference does — the record stays full-bleed and
                camera-centred behind it.
              */
              className="pointer-events-auto absolute inset-x-0 bottom-0 rounded-t-xs"
              style={{
                backgroundImage: `linear-gradient(to bottom, transparent, ${PANEL_GROUND} 38%)`,
              }}
            >
              <RecordPanel
                summary={recordSummary(factPanel(out), out.id)}
                onTurnOver={() => setState(flip)}
                onPutBack={() => setState(dismiss)}
              />
            </div>
          ) : (
            <div
                data-testid="record-chrome-facts"
                className="pointer-events-auto max-w-[26vw] rounded-xs p-4 shadow-2xl backdrop-blur-sm"
                style={{ backgroundColor: PANEL_GROUND }}
              >
                {/*
                  **The flanking panel shows the expanded content at rest (A33d)**
                  — snippet, facts and the in-panel link, no chevron — because it
                  has the room the overlay does not. One `RecordPanel`, two
                  layouts. `record-chrome-actions` is folded in: the panel carries
                  Turn over / Put back itself, so the separate actions block is
                  gone.
                */}
                <RecordPanel
                  summary={recordSummary(factPanel(out), out.id)}
                  onTurnOver={() => setState(flip)}
                  onPutBack={() => setState(dismiss)}
                  alwaysExpanded
                />
              </div>
          )}
        </div>
      )}

      {/*
        **Not while a record is out.** Hover already does nothing then — the
        handler returns early — but the card is React state and kept its last
        value, so it sat over the facts panel naming the same record twice.
        State that outlives the thing it describes is the shape this project
        keeps meeting; the guard derives it from the phase instead.
      */}
      {out === null && hovered !== null && cardAt !== null && (
        <div
          data-testid="wall-card"
          className="pointer-events-none fixed z-40 max-w-xs rounded-xs border border-border bg-popover px-3 py-2 shadow-lg"
          style={{
            left: cardAt.x + 18,
            top: cardAt.y + 18,
            transform: cardAt.x > window.innerWidth - 280 ? 'translateX(-100%)' : undefined,
          }}
        >
          <p className="text-sm font-medium text-popover-foreground">{hovered.title}</p>
          <p className="text-xs text-muted-foreground">
            {[hovered.artistName, hovered.releaseYear, hovered.labelName]
              .filter((part) => part !== null && part !== '')
              .join(' · ')}
          </p>
        </div>
      )}

      <ul
        data-testid="wall-records"
        /*
          **Visually hidden, but REACHABLE.** `sr-only` alone clips the list to
          1px, which is correct for a screen reader and wrong for a keyboard:
          measured by hand after the swap, tabbing skipped the entire wall and a
          link could not be clicked at all.

          The CSS wall's spines were real focusable links, so this would have
          been a capability lost in the swap rather than one knowingly traded.
          `focus-within:not-sr-only` brings the list into view the moment
          anything in it takes focus, so a keyboard user can walk the collection
          and open a record — which is the contract the canvas cannot carry.
        */
        className="sr-only focus-within:not-sr-only focus-within:absolute focus-within:inset-x-0 focus-within:top-0 focus-within:z-30 focus-within:max-h-64 focus-within:overflow-y-auto focus-within:bg-background focus-within:p-4 focus-within:shadow-lg"
      >
        {records.map((record) => (
          <li key={record.id}>
            <a
              href={`/records/${record.id}`}
              className="block rounded-xs px-2 py-1 text-sm text-foreground focus:bg-accent focus:outline-2"
            >
              {`${record.title} — ${record.artistName}`}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
