'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  TextureLoader,
  WebGLRenderer,
} from 'three';
import { squareFrustum } from './plane';

/**
 * §10b's first `three.js` unit: ONE static textured plane, and nothing else.
 *
 * No motion of any kind — no rise, no tilt, no flip, no hinge, no box, no
 * second face, no edges, no panels, no pointer handling. That restraint is the
 * discipline of the unit rather than an omission: every failure on this feature
 * so far has been two things disagreeing, and a canvas adds a third party whose
 * failures are SILENT. A black square, a washed-out texture and nothing at all
 * are the same observation from outside, and the error messages point at the
 * draw call rather than the cause. So this puts one known-good thing on screen
 * and stops.
 *
 * **`MeshBasicMaterial`, not a lit material.** Basic is unlit, so what reaches
 * the screen is the texture and only the texture. A lit material would put a
 * light's colour between the source image and the pixels, and the colour check
 * this unit turns on could not then distinguish a colour-space bug from a
 * lighting one — which is precisely the confusion the prompt's hazard note
 * warns against fixing with a light.
 *
 * **Colour space, verified against the installed package rather than
 * remembered.** `three@0.185.1` (r185): `sRGBEncoding` and `LinearEncoding` are
 * GONE — not deprecated, absent — and `SRGBColorSpace` with the renderer's
 * `outputColorSpace` replace them. Setting `texture.colorSpace` is what stops
 * an sRGB JPEG being sampled as if it were linear, which renders washed out.
 */
export function PlaneCanvas({ textureUrl }: { textureUrl: string }) {
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
    /**
     * The renderer converts linear working colours to sRGB on the way out. With
     * the texture also declared sRGB, the two cancel and the pixels match the
     * source — which is the whole of the colour correctness this unit checks.
     */
    renderer.outputColorSpace = SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const scene = new Scene();

    const { left, right, top, bottom } = squareFrustum(width, height);
    const camera = new OrthographicCamera(left, right, top, bottom, 0.1, 10);
    camera.position.z = 1;

    // A 1x1 plane, matched to the frustum's shorter axis by `squareFrustum`.
    const geometry = new PlaneGeometry(1, 1);
    const material = new MeshBasicMaterial({ transparent: true });
    const mesh = new Mesh(geometry, material);
    scene.add(mesh);

    let disposed = false;

    new TextureLoader().load(
      textureUrl,
      (texture) => {
        if (disposed) {
          texture.dispose();
          return;
        }
        // r185: `colorSpace`, not the removed `encoding`.
        texture.colorSpace = SRGBColorSpace;
        material.map = texture;
        material.needsUpdate = true;
        renderer.render(scene, camera);
        setStatus('ready');
      },
      undefined,
      () => {
        /**
         * Reported rather than swallowed. A texture that fails to load leaves a
         * plane the material's own colour, which looks like a rendering bug
         * rather than a network one — the silent-failure shape this unit exists
         * to make visible.
         */
        if (!disposed) setStatus('failed');
      },
    );

    // One frame now, so the plane exists on screen before the texture arrives.
    // Static by design: no animation loop, because nothing moves in this unit.
    renderer.render(scene, camera);

    return () => {
      disposed = true;
      renderer.domElement.remove();
      geometry.dispose();
      material.map?.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, [textureUrl]);

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={mount}
        data-testid="plane-canvas"
        data-status={status}
        className="h-[420px] w-[420px] bg-[#111]"
      />
      <p className="font-mono text-xs text-muted-foreground">
        canvas · status: {status}
      </p>
    </div>
  );
}
