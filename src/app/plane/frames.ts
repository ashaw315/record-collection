/**
 * **The four spaces this scene's numbers live in, made distinct to the compiler.**
 *
 * Every geometry defect this week was a value derived from the wrong space, and
 * every one of them typechecked, because all four spaces are `number`:
 *
 * - `pulledDestination` framed the camera on `wallHeight` where it meant the
 *   viewport's height — the pull-depth defect. Three quantities, all wrong the
 *   same way, for weeks.
 * - `framedCameraDistance` vs `wallCameraDistance`: the same argument name
 *   (`wallHeight`) reaching two different framings.
 * - The shelf's depth was answered six times in scene-Z and checked against
 *   spine geometry in wall space.
 *
 * **A test cannot catch this class.** A value derived from the wrong frame is
 * perfectly self-consistent — which is why all six wrong shelf-depth values
 * passed their tests, and why `motion-sample.ts` cannot see it either: that
 * table asserts driven properties AGREE WITH EACH OTHER, and two quantities
 * from the same wrong space agree perfectly.
 *
 * A compiler can — with one gap, verified rather than assumed. Passing a `WallPx`
 * where a `FramePx` is required is rejected, and so is a bare `number`; but
 * TypeScript permits `+` between two different brands, so `sceneZ(-107) +
 * canvasPx(743)` still compiles. **Branding catches wrong-frame ARGUMENTS, not
 * wrong-frame ARITHMETIC.** That is the majority of this class — every defect
 * listed above was an argument — but it is not all of it.
 *
 * Branding costs nothing at runtime — these are `number` after
 * erasure — and turns `framedCameraDistance({ wallHeight: viewportHeight })`
 * from a wrong number into a build failure.
 *
 * **What this deliberately does NOT cover: time.** Position and pose reading
 * different clocks (the rise's split easing) is the same class of error in a
 * dimension branding will not reach — both are `number` in [0, 1] and both are
 * legitimately progress, so there is no wrong space to name. That stays
 * `motion-sample.ts`'s job, and is the reason that table has to keep existing
 * rather than being replaced by this.
 */

/**
 * **Wall space** — the packer's coordinate system. Origin at the wall's
 * top-left, `+y` DOWN the wall in the layout and negated into world where the
 * scene reads it. `layout.width`, `layout.height`, slot positions, `SPINE_HEIGHT`.
 *
 * Scales with the collection: a 125-record wall is nine rows tall and a
 * one-record wall is one. That scaling is exactly what makes it wrong to frame
 * a camera on.
 */
export type WallPx = number & { readonly __frame: "wall" };

/**
 * **Frame space** — what the camera can see, which is the VIEWPORT, not the
 * wall. Fixed regardless of how many records are owned.
 *
 * The distinction from `WallPx` is the whole point of this module: the wall may
 * be taller than the frame, and that is a scroll question.
 */
export type FramePx = number & { readonly __frame: "frame" };

/**
 * **Canvas space** — the drawing surface's own pixels. `renderer.setSize`,
 * `getBoundingClientRect`, `viewCentrePx`.
 *
 * Distinct from `FramePx` because the canvas is as tall as the WALL (it scrolls
 * with the page) while the frame is as tall as the viewport. Conflating them is
 * how a 240-unit record came to fill 457% of a 52-unit frame on a phone.
 */
export type CanvasPx = number & { readonly __frame: "canvas" };

/**
 * **Scene Z** — depth toward the camera. The wall plane is `z = 0`, `+z` is
 * toward the viewer, and the shelf board spans roughly `-107..133`.
 *
 * Distinct from every space above because it is a DEPTH rather than an extent:
 * adding a wall height to a z is meaningless, and today it compiles.
 */
export type SceneZ = number & { readonly __frame: "sceneZ" };

/**
 * **The constructors are the entire attack surface.**
 *
 * A brand is only as good as the places that assert it: each of these is a
 * point where a caller can label a number with the wrong space and the compiler
 * will believe it. There are five, deliberately — few enough to review by
 * reading this file, and each one names what a caller must have established
 * before using it.
 *
 * They are the ONLY sanctioned way to enter the branded world. A cast at a call
 * site (`x as WallPx`) does the same thing invisibly, which is why the crossings
 * below are named functions instead.
 */

/** The packer's own output, or a constant authored in wall coordinates. */
export const wallPx = (n: number): WallPx => n as WallPx;

/** A viewport dimension — `window.innerHeight`, or a measured visible height. */
export const framePx = (n: number): FramePx => n as FramePx;

/** A canvas dimension or offset — `setSize`, a bounding rect, a scroll position. */
export const canvasPx = (n: number): CanvasPx => n as CanvasPx;

/** A depth in scene coordinates, measured from the wall plane at `z = 0`. */
export const sceneZ = (n: number): SceneZ => n as SceneZ;

/**
 * Strips the brand for arithmetic that genuinely leaves the space — trigonometry,
 * ratios, `Math.max` against an unbranded bound.
 *
 * Named rather than implicit so a crossing is visible at the call site: this is
 * the one place the type system stops helping, and it should be greppable.
 */
export const raw = (n: WallPx | FramePx | CanvasPx | SceneZ): number => n;

/**
 * **The canvas is 1:1 with wall space on the wall plane**, which is what makes
 * this conversion legal at all — and it is legal ONLY there. At the record's own
 * depth the mapping is a projection, not a scale, which is the parallax
 * `pulled-destination`'s `viewY` solves through rather than assuming.
 */
export const wallToCanvas = (n: WallPx): CanvasPx => n as unknown as CanvasPx;

/**
 * The visible height of the canvas — a canvas measurement reinterpreted as the
 * frame the camera fills. Named because `viewportCameraDistance` must be framed
 * on what the reader SEES, and reaching for the canvas's full height here is
 * precisely the pull-depth defect.
 */
export const canvasToFrame = (n: CanvasPx): FramePx => n as unknown as FramePx;
