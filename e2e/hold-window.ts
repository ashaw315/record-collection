import type { Page } from '@playwright/test';

/**
 * **The wall not yet hydrated, from an init script, with no product change
 * (§W.8's test instrument, 28 Oct).**
 *
 * One instrument remains here. `holdHydration`, which held Next's payload
 * chunks and its stream close from inside the page, was removed on 5 Nov: it
 * found the close handler by a function name (`DOMContentLoaded`), its
 * comment of 29 Oct said what a changed name would do, and the first run
 * against a production build, whose bundle minifies the name, did it. The
 * state it staged for hold-160's premise test (every chunk read, the close
 * held) is made by the proxy in `document-tail.ts` holding the document's
 * end instead, which reads nothing of Next's. Its measurements stay in NOTES
 * (28 to 30 Oct, 5 Nov).
 *
 * `holdScheduler` holds the Scheduler's message channel, so React is
 * attached and its hydration scheduled but not run: the state in which React
 * hydrates synchronously on a discrete event. A click never engages the hold
 * there, since its pointerdown hydrates the wall first; Enter does, and is
 * applied in hydration's own commit (traced 29 Oct; the test is in
 * hold-160.spec.ts).
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

/** Whether the wall is hydrated: its container's own mark. */
export async function inTheWindow(page: Page): Promise<{ hydrated: boolean }> {
  return page.evaluate(() => ({
    hydrated: (document.querySelector('[data-wall-container]') as HTMLElement | null)?.dataset.hydrated === 'true',
  }));
}
