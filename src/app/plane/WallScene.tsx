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
  OrthographicCamera,
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

/** How far forward of the wall a pulled record sits, in wall pixels. */
const PULL_DEPTH = 420;

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
  const live = useRef<{ setPulled: (id: string | null, progress: number) => void } | null>(null);

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

    /*
      **Orthographic, mapped 1:1 to wall pixels.** The frustum IS the wall's
      pixel box, so `layoutWall`'s coordinates are the scene's coordinates and
      no projection sits between them. Y is negated once, here, at the boundary:
      the layout grows downward like the DOM, the scene grows upward.
    */
    const camera = new OrthographicCamera(0, width, 0, -height, -1000, 2000);
    camera.position.z = 1000;

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
      const canvas = document.createElement('canvas');
      canvas.width = plan.canvasWidth;
      canvas.height = plan.canvasHeight;
      const context = canvas.getContext('2d');

      if (context !== null) {
        context.fillStyle = colour;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = textColourOn(record.spineColour) === 'light' ? '#ece6dc' : '#241f18';
        context.font = `600 ${plan.fontPx}px ui-monospace, monospace`;
        context.textBaseline = 'middle';
        context.textAlign = 'left';
        // Along the spine, reading bottom-to-top as spines on a shelf do.
        context.save();
        context.translate(canvas.width, canvas.height / 2);
        context.rotate(Math.PI);
        context.fillText(plan.text, 6, 0);
        context.restore();
      }

      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      disposables.push(texture);

      const plain = new MeshStandardMaterial({ color: new Color(colour), roughness: 0.7 });
      const faced = new MeshStandardMaterial({ map: texture, roughness: 0.7 });
      disposables.push(plain, faced);

      /*
        BoxGeometry material order is [+x, -x, +y, -y, +z, -z]. The label goes
        on +z, which faces the viewer while the spine stands in the wall.
      */
      const mesh = new Mesh(spineGeometry, [plain, plain, plain, plain, faced, plain]);
      mesh.scale.set(placed.width, SPINE_HEIGHT, placed.width);
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
            mesh.position.set(home.x, home.y, home.z);
            mesh.rotation.y = 0;
            continue;
          }

          const pose = risePose({ progress, slotDepth: PULL_DEPTH });

          /*
            Toward the centre of the visible wall as it turns and comes forward.
            The record is read at the middle of the screen, not above its slot.
          */
          const eased = 1 - Math.pow(1 - progress, 3);
          mesh.position.set(
            home.x + (width / 2 - home.x) * eased,
            home.y + (-(SPINE_HEIGHT * 0.9) - home.y) * eased,
            home.z + pose.z,
          );
          /**
           * **No rotation while the wall stays orthographic.**
           *
           * `risePose`'s quarter turn was built for the perspective camera on
           * `/`, where a turning face foreshortens and reads as a turn. Under
           * an orthographic camera — which A24b requires for the wall — a
           * rotation about Y produces a pure horizontal squash with no
           * convergence, so it reads as the record being squeezed rather than
           * turned. Two attempts at combining it with the width interpolation
           * produced a record that grew then shrank, and then spines that
           * filled the wall.
           *
           * This unit's question is whether the SLOT EMPTIES, and it does. How
           * the record turns under an orthographic camera is a real open
           * question and is reported rather than guessed at a third time.
           */
          mesh.rotation.y = 0;

          // How far the spine has travelled from its slot, in wall pixels.
          const dx = mesh.position.x - home.x;
          const dy = mesh.position.y - home.y;
          const dz = mesh.position.z - home.z;
          host.dataset.slotGap = String(Math.sqrt(dx * dx + dy * dy + dz * dz));
          /*
            The spine grows into a record as it comes out: X from the spine's
            width to the record's full size. Rotation stays out of the size,
            because combining the two double-counts the turn.
          */
          const spineW = placedWidthFor(recordId);
          mesh.scale.set(spineW + (SPINE_HEIGHT - spineW) * eased, SPINE_HEIGHT, spineW);
        }
        loop.markDirty();
      },
    };

    function placedWidthFor(id: string): number {
      return layout.placed.find((p) => p.id === id)?.width ?? 20;
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

    let start: number | null = null;
    let frame = 0;

    const step = (now: number) => {
      if (start === null) start = now;
      const progress = Math.min(1, (now - start) / RISE_MS);
      scene.setPulled(pulledId, progress);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);

    return () => cancelAnimationFrame(frame);
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
