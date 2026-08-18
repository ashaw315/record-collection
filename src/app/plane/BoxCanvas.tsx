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
 * Chosen at 1:40 after rendering 1:25, 1:40 and 1:70 and cropping the edge —
 * see the unit report. A real 12″ sleeve is about 1:70, which under light is a
 * hairline; 1:25 reads as a DVD case, which is the reference's own proportion
 * and the wrong thing to borrow.
 */
export const BOX_THICKNESS_RATIO = 1 / 40;

/** The fixed viewing angle: enough to show a face and an edge together. */
const VIEW_ANGLE_Y = 0.42;
const VIEW_ANGLE_X = 0.16;

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
  thicknessRatio = BOX_THICKNESS_RATIO,
  label,
}: {
  skins: Skins;
  imprint: string | null;
  thicknessRatio?: number;
  label?: string;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');

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
    const edgeMaterial = () =>
      new MeshStandardMaterial({ color: 0x2a2724, roughness: 0.85, metalness: 0.02 });

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

    const mesh = new Mesh(geometry, materials);
    mesh.rotation.y = VIEW_ANGLE_Y;
    mesh.rotation.x = VIEW_ANGLE_X;
    scene.add(mesh);

    let disposed = false;
    const owned: Texture[] = [];
    let pending = 0;

    const draw = () => {
      if (!disposed) renderer.render(scene, camera);
    };

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

    applySkin(skins.front, front, false);
    applySkin(skins.back, back, true);

    draw();
    if (pending === 0) setStatus('ready');

    return () => {
      disposed = true;
      renderer.domElement.remove();
      geometry.dispose();
      for (const texture of owned) texture.dispose();
      for (const material of materials) material.dispose();
      renderer.dispose();
    };
  }, [skins, imprint, thicknessRatio]);

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={mount}
        data-testid="box-canvas"
        data-status={status}
        className="h-[420px] w-[420px] bg-[#111]"
      />
      <p className="font-mono text-xs text-muted-foreground">
        {label ?? 'box'} · {status}
      </p>
    </div>
  );
}
