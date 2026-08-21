'use client';

import { BoxCanvas } from './BoxCanvas';
import type { Skins } from './skins';

/**
 * **Three containers of deliberately different shapes, one filling record in
 * each.** The subject is whether `BoxCanvas`'s filling variant adopts the box
 * it is given.
 *
 * It did not: `aspect-square w-[min(70vw,70vh,560px)]` asserted its own
 * geometry, so every instance rendered at the same size — 273px at 390x844 —
 * and could never be non-square. That made the three-way fill comparison
 * meaningless while its captions stayed correct (NOTES: "the truth in text and
 * a lie in pixels").
 *
 * **A probe rather than a demo.** The cells are sized in `vw`/`vh` so their
 * shapes are properties of the viewport rather than of a stylesheet a later
 * edit might quietly change, and each carries `data-probe-cell` so the test
 * measures the container it is asserting about rather than a guess at which
 * `div` is which.
 *
 * Driven by `e2e/box-canvas-geometry.spec.ts`.
 */
export function BoxGeometryProbe({
  skins,
  spineColour,
}: {
  skins: Skins;
  spineColour: string | null;
}) {
  const CELLS = [
    { key: 'square', className: 'h-[30vw] w-[30vw]' },
    { key: 'wide', className: 'h-[18vw] w-[36vw]' },
    { key: 'tall', className: 'h-[36vw] w-[18vw]' },
  ] as const;

  return (
    <section data-testid="box-geometry-probe" className="mt-14">
      <h2 className="font-heading text-xl font-semibold text-foreground">
        Container geometry probe
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        One filling record in each of three containers. Each should fill its own box,
        including the two that are not square.
      </p>

      <div className="mt-6 flex flex-wrap items-start gap-6">
        {CELLS.map((cell) => (
          <div key={cell.key} className="flex flex-col gap-2">
            <div
              data-probe-cell={cell.key}
              className={`${cell.className} border border-border bg-[#111]`}
            >
              <BoxCanvas
                skins={skins}
                imprint={null}
                spineColour={spineColour}
                testId={`probe-box-${cell.key}`}
                label={cell.key}
                fill
              />
            </div>
            <p className="font-mono text-xs text-muted-foreground">{cell.key}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
