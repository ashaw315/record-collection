import type { Page } from '@playwright/test';

/**
 * **The hydration window held open, from an init script, with no product
 * change (§W.8's test instrument, 28 Oct).**
 *
 * **Measured 30 Oct, dev server: with nothing delivered this does not make the
 * state described below.** The recorder read React not attached at 300ms and
 * at 4s past interactive, and a press took the anchor. Its one job is the
 * delivered arm, `deliverPayload`, for the premise test. The paragraphs below
 * are the 28 Oct claim, and no instrument reproduces a dropped press.
 *
 * The window the wall-route Escape flake's trace showed is React's root
 * listener attached and the wall's subtree not yet hydrated, in a state a
 * press cannot hydrate synchronously. Holding the Scheduler's message
 * channel does not make that state: React attaches its listeners and holds
 * its scheduled work, and a press, being a discrete event, has React flush
 * the root's hydration synchronously and then pulls through React, so the
 * hold script never engages (measured 28 Oct, 20:40). What makes the state
 * is the page's server payload still arriving: Next streams it as
 * `self.__next_f.push(...)` chunks in the document, its client drains the
 * array once and reassigns `push`, and React hydrates a root whose page
 * boundary waits on that data. With the chunks held, the markup is visible,
 * React is attached, the wall cannot be hydrated by a press, and a press is
 * dropped unless something ahead of React holds it. Releasing feeds the
 * chunks to Next's own callback in order, and the page hydrates as it would
 * have.
 *
 * `push` is an accessor so Next's reassignment is captured rather than
 * bypassing the hold; `forEach` yields nothing while held, since that is
 * the one-time drain.
 *
 * **Coupling, written down (the coordinator, 29 Oct).** Four things here are
 * Next's internals and not its API, read from `node_modules/next/dist/client/
 * app-index.js` on 28 Oct: (1) the payload arrives as `self.__next_f.push`
 * calls in the document; (2) the client drains that array once with
 * `forEach` and clears `length`; (3) it then reassigns `push` to its own
 * callback; (4) it closes the payload stream in a handler whose function is
 * named `DOMContentLoaded`, registered on the document while loading or on a
 * zero timeout after. A Next upgrade can change any of them, and the failure
 * will look like the hold being broken rather than the instrument. The
 * symptoms, so they are read right: if the chunks are no longer buffered,
 * the wall hydrates before the press and `openWindow`'s precondition fails,
 * "not in the window"; if the handler's name changes, the stream closes at
 * load and the release never hydrates, so the wait for the hydrated mark
 * after `releaseHydration` times out; if the drain changes shape, the page
 * hydrates with no wall or errors in the console. All three fail before any
 * hold assertion runs, and the fix is this file, not the hold.
 *
 * **The state this holds is the one that drops a press, and the first
 * instrument's is not.** Holding the Scheduler's channel leaves React able
 * to hydrate synchronously when a press arrives, and it does. `holdScheduler`
 * keeps that first instrument for the one test of the hold engaging where
 * React would have coped.
 */
