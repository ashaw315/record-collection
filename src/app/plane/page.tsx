import { asc } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { images } from '@/db/schema';
import { PlaneCanvas } from './PlaneCanvas';
import { coverTextureUrl } from './plane';

/**
 * §10b's first `three.js` unit, on a route of its own.
 *
 * **Deliberately not a view of `/`.** The collection's `view` parameter is
 * validated against `VIEW_MODES`, which mirrors §10 and §10b — adding a `plane`
 * value would make a spec-mirroring constant name something the spec does not,
 * and would touch a shared parser and its tests. A separate route touches
 * nothing that already works.
 *
 * **The CSS implementation is untouched and still the thing that works.** Units
 * 10-13 keep running exactly as they are; this route puts a plane on screen
 * beside them so the renderer can be proven before anything is replaced.
 * Deleting the CSS version comes much later, in one reviewable diff, once the
 * WebGL version does everything it does.
 *
 * The `<img>` beside the canvas is the point of the page rather than a
 * convenience: a texture can be wrong in ways that look entirely plausible on
 * their own, and the only way to see a colour-space error is to put the source
 * next to the render at the same size.
 */
export const dynamic = 'force-dynamic';

export default async function PlanePage() {
  const db = getDb();

  /**
   * A REAL cover from the database, never a checkerboard. A synthetic texture
   * cannot show a colour-space problem, because there is nothing to compare it
   * against — the same reason the spine-colour work measured against real
   * sleeves rather than swatches.
   */
  const rows = await db
    .select({ imageType: images.imageType, url: images.url })
    .from(images)
    .orderBy(asc(images.createdAt));

  const textureUrl = coverTextureUrl(rows);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="font-heading text-2xl font-semibold text-foreground">
        Textured plane
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        §10b, step 13 unit 15: one static plane with a real cover on it. No motion, no box, no
        panels. The image on the right is the same file in an <code>&lt;img&gt;</code>, at the
        same size, so a colour or aspect difference is visible rather than inferred.
      </p>

      {textureUrl === null ? (
        /*
          §10b: a record with no cover is ordinary, not an error. Saying so
          beats rendering a plane the material's own colour, which would be
          indistinguishable from a texture that failed to load — the silent
          failure this unit exists to surface.
        */
        <p data-testid="plane-no-cover" className="mt-8 text-sm text-muted-foreground">
          No cover image in the database, so there is nothing to texture a plane with.
        </p>
      ) : (
        <div className="mt-8 flex flex-wrap items-start gap-8">
          <PlaneCanvas textureUrl={textureUrl} />

          <div className="flex flex-col gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={textureUrl}
              alt="The same cover, unmodified, for comparison"
              data-testid="plane-source-img"
              className="h-[420px] w-[420px] object-cover"
            />
            <p className="font-mono text-xs text-muted-foreground">source &lt;img&gt;</p>
            {/*
              **The two are not framed identically, and the reason is the
              source rather than either renderer.** Covers are not reliably
              square: this one is 591x599. `object-cover` CROPS to fill a square
              box; the texture map STRETCHES the whole image across a square
              plane. So a pixel-for-pixel diff shows a small offset even when
              the colours match exactly, and reading that offset as a colour
              problem would send the next unit hunting in the wrong place.

              §10b says the slots "are expected to be square". Deciding what to
              do when they are not — crop, letterbox, or accept the stretch — is
              a texture-pipeline decision and belongs to the unit that maps all
              four slots, not to the one that proves a plane renders.
            */}
          </div>
        </div>
      )}
    </main>
  );
}
