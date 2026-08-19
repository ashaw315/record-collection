import { describe, expect, it, vi } from 'vitest';
import { createWidthWatcher } from './wall-resize';

/**
 * Rebuilding the wall when its container changes width.
 *
 * **The scene did not rebuild on resize, and a comment claimed it did.** It
 * said a `ResizeObserver` re-ran the effect "by bumping a version counter"; no
 * such counter existed and none ever had — a confident sentence describing a
 * mechanism that was never built.
 *
 * That matters more on `/` than on `/plane`. The wall re-wraps on any width
 * change, so every slot moves, and BOTH the rise and the return map to slots.
 * A resize mid-session leaves the scene describing a layout that no longer
 * exists: a record rises out of a gap that is not where the gap is, and returns
 * to a slot its spine has left.
 *
 * The watcher is separated from the scene because the decisions in it are
 * testable and the WebGL is not: when to rebuild, when NOT to, and what to do
 * about a width that arrives before layout has run.
 */

/** A ResizeObserver that a test can fire by hand. */
function fakeObserver() {
  let fire: (() => void) | null = null;

  class FakeResizeObserver {
    constructor(callback: () => void) {
      fire = callback;
    }
    observe() {}
    /*
      A real `ResizeObserver` stops delivering after this. The first version of
      this stub made it a no-op, so `stops reporting once disconnected` failed
      against correct code — the stub, not the watcher, was wrong.
    */
    disconnect() {
      fire = null;
    }
  }

  return {
    Observer: FakeResizeObserver as unknown as typeof ResizeObserver,
    resize: () => fire?.(),
  };
}

/** An element whose width the test controls. */
function fakeElement(width: number) {
  const element = { clientWidth: width, parentElement: null } as unknown as HTMLElement;
  return {
    element,
    setWidth: (next: number) => {
      (element as { clientWidth: number }).clientWidth = next;
    },
  };
}

describe('createWidthWatcher', () => {
  it('reports the width once at the start', () => {
    /**
     * The first build. Without this the wall never appears at all — which is
     * the failure mode the deferred-measurement version was written to avoid.
     */
    const onWidth = vi.fn();
    const { element } = fakeElement(1280);
    const { Observer } = fakeObserver();

    createWidthWatcher({ element, onWidth, Observer });

    expect(onWidth).toHaveBeenCalledWith(1280);
  });

  it('reports a NEW width when the container resizes', () => {
    /**
     * **The defect, asserted directly.** Fails against any watcher that
     * measures once and never again — which is what the scene did.
     */
    const onWidth = vi.fn();
    const { element, setWidth } = fakeElement(1280);
    const { Observer, resize } = fakeObserver();

    createWidthWatcher({ element, onWidth, Observer });
    onWidth.mockClear();

    setWidth(900);
    resize();

    expect(onWidth).toHaveBeenCalledWith(900);
  });

  it('does NOT report an unchanged width, so a rebuild is not gratuitous', () => {
    /**
     * **The half that keeps this affordable**, and the reason it is a watcher
     * rather than a raw observer.
     *
     * `ResizeObserver` fires whenever the box changes for any reason —
     * including the canvas being inserted, which the rebuild itself does. A
     * watcher that forwarded every notification would rebuild the scene in
     * response to its own rebuild: 125 meshes, textures and a WebGL context,
     * in a loop. The last unit measured that class of mistake at ~31ms per
     * rebuild.
     *
     * Height is deliberately not watched at all: the wall's height is an
     * OUTPUT of the layout, so watching it would be watching the rebuild's own
     * effect.
     */
    const onWidth = vi.fn();
    const { element } = fakeElement(1280);
    const { Observer, resize } = fakeObserver();

    createWidthWatcher({ element, onWidth, Observer });
    onWidth.mockClear();

    resize();
    resize();
    resize();

    expect(onWidth, 'same width, no rebuild').not.toHaveBeenCalled();
  });

  it('ignores a zero width rather than building an empty wall', () => {
    /**
     * Reachable: a container measured before layout has run reports zero, and
     * an element hidden by an ancestor reports zero for as long as it is
     * hidden. Building at zero produces a canvas nothing can be seen in, and —
     * worse — a `layoutWall` where every spine is on its own row.
     */
    const onWidth = vi.fn();
    const { element } = fakeElement(0);
    const { Observer } = fakeObserver();

    createWidthWatcher({ element, onWidth, Observer });

    expect(onWidth).not.toHaveBeenCalled();
  });

  it('reports the width once it becomes non-zero', () => {
    /**
     * The other half of the zero case, and the one an over-correction breaks: a
     * watcher that gave up on zero would never build the wall at all when the
     * first measurement lands early.
     */
    const onWidth = vi.fn();
    const { element, setWidth } = fakeElement(0);
    const { Observer, resize } = fakeObserver();

    createWidthWatcher({ element, onWidth, Observer });

    setWidth(1280);
    resize();

    expect(onWidth).toHaveBeenCalledWith(1280);
  });

  it('stops reporting once disconnected', () => {
    /**
     * The component unmounts while the observer is live. A watcher that kept
     * firing would rebuild a scene into a disposed context — and WebGL does not
     * complain about that, which is the silent-failure shape this feature keeps
     * meeting.
     */
    const onWidth = vi.fn();
    const { element, setWidth } = fakeElement(1280);
    const { Observer, resize } = fakeObserver();

    const stop = createWidthWatcher({ element, onWidth, Observer });
    stop();
    onWidth.mockClear();

    setWidth(900);
    resize();

    expect(onWidth).not.toHaveBeenCalled();
  });

  it('falls back to the parent when the element has no width of its own', () => {
    /**
     * The circular dependency this scene already met once: the mount div has no
     * width until the canvas is in it, and the canvas cannot be built until the
     * width is known. The parent is in the page's flow and has a width before
     * anything is drawn.
     */
    const onWidth = vi.fn();
    const element = {
      clientWidth: 0,
      parentElement: { clientWidth: 1024 },
    } as unknown as HTMLElement;
    const { Observer } = fakeObserver();

    createWidthWatcher({ element, onWidth, Observer });

    expect(onWidth).toHaveBeenCalledWith(1024);
  });
});
