'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { GRID_FORK } from '@/app/records/[id]/band-geometry';

/**
 * The application's one piece of persistent chrome.
 *
 * Until now nothing linked anywhere: `/manage` was reachable only by typing
 * the URL. §10 lists ten screens, so a shell that names them has to exist
 * before the second one ships.
 *
 * Only the built screens appear. A nav advertising a screen before it exists is
 * a dead link, and a disabled item that never enables reads as broken — the
 * remaining §10 routes are added by the steps that build them, and a retired
 * one leaves here with the screen.
 */

const LINKS = [
  { href: '/', label: 'Collection' },
  { href: '/want-list', label: 'Want list' },
  // §10 calls /lookup "the in-store screen", so it belongs in reach on a
  // phone rather than behind a URL somebody has to remember.
  { href: '/lookup', label: 'Look up' },
  // Linked, not just routable: a screen nothing navigates to is the
  // unreachable-path shape that cost this build §6's genre mapping (NOTES).
  { href: '/stats', label: 'Stats' },
  // `/graph` was here until §10b retired the screen. The DATA it drew --
  // artist_memberships, artist_influences, record_genres -- survives and feeds
  // §9's suggestions, which is what it was actually useful for; drawing it
  // added a picture that told the user what they already knew.
  { href: '/manage', label: 'Manage' },
] as const;

export function AppHeader() {
  const pathname = usePathname();

  /*
    The record detail screen is 8a's GRID_FORK measure (§18: twelve fixed
    120px columns, so 1440); every other screen is the
    1152 the app has used throughout. Matched on the route rather than passed as
    a prop so a screen cannot forget to say which it is and silently misalign.
  */
  const wide = /^\/records\/[^/]+$/.test(pathname) || pathname.startsWith('/wall/probe/page8a');

  /*
    §11.13: the wall starts directly under this nav and takes the full height,
    so the nav's rendered height is published as a variable the wall's region
    subtracts from the viewport — measured rather than declared, since the
    bar's height is its type's.
  */
  const bar = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = bar.current;
    if (el === null) return;
    const publish = () => document.documentElement.style.setProperty('--app-nav-height', `${el.getBoundingClientRect().height}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <header ref={bar} data-app-nav="" className="border-b border-border">
      {/*
        **The nav shares its page's measure.**

        This bar carried `max-w-6xl` (1152) while the record page caps at the
        grid's own width,
        so on a wide display the nav was narrower than the page and left-aligned
        against it — reported from the rendered screen, and visible on the probe
        too.

        Widening it everywhere would have been the mirror defect: `/` and
        `/manage` cap their own content at 1152, and a nav wider than the content
        it sits above is the same misalignment pointing the other way. So the bar
        takes the measure of the page it is on — the grid's width where the
        page is the grid (§18 made that 1440, fixed),
        1152 where the page is 1152 — which is why this is a variable and not a
        class.
      */}
      <div
        className="mx-auto flex w-full items-baseline gap-6 px-4 py-3"
        style={{ maxWidth: wide ? GRID_FORK : 1152 }}
      >
        {/*
          **`text-sm` is NOT converted to a role, and the gap is deliberate
          (§7a, A70).** Every role in the scale answers *what is this text doing
          on this screen*; chrome is the thing that is not on a screen — it is
          around all of them. A wordmark is the app's name and the links below
          navigate BETWEEN screens rather than acting within one, so neither
          `title` nor `label` describes them.

          Forcing a role here would make twelve screens inherit one chosen
          because the list was the list. A chrome role can be added later if it
          earns one.
        */}
        {/* The wordmark is not a link to itself when already home; it stays a
            link regardless so its position never shifts between screens. */}
        <Link
          href="/"
          className="font-heading text-sm font-semibold tracking-tight whitespace-nowrap"
        >
          Record Collection
        </Link>

        {/*
          **Wraps rather than scrolls, and that is a §10 requirement rather than
          a preference.** Measured at 390px while it was one `overflow-x-auto`
          row: `scrollWidth` 337 in a `clientWidth` of 237, with Stats ending at
          409 and Manage at 478 — two of five links entirely outside the
          viewport, behind a horizontal scroll with no affordance. §10 makes
          mobile an equal priority and calls the case "standing in a record
          store", so half the app was undiscoverable exactly where it matters.

          Wrapping was chosen over a menu because a menu is a taxonomy decision
          dressed as a layout fix: it has to guess which screens are wanted in a
          shop, and it hides the answer behind an extra tap. A fade or chevron
          announces the tail without making it any easier to reach, and
          horizontal scrolling is awkward one-handed.

          `flex-wrap` alone is not enough — the row is a flex ITEM of the header
          bar, so it must be allowed to give up its intrinsic width before it
          will wrap. `min-w-0` is what permits that; without it a flex item
          floors at its content width and the wrap never fires.

          Asserted by `e2e/nav-mobile.spec.ts` at 390px, on rendered geometry:
          every link visible, inside the viewport, tappable, and overlapping no
          other. A class-name check would pass on a `flex-wrap` cancelled by an
          ancestor, which is unit 20's breakout-class defect exactly.
        */}
        <nav aria-label="Main" className="-mx-1 flex min-w-0 flex-wrap gap-1">
          {LINKS.map((link) => {
            // `/manage` must not light up on `/manage/anything`, and `/` would
            // prefix-match everything, so home is compared exactly.
            const active =
              link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);

            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-xs px-2 py-1 text-sm whitespace-nowrap transition-colors',
                  active
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
