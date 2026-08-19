/**
 * Which face of a spine points at the viewer.
 *
 * **A wall rendered perfectly and showed no text.** Colour, lighting, shelves,
 * layout and the slot behaviour were all correct; the labels were on the face
 * pointing away. Nothing errored, no assertion failed, and it was only visible
 * by looking at a wall with real data on it.
 *
 * The cause is a sign that is easy to get backwards and impossible to check by
 * reading: under three.js's Y rotation, `x' = x·cos + z·sin` and
 * `z' = −x·sin + z·cos`, so the +x normal maps to `z = −1` at +π/2 and to
 * `z = +1` at −π/2. The face that points at a camera on +z is therefore **−x**
 * after a positive quarter turn.
 *
 * Extracted so the relationship is arithmetic a test can pin, rather than a
 * property of a scene that has to be rendered and looked at.
 */

/**
 * A spine's rotation about Y while it stands in the wall.
 *
 * **Negative, and both ends of the motion depend on it.** At −π/2 the sleeve's
 * edge (+x, where the label is printed) faces the viewer; when the turn
 * completes at 0, the cover (+z) does. The other plausible fix — leaving the
 * rotation positive and moving the label to −x — fixes the wall and leaves the
 * record showing its BACK when it finishes turning, which only appears after a
 * 620ms animation.
 */
export const RESTING_ROTATION_Y = -Math.PI / 2;

/** The box face whose normal points most directly at a camera on +z. */
export type Facing = '+x' | '-x' | '+z' | '-z';

export function faceTowardCamera(rotationY: number): Facing {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);

  /*
    Each face's normal after the rotation, expressed as its z component — how
    much it points at a camera sitting on the +z axis. The largest wins.
  */
  const towardCamera: Array<[Facing, number]> = [
    ['+x', -sin],
    ['-x', sin],
    ['+z', cos],
    ['-z', -cos],
  ];

  return towardCamera.reduce((best, current) => (current[1] > best[1] ? current : best))[0];
}
