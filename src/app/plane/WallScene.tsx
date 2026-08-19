'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
  type Material,
} from 'three';
import type { ShelfRecord } from '@/lib/db/queries/shelf';
import {
  DEFAULT_SPINE_COLOUR,
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
import { layoutWall, type WallLayout } from './wall-layout';
import { WALL_FOV_DEGREES, wallCameraDistance } from './wall-camera';
import { pulledDestination } from './pulled-destination';
import { boxDepth } from './record-box';
import { PROUD_MS, proudOffset, shouldRedraw } from './hover-proud';
import { NO_TILT, tiltFor } from '../shelf/tilt';
import { ActionsPanel, FactsPanel } from './Panels';
import { factPanel } from './panel';
import { PANEL_GROUND } from '../shelf/panel-palette';
import {
  canTilt,
  dismiss,
  flip,
  outRecordId,
  pull,
  settle,
  showsBack,
  type RecordState,
} from './record-state';
import { createWidthWatcher } from './wall-resize';
import { RESTING_ROTATION_Y } from './spine-facing';

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



export function WallScene({ records }: { records: ShelfRecord[] }) {
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
   * The pulled id, readable from the click handler.
   *
   * The handler is bound inside the scene effect, which deliberately does NOT
   * re-run when a record is pulled — rebuilding 125 meshes on every click is
   * the cost this scene is careful about. So it closes over the value at build
   * time, which is always null. A ref is the read-through.
   */
  const pulledIdRef = useRef<string | null>(null);

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

    const height = layout.height;

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
     * and that is fine for the camera and NOT fine for the pull depth. See
     * `PULL_DEPTH_CAP` below.
     */
    const cameraDistance = wallCameraDistance({ wallHeight: height });
    const destination = pulledDestination({ wallWidth: width, wallHeight: height });
    const camera = new PerspectiveCamera(WALL_FOV_DEGREES, width / height, 1, cameraDistance * 2);
    camera.position.set(width / 2, -height / 2, cameraDistance);
    camera.lookAt(width / 2, -height / 2, 0);

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
      The shelves: one per row, spanning the full width. §10b's plane rule —
      "the surface runs edge to edge and ends where the wall ends", not where
      the records do.
    */
    const shelfGeometry = new PlaneGeometry(1, 1);
    disposables.push(shelfGeometry);

    for (const shelf of layout.shelves) {
      const surface = new Mesh(
        shelfGeometry,
        new MeshStandardMaterial({ color: new Color(SHELF_PLANE), roughness: 0.75 }),
      );
      surface.scale.set(shelf.width, shelf.height * 0.7, 1);
      surface.position.set(shelf.x + shelf.width / 2, -(shelf.y + shelf.height * 0.35), 1);
      scene.add(surface);
      disposables.push(surface.material as Material);

      const lip = new Mesh(
        shelfGeometry,
        new MeshStandardMaterial({ color: new Color(SHELF_LIP), roughness: 0.9 }),
      );
      lip.scale.set(shelf.width, shelf.height * 0.3, 1);
      lip.position.set(shelf.x + shelf.width / 2, -(shelf.y + shelf.height * 0.85), 1);
      scene.add(lip);
      disposables.push(lip.material as Material);
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
        The cover face, revealed by the turn. Plain in the record's own spine
        colour for now — §10b's "an honest absence, not a gap in the wall" —
        because cover textures are a later unit and a placeholder would assert
        artwork the record does not have.
      */
      const cover = new MeshStandardMaterial({ color: new Color(colour), roughness: 0.62 });
      disposables.push(plain, faced, cover);

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
      const mesh = new Mesh(spineGeometry, [faced, plain, plain, plain, cover, plain]);
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
    live.current = {
      animate: (step) => loop.animate(step),
      setFlip: (turn: number) => {
        flipTurn = turn;
        loop.markDirty();
      },
      setTilt: (next: { rotateX: number; rotateY: number }) => {
        tiltNow = next;
        loop.markDirty();
      },
      setPulled: (id, progress) => {
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
          host.dataset.settledNdcX = String(ndc.x);
          host.dataset.settledNdcY = String(ndc.y);

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
    let easing = false;

    /** Where each spine currently sits, so a new hover eases from there. */
    const currentProud = new Map<string, number>();

    const settleProud = () => {
      if (easing) return;
      easing = true;
      proudStart = null;

      loop.animate((now) => {
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
          const home = mesh.userData.home as { z: number };
          mesh.position.z = home.z + at;
        }

        if (t >= 1) easing = false;
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
      setHoveredRecordId(null);
      settleProud();
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);
    renderer.domElement.addEventListener('click', onClick);

    return () => {
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
  }, [spines, records]);

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

        if (elapsed >= 1) setState({ phase: 'idle' });
        return elapsed < 1;
      });
      return;
    }

    if (pulledId === null) {
      scene.setPulled(null, 0);
      return;
    }

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
  }, [pulledId, returningId]);

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
      <div ref={mount} data-testid="wall-scene" data-pulled={pulledId ?? ''} className="w-full" />

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
          className="fixed inset-0 z-40 flex items-center justify-center gap-8 p-6 transition-opacity duration-300"
          style={{ opacity: chromeOpacity, pointerEvents: chromeOpacity === 0 ? 'none' : 'auto' }}
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
            className="absolute inset-0 -z-10 cursor-default bg-black/70"
          />

          <div
            className="rounded-xs p-4 shadow-2xl backdrop-blur-sm"
            style={{ backgroundColor: PANEL_GROUND }}
          >
            <FactsPanel panel={factPanel(out)} />
          </div>

          {/*
            A spacer the width of the record, so the panels sit either side of
            it rather than over it. The record itself is drawn in the canvas
            beneath — the panels never move to follow it.
          */}
          <div className="w-[min(46vw,46vh,420px)] shrink-0" aria-hidden />

          <div
            className="rounded-xs p-4 shadow-2xl backdrop-blur-sm"
            style={{ backgroundColor: PANEL_GROUND }}
          >
            <ActionsPanel
              recordId={out.id}
              onTurnOver={() => setState(flip)}
              onPutBack={() => setState(dismiss)}
            />
          </div>
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