export async function holdHydration(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __next_f: unknown; __releaseFlight: () => void; __heldChunks: number; __flightHeld: boolean };
    const buffered: unknown[] = [];
    let callback: ((chunk: unknown) => void) | null = null;
    w.__flightHeld = true;
    w.__heldChunks = 0;
    const store = {
      forEach(fn: (chunk: unknown) => void) { if (!w.__flightHeld) for (const c of buffered.splice(0)) fn(c); },
      get length() { return 0; },
      set length(_v: number) { /* Next clears the drained array; nothing to clear here. */ },
    };
    Object.defineProperty(store, 'push', {
      get() {
        return (chunk: unknown) => {
          if (w.__flightHeld || callback === null) { buffered.push(chunk); w.__heldChunks += 1; return; }
          callback(chunk);
        };
      },
      set(fn: (chunk: unknown) => void) { callback = fn; },
    });
    w.__next_f = store;
    /*
      Next closes its payload stream in a handler named `DOMContentLoaded`,
      registered on the document while the page is loading or, when its
      script runs after parsing as the dev server's do, on a zero timeout.
      Chunks released after that close go into a closed stream. The handler
      is held by the name it carries and run at release, after the chunks.
    */
    let heldLoaded: (() => void) | null = null;
    const realSetTimeout = window.setTimeout.bind(window) as typeof setTimeout;
    (w as unknown as { setTimeout: unknown }).setTimeout = ((fn: unknown, ...rest: unknown[]) => {
      if (w.__flightHeld && typeof fn === 'function' && (fn as { name?: string }).name === 'DOMContentLoaded') { heldLoaded = fn as () => void; return 0; }
      return (realSetTimeout as unknown as (...a: unknown[]) => number)(fn, ...rest);
    }) as typeof setTimeout;
    const realAdd = document.addEventListener.bind(document);
    document.addEventListener = ((type: string, fn: unknown, ...rest: unknown[]) => {
      if (w.__flightHeld && type === 'DOMContentLoaded' && typeof fn === 'function' && (fn as { name?: string }).name === 'DOMContentLoaded') { heldLoaded = fn as () => void; return; }
      return (realAdd as unknown as (...a: unknown[]) => void)(type, fn, ...rest);
    }) as typeof document.addEventListener;
    (w as unknown as { __deliverPayload: () => void }).__deliverPayload = () => {
      w.__flightHeld = false;
      const items = buffered.splice(0);
      if (callback !== null) for (const c of items) callback(c);
    };
    w.__releaseFlight = () => {
      w.__flightHeld = false;
      const items = buffered.splice(0);
      if (callback !== null) for (const c of items) callback(c);
      const loaded = heldLoaded;
      heldLoaded = null;
      if (loaded !== null) realSetTimeout(loaded, 0);
    };
  });
}

export async function releaseHydration(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __releaseFlight?: () => void }).__releaseFlight?.());
}

/** The payload's chunks fed to Next, with its stream's close still held: the document parsed, and nothing more. */
export async function deliverPayload(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __deliverPayload?: () => void }).__deliverPayload?.());
}

/** Whether the page is in the window: payload chunks held (so React is attached to a root waiting on them) and the wall not hydrated. */
export async function inTheWindow(page: Page): Promise<{ posted: number; hydrated: boolean }> {
  return page.evaluate(() => ({
    posted: (window as unknown as { __heldChunks?: number }).__heldChunks ?? 0,
    hydrated: (document.querySelector('[data-wall-container]') as HTMLElement | null)?.dataset.hydrated === 'true',
  }));
}

/**
 * The first instrument, kept for one test: the Scheduler's message channel
 * held, so React is attached and its hydration scheduled but not run, the
 * state in which React hydrates synchronously on a discrete event. A click
 * never engages the hold there, since its pointerdown hydrates the wall
 * first; Enter does, and is applied in hydration's own commit (traced 29
 * Oct; the test is in hold-160.spec.ts).
 */
export async function holdScheduler(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __holdScheduler: boolean; __releaseScheduler: () => void; __heldPosts: number };
    w.__holdScheduler = true;
    w.__heldPosts = 0;
    const pending: Array<() => void> = [];
    const orig = MessagePort.prototype.postMessage;
    MessagePort.prototype.postMessage = function (this: MessagePort, ...args: unknown[]) {
      if (w.__holdScheduler) { w.__heldPosts += 1; pending.push(() => (orig as (...a: unknown[]) => void).apply(this, args)); return; }
      return (orig as (...a: unknown[]) => void).apply(this, args);
    } as typeof MessagePort.prototype.postMessage;
    w.__releaseScheduler = () => { w.__holdScheduler = false; for (const f of pending.splice(0)) f(); };
  });
}

export async function releaseScheduler(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __releaseScheduler?: () => void }).__releaseScheduler?.());
}
