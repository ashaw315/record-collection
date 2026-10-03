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

/**
 * **§24: one `actions` slot at the bar's right end, empty on every screen but
 * records/[id].**
 *
 * §13 refused this bar for the record's controls because chrome identical on
 * six screens cannot hold a per-record control. That objection is to the
 * bar's CONTENTS being per-record, and a named slot answers it: the component
 * stays identical everywhere, and only the record page puts something in it.
 * The page fills the slot; AppHeader never decides what goes there.
 *
 * The 1 × 16 hairline at 0.72 is the slot's boundary — left of it is the
 * app's, right of it is this record's — and it is drawn only when the slot is
 * filled, because a boundary around nothing is a mark. Inline `var(--border)`
 * rather than `bg-border`, so it resolves to the token itself rather than
 * through the colour-mix Tailwind's utilities emit.
 */
/*
  The record screen is `/records/<uuid>` and nothing else under `/records/`.
  Any single segment used to match, so `/records/new` took the record page's
  uncapped measure on a page that never supplies one. Matching the id's own
  shape, rather than excluding "new", keeps any future reserved segment out
  too. The same pattern as `isUuid` in `lib/api/errors.ts`, which this
  client component cannot import.
*/
const RECORD_SCREEN = /^\/records\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function AppHeader({ actions }: { actions?: React.ReactNode } = {}) {
  const pathname = usePathname();

  /*
    The record detail screen is 8a's GRID_FORK measure (§18: twelve fixed
    120px columns, so 1440); every other screen is the
    1152 the app has used throughout. Matched on the route rather than passed as
    a prop so a screen cannot forget to say which it is and silently misalign.
  */
  const wide = RECORD_SCREEN.test(pathname) || pathname.startsWith('/wall/probe/page8a');

  /*
    §W.13: the wall starts directly under this nav and takes the full height,
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
      {/*
        `flex-wrap` and the nav's `basis-0 grow` are applied ONLY when the slot
        is filled, because §24 says no other screen changes. Wrapping the
        container unconditionally moved the nav under the wordmark at 390 on
        every screen — a wrap container breaks lines on max-content, so the
        nav's 337px left the wordmark's row rather than shrinking into it.
        `basis-0 grow` gives the nav a zero hypothetical size so it stays on
        the wordmark's row and wraps internally as it always has, and only
        the slot, at `basis-full`, takes the next row.
      */}
      <div
        className={cn(
          'mx-auto flex w-full items-baseline gap-6 px-4 py-3',
          actions !== undefined && 'flex-wrap',
        )}
        /*
          On the record screen the measure is §30's and comes from that
          page's stylesheet, which addresses `[data-app-nav] > div`: the bar
          takes the measure of the page it sits above, and above 1440 that
          page grows. Everywhere else it is the app's own 1152.
        */
        style={wide ? undefined : { maxWidth: 1152 }}
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
        <nav
          aria-label="Main"
          className={cn('-mx-1 flex min-w-0 flex-wrap gap-1', actions !== undefined && 'basis-0 grow')}
        >
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

        {/*
          Below the fork the slot takes its own row. The nav's own wrap
          (`min-w-0 flex-wrap`, above) lets it give up width, so a nowrap slot
          on the same row squeezed the five links to one per line at 390 — a
          five-row bar on the one screen that has the slot. `basis-full` under
          1440 puts the slot beneath the nav, right-aligned, and the nav keeps
          its two-row wrap. Keyed to the fork because the slot exists only on
          the record screen, which is the fixed grid above it and one column
          below.
        */}
        {actions !== undefined && (
          <div
            data-slot="actions"
            className="ml-auto flex shrink-0 items-baseline gap-3 whitespace-nowrap max-[1439px]:basis-full max-[1439px]:justify-end"
          >
            <span
              data-hairline=""
              aria-hidden="true"
              className="h-4 w-px self-center"
              style={{ background: 'var(--border)' }}
            />
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
