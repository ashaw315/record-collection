/**
 * **Step 174, §T.6: every exit the page owns asks first with the same line.** The exits manage owns below 640: a change
 * of section, a link in the app, and Back; the browser's own exits get the unload prompt. This module is the pure part:
 * which clicks are exits the page owns, so the one guard in `ManageClient` can ask before them. The history entry a row
 * adds, and the line that asks, live beside the row in `ResourceList`.
 */

export type AnchorLike = {
  href: string;
  target: string;
  /** Whether the anchor carries a `download` attribute: a save, not a navigation. */
  download: boolean;
};

export type ClickLike = {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
};

/**
 * The path a left click on an in-app link would take the page to, or null when the click is not an exit the page owns:
 * another origin, a new tab or window, a download, a modified click (a new tab by the reader's choice), a click already
 * handled, or a link to the page it is on (a hash within it is not an exit).
 */
export function inAppExit(anchor: AnchorLike, click: ClickLike, here: { origin: string; pathname: string; search: string }): string | null {
  if (click.defaultPrevented || click.button !== 0) return null;
  if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return null;
  if (anchor.download) return null;
  if (anchor.target !== '' && anchor.target !== '_self') return null;
  let url: URL;
  try {
    url = new URL(anchor.href, here.origin);
  } catch {
    return null;
  }
  if (url.origin !== here.origin) return null;
  if (url.pathname === here.pathname && url.search === here.search) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}
