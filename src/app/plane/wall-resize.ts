/**
 * Watching the wall's container for a width that actually changed.
 *
 * **The scene did not rebuild on resize, and a comment claimed it did** — it
 * described a `ResizeObserver` re-running the effect "by bumping a version
 * counter", and no such counter existed. Resizing left the wall at its old
 * wrapping.
 *
 * That is worse on `/` than on `/plane`. The wall re-wraps on any width change,
 * so every slot moves, and both the rise and the return map to slots: a record
 * would rise out of a gap that is not where the gap is, and return to a slot
 * its spine has left.
 *
 * Separated from the scene because the decisions here are testable and the
 * WebGL is not. Three of them, and each is a way to get this wrong:
 *
 *   - **Report a width change**, which is the defect being fixed.
 *   - **Do NOT report an unchanged one.** `ResizeObserver` fires whenever the
 *     box changes for any reason, including the canvas being inserted — which
 *     the rebuild itself does. Forwarding every notification rebuilds the scene
 *     in response to its own rebuild: 125 meshes, textures and a WebGL context,
 *     in a loop, at ~31ms each.
 *   - **Ignore zero.** A container measured before layout reports zero, and so
 *     does one hidden by an ancestor. Building then gives a canvas nothing can
 *     be seen in and a layout with every spine on its own row.
 *
 * **Width only.** The wall's height is an OUTPUT of the layout, so watching it
 * would be watching the rebuild's own effect.
 */

export function createWidthWatcher({
  element,
  onWidth,
  Observer = ResizeObserver,
}: {
  element: HTMLElement;
  onWidth: (width: number) => void;
  /** Injectable so a test can fire a resize by hand. */
  Observer?: typeof ResizeObserver;
}): () => void {
  let reported: number | null = null;

  const measure = () => {
    /*
      The parent as a fallback: the mount div has no width until the canvas is
      in it, and the canvas cannot be built until the width is known. The parent
      is in the page's flow and has a width before anything is drawn — which is
      what breaks that circle.
    */
    const width = element.clientWidth || element.parentElement?.clientWidth || 0;

    if (width === 0 || width === reported) return;

    reported = width;
    onWidth(width);
  };

  measure();

  const observer = new Observer(measure);
  observer.observe(element.parentElement ?? element);

  return () => observer.disconnect();
}
