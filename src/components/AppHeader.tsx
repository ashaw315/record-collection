'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { GRID_FORK } from '@/app/records/[id]/band-geometry';
import { currentSection } from './nav-current';

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

/**
 * §G.1 (step 74): the header is set in the record detail's system, as §4.1
 * counts it -- "Five nav items, one wordmark", mono 11, uppercase, ".12em in
 * the nav strip only" -- at line height 1 (§G.2), so the type's own box is
 * what is centred. No padding of its own (§G.3).
 */
const NAV_TYPE = 'font-mono text-[11px] leading-none uppercase tracking-[0.12em] whitespace-nowrap';

/*
  §G.8 (step 76): the widths the header changes form at, measured on step
  74's header (4 Oct) and asserted from both sides in `nav-menu-76.spec.ts`.
  584: the wordmark and five links set on one row; below it, the menu, on
  every screen. 762: the record detail's slot also fits beside the links.
  449: the slot fits beside the wordmark and the control. Constants rather
  than measured at run time, so the first paint is the right form; the type
  is fixed-pitch, so the widths are the type's and do not vary by screen.
  The classes below spell them as `max-[584px]` (below 584), `max-[762px]`
  and `min-[449px]`, because Tailwind cannot read a constant into a class.
*/
export const MENU_BELOW = 584;
export const SLOT_WITH_LINKS = 762;
export const SLOT_WITH_CONTROL = 449;

/** Not current: the label colour (§G.1); current: ink and 500 with §3's underline. */
function linkTone(active: boolean) {
  return active ? 'font-medium text-foreground' : 'font-normal text-[oklch(0.44_0.008_70)] hover:text-foreground';
}

/*
  §3: "The active nav item carries a 2px ink underline, 7px below the
  baseline", as wide as the link (§G.4). At 11px and line height 1 the
  baseline sits 9 below the box's top, so the rule's top is 16; the specs
  measure it from the baseline.
*/
function CurrentMark() {
  return <span data-current-mark="" aria-hidden="true" className="absolute top-[16px] right-0 left-0 h-[2px] bg-foreground" />;
}

export function AppHeader({ actions }: { actions?: React.ReactNode } = {}) {
  const pathname = usePathname();
  const section = currentSection(pathname);

  /*
    §G.8: the menu. Open state belongs to the path it was opened on, so a
    chosen link renders the next screen closed without an effect resetting
    it. It does not close on scroll or on a click elsewhere: it covers
    nothing. Escape closes it and returns focus to the control.
  */
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const listId = useId();
  const controlRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpenOn(null);
      controlRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

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
          /*
            §G.2 and §G.3 (step 74): the one-row height is the box's, 52 and
            the 1px rule below it making 53, with the type centred in it; the
            inset is 18 at every width, measured from the cap's edge. The 52
            is the FIRST row's (wordmark and nav each fill it), not the bar's:
            as the bar's minimum, a second row -- the slot below 1440, the
            nav's own wrap at 390 -- was squeezed inside it and pushed the
            first row off centre.
          */
          'mx-auto flex w-full flex-wrap items-center gap-x-6 px-[18px]',
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
          data-wordmark=""
          className={`${NAV_TYPE} flex h-[52px] items-center font-medium text-foreground`}
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
          /* §G.5: the nav never wraps. Below 584 its links are in the menu. */
          className="flex h-[52px] items-center gap-x-6 max-[584px]:hidden"
        >
          {LINKS.map((link) => {
            /* §G.4: the section the screen belongs to, not the link's own path. */
            const active = section === link.href;

            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  `relative ${NAV_TYPE} transition-colors`,
                  /*
                    The hit area is a 44 overlay centred on the type, as the
                    record page gives its controls (CONTROL_HEIGHT): the
                    link's own box is the 11 of its type and moves nothing.
                  */
                  "before:absolute before:inset-x-0 before:top-1/2 before:h-[44px] before:-translate-y-1/2 before:content-['']",
                  linkTone(active),
                )}
              >
                {link.label}
                {active && <CurrentMark />}
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
        {/*
          §G.8: §9.3's control -- 44 tall, a 1px ink box, no fill, no radius,
          border-box -- labelled MENU, CLOSE while open, at the row's right
          end. As wide as CLOSE plus 18 a side in both states, so it does not
          jump: five fixed-pitch advances (5ch) and their tracking (5 x .12em).
        */}
        <button
          ref={controlRef}
          type="button"
          data-menu-control=""
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpenOn(open ? null : pathname)}
          className={`${NAV_TYPE} ml-auto box-border flex h-[44px] w-[calc(5ch+0.6em+36px)] shrink-0 items-center justify-center border border-foreground font-normal text-foreground min-[584px]:hidden`}
        >
          {open ? 'Close' : 'Menu'}
        </button>

        {open && (
          <nav
            aria-label="Main"
            id={listId}
            data-menu-list=""
            /* In flow below the row, pushing the page down; before the slot's own row. */
            className="order-1 basis-full min-[584px]:hidden"
          >
            {LINKS.map((link) => {
              const active = section === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(`${NAV_TYPE} box-border flex h-[44px] items-center border-b border-border`, linkTone(active))}
                >
                  <span className="relative">
                    {link.label}
                    {active && <CurrentMark />}
                  </span>
                </Link>
              );
            })}
          </nav>
        )}

        {actions !== undefined && (
          <div
            data-slot="actions"
            /*
              §G.8's four forms: in line after the links from 762; its own
              row, right-aligned, from 584 to 761; in line after the control
              from 449 to 583; its own row below 449. Its own row is drawn 44,
              which no ruling gives.
            */
            className="ml-auto flex shrink-0 items-center gap-3 whitespace-nowrap max-[762px]:order-2 max-[762px]:h-[44px] max-[762px]:basis-full max-[762px]:justify-end max-[584px]:ml-0 min-[449px]:max-[584px]:order-none min-[449px]:max-[584px]:h-auto min-[449px]:max-[584px]:basis-auto"
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
