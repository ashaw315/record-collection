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
import { RISE_MS } from './BoxCanvas';
import { spineLabelPlan } from './spine-texture';
import { layoutWall, type WallLayout } from './wall-layout';
import { WALL_FOV_DEGREES, wallCameraDistance } from './wall-camera';
import { pulledDestination } from './pulled-destination';
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
  const [pulledId, setPulledId] = useState<string | null>(null);

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
   * one of them. There is no width state now. The effect measures the element
   * it is about to draw into, on the frame before it draws, and a
   * `ResizeObserver` re-runs the whole effect by bumping a version counter when
   * the element genuinely changes size.
   */
  useEffect(() => {
    const host = mount.current;
    if (host === null) return;

    let cancelled = false;
    let teardown: (() => void) | null = null;

    /*
      Deferred one frame so the measurement happens after layout. Measuring
      synchronously in an effect can read zero on the first commit, which is
      what the old version did — and then it had no reliable way to try again.
    */
    const frame = requestAnimationFrame(() => {
      if (cancelled) return;
      const width = host.clientWidth || host.parentElement?.clientWidth || 0;
      if (width === 0 || spines.length === 0) return;
      teardown = build(host, width, layoutWall({ spines, viewportWidth: width }));
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
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
      mesh.scale.set(SPINE_HEIGHT, SPINE_HEIGHT, placed.width);
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

    const loop = createRenderLoop(() => renderer.render(scene, camera));
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
      setPulled: (id, progress) => {
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
            mesh.scale.set(SPINE_HEIGHT, SPINE_HEIGHT, widthOf.get(recordId) ?? 20);
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
          mesh.rotation.y = -pose.rotationY;

          // How far the spine has travelled from its slot, in wall pixels.
          const dx = mesh.position.x - home.x;
          const dy = mesh.position.y - home.y;
          const dz = mesh.position.z - home.z;
          host.dataset.slotGap = String(Math.sqrt(dx * dx + dy * dy + dz * dz));

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
          mesh.scale.set(SPINE_HEIGHT, SPINE_HEIGHT, placedWidthFor(recordId));
        }
        loop.markDirty();
      },
    };

    /*
      A map rather than a `find` per mesh per frame: at 125 spines the scan ran
      125x125 times a frame, which is the class of mistake this scene has room
      for and the last unit was bitten by.
    */
    const widthOf = new Map(layout.placed.map((p) => [p.id, p.width]));

    function placedWidthFor(id: string): number {
      return widthOf.get(id) ?? 20;
    }

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

      setPulledId(typeof hit === 'string' ? hit : null);
    };

    renderer.domElement.addEventListener('click', onClick);

    return () => {
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

    if (pulledId === null) {
      scene.setPulled(null, 0);
      return;
    }

    /**
     * **Driven through the render loop's own `animate`, not a second rAF.**
     *
     * The first version ran its own `requestAnimationFrame` calling
     * `setPulled`, which only MARKS the scene dirty — the render loop then drew
     * on its own frame. Two rAF loops, and a mark landing after the render
     * loop's frame had already passed was simply lost. Measured: **9 draws
     * across a 620ms rise** where 60fps is about 37, so the rise ran at roughly
     * 15fps while reporting `progress: 1` and looking correct in a screenshot.
     *
     * `animate` exists for exactly this and is tested to draw every frame
     * (unit 19). Using it makes the rise and the dirty flag one mechanism
     * rather than two that must interleave.
     */
    let start: number | null = null;

    scene.animate((now) => {
      if (start === null) start = now;
      const progress = Math.min(1, (now - start) / RISE_MS);
      scene.setPulled(pulledId, progress);
      return progress < 1;
    });
  }, [pulledId]);

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
      <ul data-testid="wall-records" className="sr-only">
        {records.map((record) => (
          <li key={record.id}>
            <a href={`/records/${record.id}`}>{`${record.title} — ${record.artistName}`}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
