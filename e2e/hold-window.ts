import type { Page } from '@playwright/test';

/**
 * **The hydration window held open, from an init script, with no product
 * change (§W.8's test instrument, 28 Oct).**
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

/** Whether the page is in the window: payload chunks held (so React is attached to a root waiting on them) and the wall not hydrated. */
export async function inTheWindow(page: Page): Promise<{ posted: number; hydrated: boolean }> {
  return page.evaluate(() => ({
    posted: (window as unknown as { __heldChunks?: number }).__heldChunks ?? 0,
    hydrated: (document.querySelector('[data-region="wall"]') as HTMLElement | null)?.dataset.hydrated === 'true',
  }));
}
